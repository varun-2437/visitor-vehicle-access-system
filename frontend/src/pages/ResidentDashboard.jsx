import { useState, useEffect } from "react";
import API from "../api";
import Navbar from "../components/Navbar";

export default function ResidentDashboard() {
  const [passes, setPasses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    visitor_name: "", vehicle_number: "", purpose: "", hours_valid: 24,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [qrImage, setQrImage] = useState(null);

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
    try {
      const res = await API.post("/api/qr/generate", formData);
      setMessage(`✅ QR pass generated for ${res.data.visitor_name}!`);
      setQrImage(`http://localhost:8000${res.data.qr_image_path}`);
      setFormData({ visitor_name: "", vehicle_number: "", purpose: "", hours_valid: 24 });
      fetchPasses();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to generate pass");
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

  return (
    <>
      <Navbar />
      <div className="dashboard">
        <h2>Resident Dashboard</h2>

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
            <form className="create-form" onSubmit={handleGenerate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Visitor Name *</label>
                  <input value={formData.visitor_name} onChange={(e) => setFormData({ ...formData, visitor_name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Vehicle Number</label>
                  <input value={formData.vehicle_number} onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })} placeholder="e.g. MH14DX5842" />
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
              <button type="submit" className="btn btn-primary">Generate QR Pass</button>
            </form>
          )}

          {qrImage && (
            <div className="qr-result">
              <h4>Share this QR code with your visitor:</h4>
              <img src={qrImage} alt="Visitor QR Code" className="qr-image" />
            </div>
          )}
        </div>

        <div className="panel">
          <h3>My Visitor Passes & Vehicle Status</h3>
          {passes.length === 0 ? (
            <p className="empty-state">No visitor passes yet. Click "+ New Pass" to create one.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Visitor</th>
                  <th>Vehicle</th>
                  <th>Purpose</th>
                  <th>Vehicle Status Stage</th>
                  <th>Created</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {passes.map((p) => (
                  <tr key={p.id}>
                    <td>{p.visitor_name}</td>
                    <td>{p.vehicle_number || "—"}</td>
                    <td>{p.purpose || "—"}</td>
                    <td>{renderStatusBadge(p.status)}</td>
                    <td>{new Date(p.created_at).toLocaleString()}</td>
                    <td>{new Date(p.expires_at).toLocaleString()}</td>
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
