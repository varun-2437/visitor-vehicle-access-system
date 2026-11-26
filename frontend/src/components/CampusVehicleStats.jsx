import { useState, useEffect } from "react";
import API from "../api";
import { CarIcon, VehicleEntryIcon, QrTicketIcon } from "./Icons";
import "./CampusVehicleStats.css";

export default function CampusVehicleStats({
  refreshTrigger = 0,
  onSelectInside,
  onSelectNotInside,
  onSelectVisited,
  onSelectPasses,
}) {
  const [stats, setStats] = useState({
    vehicles_inside: 0,
    not_inside_passes: 0,
    total_visited: 0,
    total_passes: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const now = new Date();
      // Calculate local start (00:00:00) and end (23:59:59) of present day
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

      const res = await API.get("/api/qr/stats", {
        params: {
          from_date: startOfToday,
          to_date: endOfToday,
        },
      });
      if (res.data) {
        setStats({
          vehicles_inside: res.data.vehicles_inside ?? 0,
          not_inside_passes: res.data.not_inside_passes ?? 0,
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
    // Poll every 12 seconds to keep live metrics updated and auto-refresh on new day
    const interval = setInterval(fetchStats, 12000);
    return () => clearInterval(interval);
  }, [refreshTrigger]);

  const handleKeyDown = (e, callback) => {
    if (callback && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      callback();
    }
  };

  return (
    <div className="campus-stats-grid" role="region" aria-label="Campus Vehicle Live Statistics">
      {/* 1. Vehicles Currently Inside Campus (Present Day) */}
      <div
        className={`campus-stat-card card-inside ${onSelectInside ? "is-clickable" : ""}`}
        onClick={onSelectInside}
        onKeyDown={(e) => handleKeyDown(e, onSelectInside)}
        role={onSelectInside ? "button" : undefined}
        tabIndex={onSelectInside ? 0 : undefined}
        title={onSelectInside ? "Click to view vehicles currently inside campus" : undefined}
      >
        <div className="campus-stat-info">
          <div className="stat-badge-row">
            <span className="stat-badge stat-badge-inside">
              <span className="stat-pulse-dot" /> Live Now
            </span>
          </div>
          <div className="campus-stat-value">
            {loading ? "…" : stats.vehicles_inside}
          </div>
          <div className="campus-stat-title">Vehicles Inside Campus</div>
          <div className="campus-stat-desc">Active inside campus (until exit)</div>
          {onSelectInside && (
            <span className="stat-click-hint">View vehicles inside ➔</span>
          )}
        </div>
        <div className="campus-stat-icon-box icon-box-inside" title="Vehicles currently inside campus today">
          <CarIcon size={26} />
        </div>
      </div>

      {/* 2. Total Vehicles Visited Today */}
      <div
        className={`campus-stat-card card-visited ${onSelectVisited ? "is-clickable" : ""}`}
        onClick={onSelectVisited}
        onKeyDown={(e) => handleKeyDown(e, onSelectVisited)}
        role={onSelectVisited ? "button" : undefined}
        tabIndex={onSelectVisited ? 0 : undefined}
        title={onSelectVisited ? "Click to view today's vehicle visits" : undefined}
      >
        <div className="campus-stat-info">
          <div className="stat-badge-row">
            <span className="stat-badge stat-badge-visited">
              ★ Today's Visits
            </span>
          </div>
          <div className="campus-stat-value">
            {loading ? "…" : stats.total_visited}
          </div>
          <div className="campus-stat-title">Total Vehicles Visited Today</div>
          <div className="campus-stat-desc">Vehicle entries &amp; exits logged today</div>
          {onSelectVisited && (
            <span className="stat-click-hint">View today's visits ➔</span>
          )}
        </div>
        <div className="campus-stat-icon-box icon-box-visited" title="Total vehicles visited today">
          <VehicleEntryIcon size={26} />
        </div>
      </div>

      {/* 3. Total Passes Generated Today */}
      <div
        className={`campus-stat-card card-passes ${onSelectPasses ? "is-clickable" : ""}`}
        onClick={onSelectPasses}
        onKeyDown={(e) => handleKeyDown(e, onSelectPasses)}
        role={onSelectPasses ? "button" : undefined}
        tabIndex={onSelectPasses ? 0 : undefined}
        title={onSelectPasses ? "Click to view today's visitor passes" : undefined}
      >
        <div className="campus-stat-info">
          <div className="stat-badge-row">
            <span className="stat-badge stat-badge-passes">
              Today's Passes
            </span>
          </div>
          <div className="campus-stat-value">
            {loading ? "…" : stats.total_passes}
          </div>
          <div className="campus-stat-title">Passes Generated Today</div>
          <div className="campus-stat-desc">Created for today's visitors</div>
          {onSelectPasses && (
            <span className="stat-click-hint">View today's passes ➔</span>
          )}
        </div>
        <div className="campus-stat-icon-box icon-box-passes" title="Total passes generated today">
          <QrTicketIcon size={26} />
        </div>
      </div>
      {/* 4. Pre-Created Passes (Not Inside Yet) */}
      <div
        className={`campus-stat-card card-not-inside ${onSelectNotInside ? "is-clickable" : ""}`}
        onClick={onSelectNotInside}
        onKeyDown={(e) => handleKeyDown(e, onSelectNotInside)}
        role={onSelectNotInside ? "button" : undefined}
        tabIndex={onSelectNotInside ? 0 : undefined}
        title={onSelectNotInside ? "Click to view pre-created passes awaiting entry" : undefined}
      >
        <div className="campus-stat-info">
          <div className="stat-badge-row">
            <span className="stat-badge stat-badge-not-inside">
              Pre-Created
            </span>
          </div>
          <div className="campus-stat-value">
            {loading ? "…" : stats.not_inside_passes}
          </div>
          <div className="campus-stat-title">Not Inside (Awaiting)</div>
          <div className="campus-stat-desc">Pre-created passes not entered yet</div>
          {onSelectNotInside && (
            <span className="stat-click-hint">View awaiting passes ➔</span>
          )}
        </div>
        <div className="campus-stat-icon-box icon-box-not-inside" title="Pre-created passes not inside campus">
          <QrTicketIcon size={26} />
        </div>
      </div>
    </div>
  );
}
