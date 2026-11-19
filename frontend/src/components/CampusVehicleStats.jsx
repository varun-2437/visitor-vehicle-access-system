import { useState, useEffect } from "react";
import API from "../api";
import { CarIcon, VehicleEntryIcon, QrTicketIcon } from "./Icons";
import "./CampusVehicleStats.css";

export default function CampusVehicleStats({ refreshTrigger = 0 }) {
  const [stats, setStats] = useState({
    vehicles_inside: 0,
    total_visited: 0,
    total_passes: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await API.get("/api/qr/stats");
      if (res.data) {
        setStats({
          vehicles_inside: res.data.vehicles_inside ?? 0,
          total_visited: res.data.total_visited ?? 0,
          total_passes: res.data.total_passes ?? 0,
        });
      }
    } catch (err) {
      console.warn("Could not load campus vehicle stats:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // Poll every 12 seconds to keep live metrics updated
    const interval = setInterval(fetchStats, 12000);
    return () => clearInterval(interval);
  }, [refreshTrigger]);

  return (
    <div className="campus-stats-grid" role="region" aria-label="Campus Vehicle Live Statistics">
      {/* 1. Total Vehicles Currently Inside Campus */}
      <div className="campus-stat-card card-inside">
        <div className="campus-stat-info">
          <div className="stat-badge-row">
            <span className="stat-badge stat-badge-inside">
              <span className="stat-pulse-dot" /> Live In Campus
            </span>
          </div>
          <div className="campus-stat-value">
            {loading ? "…" : stats.vehicles_inside}
          </div>
          <div className="campus-stat-title">Vehicles Inside Campus</div>
          <div className="campus-stat-desc">Active vehicles currently inside campus gates</div>
        </div>
        <div className="campus-stat-icon-box icon-box-inside" title="Vehicles currently inside campus">
          <CarIcon size={26} />
        </div>
      </div>

      {/* 2. Total Vehicles Visited Campus */}
      <div className="campus-stat-card card-visited">
        <div className="campus-stat-info">
          <div className="stat-badge-row">
            <span className="stat-badge stat-badge-visited">
              ★ All-Time Entries
            </span>
          </div>
          <div className="campus-stat-value">
            {loading ? "…" : stats.total_visited}
          </div>
          <div className="campus-stat-title">Total Vehicles Visited</div>
          <div className="campus-stat-desc">Cumulative campus vehicle visits recorded</div>
        </div>
        <div className="campus-stat-icon-box icon-box-visited" title="Total vehicles visited">
          <VehicleEntryIcon size={26} />
        </div>
      </div>

      {/* 3. Total Visitor Passes */}
      <div className="campus-stat-card card-passes">
        <div className="campus-stat-info">
          <div className="stat-badge-row">
            <span className="stat-badge stat-badge-passes">
              Passes Issued
            </span>
          </div>
          <div className="campus-stat-value">
            {loading ? "…" : stats.total_passes}
          </div>
          <div className="campus-stat-title">Total Passes Generated</div>
          <div className="campus-stat-desc">Pre-approved resident & walk-in passes</div>
        </div>
        <div className="campus-stat-icon-box icon-box-passes" title="Total visitor passes generated">
          <QrTicketIcon size={26} />
        </div>
      </div>
    </div>
  );
}
