import { useState, useEffect } from "react";
import API from "../api";
import Navbar from "../components/Navbar";
import Toast from "../components/Toast";
import CampusSketchBG from "../components/CampusSketchBG";
import { formatDateTime } from "../utils/datetime";
import { exportToCSV } from "../utils/exportCsv";
import {
  SearchIcon,
  SortIcon,
  ExportIcon,
  RefreshIcon,
  QrTicketIcon,
  UserPlusIcon,
  FilterIcon,
  CloseIcon,
  CalendarIcon,
  ClockIcon,
} from "../components/Icons";

export default function ResidentDashboard() {
  const [passes, setPasses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("date_desc");
  const [statusFilter, setStatusFilter] = useState("all"); // 'all', 'in_campus', 'not_inside', 'exited', 'expired'
  
  // Date Range & Time Filter state
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [datePreset, setDatePreset] = useState("all"); // 'all', 'today', 'yesterday', 'last7', 'custom'

  const [selectedPass, setSelectedPass] = useState(null);
  const [toast, setToast] = useState({ message: "", type: "info" });
  const [formData, setFormData] = useState({
    visitor_name: "", vehicle_number: "", purpose: "", hours_valid: 24,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [qrImage, setQrImage] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPasses();
  }, []);

  const fetchPasses = async () => {
    try {
      const res = await API.get("/api/qr/my-passes");
      setPasses(res.data);
    } catch (err) {
      console.error("Failed to fetch passes:", err);
    }
  };

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === "all") {
      setFromDate("");
      setToDate("");
    } else if (preset === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      setFromDate(start.toISOString().slice(0, 16));
      setToDate(end.toISOString().slice(0, 16));
    } else if (preset === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0);
      const end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59);
      setFromDate(start.toISOString().slice(0, 16));
      setToDate(end.toISOString().slice(0, 16));
    } else if (preset === "last7") {
      const start = new Date();
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      setFromDate(start.toISOString().slice(0, 16));
      setToDate(end.toISOString().slice(0, 16));
    }
  };

  const resetAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDatePreset("all");
    setFromDate("");
    setToDate("");
    setSortOrder("date_desc");
  };

  const filterByDateRange = (list, dateField = "created_at") => {
    return list.filter((item) => {
      const rawDate = item[dateField] || item.created_at;
      if (!rawDate) return true;
      if (!fromDate && !toDate) return true;

      const isoStr = (typeof rawDate === "string" && !rawDate.endsWith("Z") && !rawDate.includes("+"))
        ? rawDate + "Z"
        : rawDate;
      const itemTime = new Date(isoStr).getTime();

      if (fromDate) {
        const fromTime = new Date(fromDate).getTime();
        if (itemTime < fromTime) return false;
      }
      if (toDate) {
        const toTime = new Date(toDate).getTime();
        if (itemTime > toTime) return false;
      }
      return true;
    });
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setQrImage(null);
    setLoading(true);
    try {
      const res = await API.post("/api/qr/generate", formData);
      const msg = `QR pass generated for ${res.data.visitor_name}!`;
      setMessage(msg);
      setToast({ message: msg, type: "success" });
      setQrImage(`http://${window.location.hostname}:8000${res.data.qr_image_path}`);
      setFormData({ visitor_name: "", vehicle_number: "", purpose: "", hours_valid: 24 });
      fetchPasses();
    } catch (err) {
      const errMsg = err.response?.data?.detail || "Failed to generate pass";
      setError(errMsg);
      setToast({ message: errMsg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const renderStatusBadge = (status) => {
    const map = {
      not_inside: { label: "Pass Created (Not Inside)", badge: "badge-not_inside" },
      approved: { label: "Pass Created (Not Inside)", badge: "badge-not_inside" },
      pending: { label: "Pass Created (Not Inside)", badge: "badge-not_inside" },
      in_campus: { label: "In Campus", badge: "badge-in_campus" },
      used: { label: "In Campus", badge: "badge-in_campus" },
      exited: { label: "Vehicle Exited Campus", badge: "badge-exited" },
      expired: { label: "Pass Expired", badge: "badge-expired" },
    };
    const item = map[status] || { label: status?.toUpperCase() || "UNKNOWN", badge: "badge-pending" };
    return <span className={`badge ${item.badge}`}>{item.label}</span>;
  };

  const validateVehiclePlate = (plate) => {
    if (!plate || !plate.trim()) return { valid: true, msg: "" };
    const p = plate.trim().toUpperCase();
    const isStandardFormat = /^[A-Z0-9\s-]{4,15}$/i.test(p);
    if (!isStandardFormat) {
      return { valid: false, msg: "Format should be e.g. MH14DX5842 or KA01AB1234" };
    }
    return { valid: true, msg: "Valid vehicle license plate format" };
  };

  const vehicleValidation = validateVehiclePlate(formData.vehicle_number);

  const sortData = (list) => {
    return [...list].sort((a, b) => {
      const aId = a.id || 0;
      const bId = b.id || 0;
      const aName = (a.visitor_name || a.vehicle_number || "").toLowerCase();
      const bName = (b.visitor_name || b.vehicle_number || "").toLowerCase();
      const aDate = new Date(a.created_at || 0).getTime();
      const bDate = new Date(b.created_at || 0).getTime();

      if (sortOrder === "id_asc") return aId - bId;
      if (sortOrder === "id_desc") return bId - aId;
      if (sortOrder === "name_asc") return aName.localeCompare(bName);
      if (sortOrder === "name_desc") return bName.localeCompare(aName);
      if (sortOrder === "date_desc") return bDate - aDate;
      if (sortOrder === "date_asc") return aDate - bDate;
      return 0;
    });
  };

  const filteredPasses = sortData(filterByDateRange(passes.filter((p) => {
    if (statusFilter === "in_campus" && (p.status !== "in_campus" && p.status !== "used")) return false;
    if (statusFilter === "not_inside" && (p.status !== "not_inside" && p.status !== "approved" && p.status !== "pending")) return false;
    if (statusFilter === "exited" && p.status !== "exited") return false;
    if (statusFilter === "expired" && p.status !== "expired") return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (p.visitor_name && p.visitor_name.toLowerCase().includes(q)) ||
      (p.vehicle_number && p.vehicle_number.toLowerCase().includes(q)) ||
      (p.purpose && p.purpose.toLowerCase().includes(q)) ||
      (p.status && p.status.toLowerCase().includes(q))
    );
  }), "created_at"));

  const handleExportCSV = () => {
    exportToCSV("my_visitor_passes.csv", filteredPasses, [
      { label: "Visitor Name", accessor: "visitor_name" },
      { label: "Vehicle Number", accessor: (r) => r.vehicle_number || "N/A" },
      { label: "Purpose", accessor: (r) => r.purpose || "N/A" },
      { label: "Vehicle Status", accessor: "status" },
      { label: "Created Date & Time", accessor: (r) => formatDateTime(r.created_at) },
      { label: "Expires Date & Time", accessor: (r) => formatDateTime(r.expires_at) },
    ]);
    setToast({ message: "Exported your visitor passes to CSV", type: "success" });
  };

  return (
    <>
      <CampusSketchBG />
      <Navbar />
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "info" })} />

      <div className="dashboard">
        <h2>Resident Portal</h2>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div className="panel">
          <div className="panel-header">
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><QrTicketIcon size={20} /> Generate Visitor Pass</h3>
            <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setQrImage(null); }} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {showForm ? "Cancel" : <><UserPlusIcon size={16} /> New Pass</>}
            </button>
          </div>

          {showForm && (
            <div className="form-step-container">
              <div className="breadcrumb-container" style={{ marginBottom: "16px" }}>
                <span className="breadcrumb-item active">Step 1: Fill Visitor Details</span>
                <span className="breadcrumb-separator">➔</span>
                <span className="breadcrumb-item">{qrImage ? "Step 2: QR Pass Ready" : "Step 2: Generate"}</span>
              </div>

              {(() => {
                const isGenerateDisabled = loading || !formData.visitor_name.trim() || (formData.vehicle_number && !vehicleValidation.valid);

                return (
                  <form className="create-form" onSubmit={handleGenerate}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>
                          Visitor Name <span style={{ color: "var(--primary)", fontWeight: "bold" }}>*</span>
                        </label>
                        <input value={formData.visitor_name} onChange={(e) => setFormData({ ...formData, visitor_name: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label>
                          Vehicle Number <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: "normal" }}>(Optional)</span>
                        </label>
                        <input
                          value={formData.vehicle_number}
                          onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value.toUpperCase() })}
                          placeholder="e.g. MH14DX5842"
                        />
                        {formData.vehicle_number && (
                          <small style={{ color: vehicleValidation.valid ? "var(--success)" : "var(--danger)", fontSize: "0.8rem", marginTop: "4px", display: "block" }}>
                            {vehicleValidation.msg}
                          </small>
                        )}
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>
                          Purpose <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: "normal" }}>(Optional)</span>
                        </label>
                        <input value={formData.purpose} onChange={(e) => setFormData({ ...formData, purpose: e.target.value })} placeholder="e.g. Delivery, Guest" />
                      </div>
                      <div className="form-group">
                        <label>
                          Valid for (hours) <span style={{ color: "var(--primary)", fontWeight: "bold" }}>*</span>
                        </label>
                        <select value={formData.hours_valid} onChange={(e) => setFormData({ ...formData, hours_valid: parseInt(e.target.value) })}>
                          <option value={1}>1 hour</option>
                          <option value={4}>4 hours</option>
                          <option value={8}>8 hours</option>
                          <option value={24}>24 hours</option>
                          <option value={48}>48 hours</option>
                        </select>
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={isGenerateDisabled} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      {loading ? <><span className="spinner"></span>Generating...</> : <><QrTicketIcon size={16} /> Generate QR Pass</>}
                    </button>
                  </form>
                );
              })()}
            </div>
          )}

          {qrImage && (
            <div className="qr-result">
              <h4 style={{ display: "flex", alignItems: "center", gap: "6px" }}><QrTicketIcon size={18} /> Entry QR Code Pass Generated Successfully:</h4>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "8px" }}>
                Provide this QR code to your visitor for scanning at the entry gate. Once the vehicle enters campus, your pass will automatically update to display the <strong>Exit QR Code</strong>.
              </p>
              <img src={qrImage} alt="Visitor QR Code" className="qr-image" />
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><QrTicketIcon size={20} /> My Visitor Passes & Vehicle Status</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn btn-outline btn-sm" onClick={handleExportCSV} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><ExportIcon size={14} /> Export CSV</button>
              <button className="btn btn-outline btn-sm" onClick={fetchPasses} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><RefreshIcon size={14} /> Refresh</button>
            </div>
          </div>

          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px", marginBottom: "20px" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
              <div className="search-filter-box" style={{ flex: 1, minWidth: "240px", marginBottom: 0 }}>
                <SearchIcon className="search-icon" size={16} />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search my passes by visitor name, vehicle number, purpose, or status..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px" }}>
                  <FilterIcon size={16} /> Filter Status:
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    padding: "10px 14px",
                    fontSize: "0.875rem",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-input)",
                    color: "var(--text)",
                    fontWeight: 500,
                    cursor: "pointer"
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="in_campus">In Campus Only</option>
                  <option value="not_inside">Not Inside (Pass Created)</option>
                  <option value="exited">Vehicle Exited Only</option>
                  <option value="expired">Pass Expired Only</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px" }}>
                  <SortIcon size={16} /> Sort By:
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  style={{
                    padding: "10px 14px",
                    fontSize: "0.875rem",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-input)",
                    color: "var(--text)",
                    fontWeight: 500,
                    cursor: "pointer"
                  }}
                >
                  <option value="date_desc">Created: Newest First</option>
                  <option value="date_asc">Created: Oldest First</option>
                  <option value="name_asc">Visitor Name: A to Z</option>
                  <option value="name_desc">Visitor Name: Z to A</option>
                </select>
              </div>
            </div>

            {/* Date Presets & Date Range Search Bar */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <CalendarIcon size={16} style={{ color: "var(--primary)" }} />
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)" }}>Date Presets:</span>
                <div style={{ display: "flex", gap: "4px" }}>
                  <button type="button" className={`btn btn-sm ${datePreset === "all" ? "btn-primary" : "btn-outline"}`} onClick={() => applyDatePreset("all")}>All Time</button>
                  <button type="button" className={`btn btn-sm ${datePreset === "today" ? "btn-primary" : "btn-outline"}`} onClick={() => applyDatePreset("today")}>Today</button>
                  <button type="button" className={`btn btn-sm ${datePreset === "yesterday" ? "btn-primary" : "btn-outline"}`} onClick={() => applyDatePreset("yesterday")}>Yesterday</button>
                  <button type="button" className={`btn btn-sm ${datePreset === "last7" ? "btn-primary" : "btn-outline"}`} onClick={() => applyDatePreset("last7")}>Last 7 Days</button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto", flexWrap: "wrap" }}>
                <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                  <ClockIcon size={14} /> From:
                </label>
                <input
                  type="datetime-local"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setDatePreset("custom"); }}
                  style={{ padding: "6px 10px", fontSize: "0.8rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text)" }}
                />

                <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                  <ClockIcon size={14} /> To:
                </label>
                <input
                  type="datetime-local"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setDatePreset("custom"); }}
                  style={{ padding: "6px 10px", fontSize: "0.8rem", borderRadius: "var(--radius)", border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text)" }}
                />

                {(fromDate || toDate || searchQuery || statusFilter !== "all" || datePreset !== "all") && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={resetAllFilters} style={{ fontSize: "0.8rem" }}>
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredPasses.length === 0 ? (
            <p className="empty-state">No matching visitor passes found.</p>
          ) : (
            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Vehicle</th>
                    <th>Purpose</th>
                    <th>Vehicle Status Stage</th>
                    <th>Created Date & Time</th>
                    <th>Action / QR Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPasses.map((p) => (
                    <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setSelectedPass(p)}>
                      <td><strong>{p.visitor_name}</strong></td>
                      <td><code>{p.vehicle_number || "—"}</code></td>
                      <td>{p.purpose || "—"}</td>
                      <td>{renderStatusBadge(p.status)}</td>
                      <td>{formatDateTime(p.created_at)}</td>
                      <td>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={(e) => { e.stopPropagation(); setSelectedPass(p); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                        >
                          <QrTicketIcon size={14} />
                          {(p.status === "in_campus" || p.status === "used") ? "View Exit QR" : "View Pass QR"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Selected Pass Details & Exit/Entry QR Modal */}
      {selectedPass && (
        <div className="modal-overlay" onClick={() => setSelectedPass(null)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "20px" }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "24px", maxWidth: "480px", width: "100%", position: "relative", boxShadow: "0 10px 25px rgba(0,0,0,0.15)" }}>
            <button className="btn-close" onClick={() => setSelectedPass(null)} style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", cursor: "pointer" }}><CloseIcon size={18} /></button>
            
            <h3 style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <QrTicketIcon size={22} /> Pass Details: {selectedPass.visitor_name}
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px" }}>
              Vehicle Number: <code>{selectedPass.vehicle_number || "Walk-in / N/A"}</code> | Purpose: {selectedPass.purpose || "General Visit"}
            </p>

            <div style={{ marginBottom: "16px", textAlign: "center" }}>
              {renderStatusBadge(selectedPass.status)}
            </div>

            {/* CONDITIONAL EXIT QR CODE DISPLAY: Show Exit QR Code ONLY when vehicle is inside campus */}
            {(selectedPass.status === "in_campus" || selectedPass.status === "used") ? (
              <div style={{ background: "rgba(4, 120, 87, 0.06)", border: "1px solid var(--success-border)", borderRadius: "var(--radius)", padding: "16px", textAlign: "center" }}>
                <span className="badge badge-in_campus" style={{ marginBottom: "8px", display: "inline-block" }}>🚗 VEHICLE IS INSIDE CAMPUS</span>
                <h4 style={{ margin: "4px 0 8px 0", color: "var(--success)" }}>EXIT QR CODE</h4>
                <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginBottom: "12px" }}>
                  Present this <strong>Exit QR Code</strong> to the Security Guard when the vehicle exits the campus gate.
                </p>
                <img src={`http://${window.location.hostname}:8000${selectedPass.qr_image_path}`} alt="Exit QR Code" style={{ width: "200px", height: "200px", borderRadius: "8px", border: "2px solid var(--success-border)" }} />
              </div>
            ) : (selectedPass.status === "not_inside" || selectedPass.status === "approved" || selectedPass.status === "pending") ? (
              <div style={{ background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px", textAlign: "center" }}>
                <span className="badge badge-not_inside" style={{ marginBottom: "8px", display: "inline-block" }}>⏳ VEHICLE NOT INSIDE CAMPUS YET</span>
                <h4 style={{ margin: "4px 0 8px 0", color: "var(--primary)" }}>ENTRY QR CODE</h4>
                <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginBottom: "12px" }}>
                  Present this <strong>Entry QR Code</strong> to the Security Guard at the entrance gate.
                </p>
                <img src={`http://${window.location.hostname}:8000${selectedPass.qr_image_path}`} alt="Entry QR Code" style={{ width: "200px", height: "200px", borderRadius: "8px", border: "1px solid var(--border)" }} />
              </div>
            ) : selectedPass.status === "exited" ? (
              <div style={{ background: "rgba(15, 23, 42, 0.04)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px", textAlign: "center" }}>
                <span className="badge badge-exited" style={{ marginBottom: "8px", display: "inline-block" }}>✅ VEHICLE HAS EXITED CAMPUS</span>
                <h4 style={{ margin: "4px 0 8px 0", color: "var(--text-muted)" }}>VISIT COMPLETED</h4>
                <p style={{ fontSize: "0.825rem", color: "var(--text-muted)" }}>
                  This vehicle has completed its visit and exited the campus. The QR code pass is now deactivated.
                </p>
              </div>
            ) : (
              <div style={{ background: "rgba(159, 18, 57, 0.04)", border: "1px solid var(--danger-border)", borderRadius: "var(--radius)", padding: "20px", textAlign: "center" }}>
                <span className="badge badge-expired" style={{ marginBottom: "8px", display: "inline-block" }}>⚠️ PASS EXPIRED</span>
                <h4 style={{ margin: "4px 0 8px 0", color: "var(--danger)" }}>PASS EXPIRED</h4>
                <p style={{ fontSize: "0.825rem", color: "var(--text-muted)" }}>
                  This visitor pass validity period has expired. Please generate a new pass.
                </p>
              </div>
            )}

            <div style={{ marginTop: "20px", textAlign: "right" }}>
              <button className="btn btn-outline" onClick={() => setSelectedPass(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
