import { useState, useEffect } from "react";
import API from "../api";
import Navbar from "../components/Navbar";
import Toast from "../components/Toast";
import { formatDateTime } from "../utils/datetime";
import { exportToCSV } from "../utils/exportCsv";

export default function ResidentDashboard() {
  const [passes, setPasses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setQrImage(null);
    setLoading(true);
    try {
      const res = await API.post("/api/qr/generate", formData);
      const msg = `✅ QR pass generated for ${res.data.visitor_name}!`;
      setMessage(msg);
      setToast({ message: msg, type: "success" });
      setQrImage(`http://localhost:8000${res.data.qr_image_path}`);
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
      not_inside: { label: "🟡 Pass Created (Not Inside)", badge: "badge-not_inside" },
      approved: { label: "🟡 Pass Created (Not Inside)", badge: "badge-not_inside" },
      pending: { label: "🟡 Pass Created (Not Inside)", badge: "badge-not_inside" },
      in_campus: { label: "🟢 In Campus", badge: "badge-in_campus" },
      used: { label: "🟢 In Campus", badge: "badge-in_campus" },
      exited: { label: "🔵 Vehicle Exited Campus", badge: "badge-exited" },
      expired: { label: "🔴 Pass Expired", badge: "badge-expired" },
    };
    const item = map[status] || { label: status.toUpperCase(), badge: "badge-pending" };
    return <span className={`badge ${item.badge}`}>{item.label}</span>;
  };

  const vehicleValidation = (() => {
    const val = formData.vehicle_number.trim();
    if (!val) return { valid: true, msg: "" };
    const regex = /^[A-Z0-9\s-]{4,15}$/i;
    if (regex.test(val)) {
      return { valid: true, msg: "✓ Valid vehicle number format" };
    }
    return { valid: false, msg: "⚠️ Format should be e.g. MH14DX5842 or KA01AB1234" };
  })();

  const filteredPasses = passes.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (p.visitor_name && p.visitor_name.toLowerCase().includes(q)) ||
      (p.vehicle_number && p.vehicle_number.toLowerCase().includes(q)) ||
      (p.purpose && p.purpose.toLowerCase().includes(q)) ||
      (p.status && p.status.toLowerCase().includes(q))
    );
  });

  const handleExportCSV = () => {
    exportToCSV("my_visitor_passes.csv", filteredPasses, [
      { label: "Visitor Name", accessor: "visitor_name" },
      { label: "Vehicle Number", accessor: (r) => r.vehicle_number || "N/A" },
      { label: "Purpose", accessor: (r) => r.purpose || "N/A" },
      { label: "Vehicle Status", accessor: "status" },
      { label: "Created Date & Time", accessor: (r) => formatDateTime(r.created_at) },
      { label: "Expires Date & Time", accessor: (r) => formatDateTime(r.expires_at) },
    ]);
    setToast({ message: "✅ Exported your visitor passes to CSV", type: "success" });
  };

  return (
    <>
      <Navbar />
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "info" })} />

      <div className="dashboard">
        <h2>Resident Portal</h2>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div className="panel">
          <div className="panel-header">
            <h3>Generate Visitor Pass</h3>
            <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setQrImage(null); }}>
              {showForm ? "Cancel" : "+ New Pass"}
            </button>
          </div>

          {showForm && (
            <div className="form-step-container">
              <div className="breadcrumb-container" style={{ marginBottom: "16px" }}>
                <span className="breadcrumb-item active">Step 1: Fill Visitor Details</span>
                <span className="breadcrumb-separator">➔</span>
                <span className="breadcrumb-item">{qrImage ? "Step 2: QR Pass Ready" : "Step 2: Generate"}</span>
              </div>

              <form className="create-form" onSubmit={handleGenerate}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Visitor Name *</label>
                    <input value={formData.visitor_name} onChange={(e) => setFormData({ ...formData, visitor_name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Vehicle Number</label>
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
                    <label>Purpose</label>
                    <input value={formData.purpose} onChange={(e) => setFormData({ ...formData, purpose: e.target.value })} placeholder="e.g. Delivery, Guest" />
                  </div>
                  <div className="form-group">
                    <label>Valid for (hours)</label>
                    <select value={formData.hours_valid} onChange={(e) => setFormData({ ...formData, hours_valid: parseInt(e.target.value) })}>
                      <option value={1}>1 hour</option>
                      <option value={4}>4 hours</option>
                      <option value={8}>8 hours</option>
                      <option value={24}>24 hours</option>
                      <option value={48}>48 hours</option>
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <><span className="spinner"></span>Generating...</> : "Generate QR Pass"}
                </button>
              </form>
            </div>
          )}

          {qrImage && (
            <div className="qr-result">
              <h4>✅ QR Code Pass Generated Successfully:</h4>
              <img src={qrImage} alt="Visitor QR Code" className="qr-image" />
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>My Visitor Passes & Vehicle Status</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button className="btn btn-outline btn-sm" onClick={handleExportCSV}>📥 Export CSV</button>
              <button className="btn btn-outline btn-sm" onClick={fetchPasses}>🔄 Refresh</button>
            </div>
          </div>

          <div className="search-filter-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Search my passes by visitor name, vehicle number, purpose, or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {filteredPasses.length === 0 ? (
            <p className="empty-state">No matching visitor passes found.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Vehicle</th>
                  <th>Purpose</th>
                  <th>Vehicle Status Stage</th>
                  <th>Created Date & Time</th>
                  <th>Expires Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredPasses.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.visitor_name}</strong></td>
                    <td><code>{p.vehicle_number || "—"}</code></td>
                    <td>{p.purpose || "—"}</td>
                    <td>{renderStatusBadge(p.status)}</td>
                    <td>{formatDateTime(p.created_at)}</td>
                    <td>{formatDateTime(p.expires_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
