import { useState, useEffect } from "react";
import API from "../api";
import Navbar from "../components/Navbar";
import Toast from "../components/Toast";
import { formatDateTime } from "../utils/datetime";
import { exportToCSV } from "../utils/exportCsv";

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("pending"); // Default to Pending if any
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [toast, setToast] = useState({ message: "", type: "info" });
  const [formData, setFormData] = useState({
    username: "", email: "", password: "", full_name: "", role: "resident", flat_number: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleExportUsersCSV = (list, filename) => {
    exportToCSV(filename, list, [
      { label: "ID", accessor: "id" },
      { label: "Full Name", accessor: "full_name" },
      { label: "Username", accessor: "username" },
      { label: "Email", accessor: "email" },
      { label: "Role", accessor: "role" },
      { label: "Flat Number", accessor: (r) => r.flat_number || "N/A" },
      { label: "Approval Status", accessor: (r) => r.approval_status.toUpperCase() },
      { label: "Created At", accessor: (r) => formatDateTime(r.created_at) },
    ]);
    setToast({ message: `✅ Exported ${filename}`, type: "success" });
  };

  const handleExportLogsCSV = () => {
    exportToCSV("system_access_logs.csv", filteredLogs, [
      { label: "ID", accessor: "id" },
      { label: "Gate Action", accessor: (r) => r.action.toUpperCase() },
      { label: "Visitor Name", accessor: (r) => r.visitor_pass?.visitor_name || "N/A" },
      { label: "Vehicle Number", accessor: (r) => r.visitor_pass?.vehicle_number || "N/A" },
      { label: "Logged By Guard", accessor: (r) => r.guard?.full_name || "N/A" },
      { label: "Timestamp", accessor: (r) => formatDateTime(r.timestamp) },
    ]);
    setToast({ message: "✅ Exported access logs to CSV", type: "success" });
  };

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
      setMessage(`✅ User '${formData.username}' created and approved successfully!`);
      setFormData({ username: "", email: "", password: "", full_name: "", role: "resident", flat_number: "" });
      setShowCreateForm(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create user");
    }
  };

  const handleApproveUser = async (userId, username) => {
    setError("");
    setMessage("");
    try {
      await API.put(`/api/admin/users/${userId}/approve`);
      const msg = `✅ Account '${username}' has been APPROVED and activated!`;
      setMessage(msg);
      setToast({ message: msg, type: "success" });
      fetchUsers();
    } catch (err) {
      const errMsg = err.response?.data?.detail || "Failed to approve user";
      setError(errMsg);
      setToast({ message: errMsg, type: "error" });
    }
  };

  const handleRejectUser = async (userId, username) => {
    setError("");
    setMessage("");
    try {
      await API.put(`/api/admin/users/${userId}/reject`);
      const msg = `🛑 Account '${username}' has been REJECTED and moved to Rejected List.`;
      setMessage(msg);
      setToast({ message: msg, type: "warning" });
      fetchUsers();
    } catch (err) {
      const errMsg = err.response?.data?.detail || "Failed to reject user";
      setError(errMsg);
      setToast({ message: errMsg, type: "error" });
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Delete user '${username}'? This action cannot be undone.`)) return;
    setError("");
    setMessage("");
    try {
      await API.delete(`/api/admin/users/${userId}`);
      const msg = `User '${username}' deleted successfully.`;
      setMessage(msg);
      setToast({ message: msg, type: "info" });
      fetchUsers();
    } catch (err) {
      const errMsg = err.response?.data?.detail || "Failed to delete user";
      setError(errMsg);
      setToast({ message: errMsg, type: "error" });
    }
  };

  // Grouping & Filtering users by status and search query
  const filterBySearch = (list) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (u) =>
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.full_name && u.full_name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q)) ||
        (u.flat_number && u.flat_number.toLowerCase().includes(q))
    );
  };

  const pendingUsers = filterBySearch(
    users.filter((u) => u.approval_status === "pending" || (!u.is_approved && u.approval_status !== "rejected"))
  );
  const approvedUsers = filterBySearch(
    users.filter((u) => u.approval_status === "approved" || (u.is_approved && u.approval_status !== "rejected"))
  );
  const rejectedUsers = filterBySearch(
    users.filter((u) => u.approval_status === "rejected")
  );

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (log.action && log.action.toLowerCase().includes(q)) ||
      (log.visitor_pass?.vehicle_number && log.visitor_pass.vehicle_number.toLowerCase().includes(q)) ||
      (log.visitor_pass?.visitor_name && log.visitor_pass.visitor_name.toLowerCase().includes(q)) ||
      (log.guard?.full_name && log.guard.full_name.toLowerCase().includes(q))
    );
  });

  return (
    <>
      <Navbar />
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "info" })} />

      <div className="dashboard">
        <h2>Admin Console</h2>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div className="search-filter-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search users or logs by name, username, email, role, flat, vehicle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => setActiveTab("pending")}
          >
            ⏳ Pending Approvals ({pendingUsers.length})
          </button>
          <button
            className={`tab ${activeTab === "approved" ? "active" : ""}`}
            onClick={() => setActiveTab("approved")}
          >
            👥 Approved Users ({approvedUsers.length})
          </button>
          <button
            className={`tab ${activeTab === "rejected" ? "active" : ""}`}
            onClick={() => setActiveTab("rejected")}
          >
            🛑 Rejected List ({rejectedUsers.length})
          </button>
          <button
            className={`tab ${activeTab === "logs" ? "active" : ""}`}
            onClick={() => setActiveTab("logs")}
          >
            📋 System Access Logs ({logs.length})
          </button>
        </div>

        {/* Tab 1: Pending Approvals */}
        {activeTab === "pending" && (
          <div className="panel">
            <div className="panel-header">
              <h3>⏳ Pending Registration Requests</h3>
              <button className="btn btn-outline btn-sm" onClick={() => handleExportUsersCSV(pendingUsers, "pending_user_requests.csv")}>📥 Export CSV</button>
            </div>

            {pendingUsers.length === 0 ? (
              <p className="empty-state">No pending registration requests at this time.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Full Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Flat Number</th>
                    <th>Requested At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td><strong>{u.full_name}</strong></td>
                      <td><code>{u.username}</code></td>
                      <td>{u.email}</td>
                      <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                      <td>{u.flat_number || "—"}</td>
                      <td>{formatDateTime(u.created_at)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleApproveUser(u.id, u.username)}
                          >
                            ✅ Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRejectUser(u.id, u.username)}
                          >
                            ❌ Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Approved Existing Users */}
        {activeTab === "approved" && (
          <div className="panel">
            <div className="panel-header">
              <h3>👥 Approved System Users</h3>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn btn-outline btn-sm" onClick={() => handleExportUsersCSV(approvedUsers, "approved_system_users.csv")}>📥 Export CSV</button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(!showCreateForm)}>
                  {showCreateForm ? "Cancel" : "+ Create Admin User"}
                </button>
              </div>
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
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvedUsers.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td><strong>{u.full_name}</strong></td>
                    <td><code>{u.username}</code></td>
                    <td>{u.email}</td>
                    <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                    <td>{u.flat_number || "—"}</td>
                    <td><span className="badge badge-approved">🟢 APPROVED</span></td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteUser(u.id, u.username)}
                        disabled={u.role === "admin"}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Rejected Accounts List */}
        {activeTab === "rejected" && (
          <div className="panel">
            <div className="panel-header">
              <h3>🛑 Rejected Registration Requests</h3>
              <button className="btn btn-outline btn-sm" onClick={() => handleExportUsersCSV(rejectedUsers, "rejected_user_requests.csv")}>📥 Export CSV</button>
            </div>

            {rejectedUsers.length === 0 ? (
              <p className="empty-state">No rejected accounts.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Full Name</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rejectedUsers.map((u) => (
                    <tr key={u.id}>
                      <td>{u.id}</td>
                      <td><strong>{u.full_name}</strong></td>
                      <td><code>{u.username}</code></td>
                      <td>{u.email}</td>
                      <td><span className={`badge badge-${u.role}`}>{u.role}</span></td>
                      <td><span className="badge badge-expired">🛑 REJECTED</span></td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleApproveUser(u.id, u.username)}
                          >
                            ✅ Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteUser(u.id, u.username)}
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 4: System Access Logs */}
        {activeTab === "logs" && (
          <div className="panel">
            <div className="panel-header">
              <h3>Access Logs</h3>
              <button className="btn btn-outline btn-sm" onClick={handleExportLogsCSV}>📥 Export CSV</button>
            </div>
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
                      <td>{formatDateTime(log.timestamp)}</td>
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
