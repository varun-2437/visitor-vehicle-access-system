import { useState, useEffect } from "react";
import API from "../api";
import Navbar from "../components/Navbar";

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("users");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    username: "", email: "", password: "", full_name: "", role: "resident", flat_number: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchUsers();
    fetchLogs();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await API.get("/api/admin/users");
      setUsers(res.data);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await API.get("/api/admin/logs");
      setLogs(res.data);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await API.post("/api/auth/register", formData);
      setMessage(`User '${formData.username}' created successfully!`);
      setFormData({ username: "", email: "", password: "", full_name: "", role: "resident", flat_number: "" });
      setShowCreateForm(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create user");
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Delete user '${username}'? This action cannot be undone.`)) return;
    try {
      await API.delete(`/api/admin/users/${userId}`);
      setMessage(`User '${username}' deleted.`);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete user");
    }
  };

  return (
    <>
      <Navbar />
      <div className="dashboard">
        <h2>Admin Dashboard</h2>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div className="tabs">
          <button className={`tab ${activeTab === "users" ? "active" : ""}`} onClick={() => setActiveTab("users")}>
            👥 Users ({users.length})
          </button>
          <button className={`tab ${activeTab === "logs" ? "active" : ""}`} onClick={() => setActiveTab("logs")}>
            📋 Access Logs ({logs.length})
          </button>
        </div>

        {activeTab === "users" && (
          <div className="panel">
            <div className="panel-header">
              <h3>User Management</h3>
              <button className="btn btn-primary" onClick={() => setShowCreateForm(!showCreateForm)}>
                {showCreateForm ? "Cancel" : "+ Create User"}
              </button>
            </div>

            {showCreateForm && (
              <form className="create-form" onSubmit={handleCreateUser}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Username</label>
                    <input value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Role</label>
                    <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                      <option value="resident">Resident</option>
                      <option value="guard">Security Guard</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Flat Number (Residents only)</label>
                    <input value={formData.flat_number} onChange={(e) => setFormData({ ...formData, flat_number: e.target.value })} placeholder="e.g. A-101" />
                  </div>
                </div>
                <button type="submit" className="btn btn-primary">Create User</button>
              </form>
            )}

            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Flat</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.full_name}</td>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                    <td>{u.flat_number || "—"}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u.id, u.username)} disabled={u.role === "admin"}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "logs" && (
          <div className="panel">
            <h3>Access Logs</h3>
            {logs.length === 0 ? (
              <p className="empty-state">No access logs yet. Logs appear when a guard scans a QR code.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Action</th>
                    <th>Visitor</th>
                    <th>Vehicle</th>
                    <th>Scanned By</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{log.id}</td>
                      <td><span className={`badge badge-${log.action}`}>{log.action.toUpperCase()}</span></td>
                      <td>{log.visitor_pass?.visitor_name || "—"}</td>
                      <td>{log.visitor_pass?.vehicle_number || "—"}</td>
                      <td>{log.guard?.full_name || "—"}</td>
                      <td>{new Date(log.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  );
}
