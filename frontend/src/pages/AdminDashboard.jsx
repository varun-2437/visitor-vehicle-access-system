import { useState, useEffect } from "react";
import API from "../api";
import Navbar from "../components/Navbar";
import Toast from "../components/Toast";
import CampusSketchBG from "../components/CampusSketchBG";
import { formatDateTime, getDateKey, formatDateGroupHeader } from "../utils/datetime";
import { exportToCSV } from "../utils/exportCsv";
import {
  SearchIcon,
  SortIcon,
  PendingIcon,
  ApprovedUsersIcon,
  RejectedIcon,
  LogsIcon,
  ExportIcon,
  UserPlusIcon,
  CheckIcon,
  TrashIcon,
  FilterIcon,
  CalendarIcon,
  ClockIcon,
} from "../components/Icons";

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("pending");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState("id_asc");
  const [roleFilter, setRoleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [datePreset, setDatePreset] = useState("all");
  const [visibleCounts, setVisibleCounts] = useState({});

  const [toast, setToast] = useState({ message: "", type: "info" });
  const [formData, setFormData] = useState({
    username: "", email: "", password: "", full_name: "", role: "resident", flat_number: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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
    setRoleFilter("all");
    setActionFilter("all");
    setDatePreset("all");
    setFromDate("");
    setToDate("");
    setSortOrder("id_asc");
  };

  const handleExportUsersCSV = (list, filename) => {
    exportToCSV(filename, list, [
      { label: "ID", accessor: "id" },
      { label: "Full Name", accessor: "full_name" },
      { label: "Username", accessor: "username" },
      { label: "Email", accessor: "email" },
      { label: "Role", accessor: "role" },
      { label: "Flat Number", accessor: (r) => r.flat_number || "N/A" },
      { label: "Approval Status", accessor: (r) => r.approval_status.toUpperCase() },
      { label: "Rejection Reason", accessor: (r) => r.rejection_reason || "N/A" },
      { label: "Created At", accessor: (r) => formatDateTime(r.created_at) },
    ]);
    setToast({ message: `Exported ${filename}`, type: "success" });
  };

  const handleExportLogsCSV = () => {
    exportToCSV("system_access_logs.csv", dateFilteredLogs, [
      { label: "ID", accessor: "id" },
      { label: "Gate Action", accessor: (r) => r.action.toUpperCase() },
      { label: "Visitor Name", accessor: (r) => r.visitor_pass?.visitor_name || "N/A" },
      { label: "Vehicle Number", accessor: (r) => r.visitor_pass?.vehicle_number || "N/A" },
      { label: "Logged By Guard", accessor: (r) => r.guard?.full_name || "N/A" },
      { label: "Timestamp", accessor: (r) => formatDateTime(r.timestamp) },
    ]);
    setToast({ message: "Exported access logs to CSV", type: "success" });
  };

  useEffect(() => {
    fetchUsers();
    fetchLogs();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await API.get("/api/admin/users");
      setUsers(res.data);
      if (res.data.some((u) => u.approval_status === "pending" || (!u.is_approved && u.approval_status !== "rejected"))) {
        setActiveTab("pending");
      } else {
        setActiveTab("approved");
      }
    } catch (err) {
      setError("Failed to fetch users list");
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await API.get("/api/admin/logs");
      setLogs(res.data);
    } catch (err) {
      console.error("Failed to fetch access logs:", err);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await API.post("/api/auth/register", formData);
      setMessage(`User '${formData.username}' created and approved successfully!`);
      setFormData({ username: "", email: "", password: "", full_name: "", role: "resident", flat_number: "" });
      setShowCreateForm(false);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create user");
    }
  };

  const handleApproveUser = async (userId, username) => {
    try {
      await API.put(`/api/admin/users/${userId}/approve`);
      const msg = `Account '${username}' has been APPROVED and activated!`;
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
    const reason = window.prompt(
      `Enter rejection reason for account '${username}':`,
      "Application details could not be verified by Admin."
    );
    if (reason === null) return;
    try {
      await API.put(`/api/admin/users/${userId}/reject`, { rejection_reason: reason });
      const msg = `Account '${username}' REJECTED (Reason: "${reason}").`;
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

  const sortData = (list) => {
    return [...list].sort((a, b) => {
      const aId = a.id || 0;
      const bId = b.id || 0;
      const aName = (a.full_name || a.username || a.visitor_pass?.visitor_name || "").toLowerCase();
      const bName = (b.full_name || b.username || b.visitor_pass?.visitor_name || "").toLowerCase();
      const aDate = new Date(a.created_at || a.timestamp || 0).getTime();
      const bDate = new Date(b.created_at || b.timestamp || 0).getTime();

      if (sortOrder === "id_asc") return aId - bId;
      if (sortOrder === "id_desc") return bId - aId;
      if (sortOrder === "name_asc") return aName.localeCompare(bName);
      if (sortOrder === "name_desc") return bName.localeCompare(aName);
      if (sortOrder === "date_desc") return bDate - aDate;
      if (sortOrder === "date_asc") return aDate - bDate;
      return 0;
    });
  };

  const filterByRole = (list) => {
    if (roleFilter === "all") return list;
    if (roleFilter === "admin") return list.filter((u) => u.role === "admin");
    if (roleFilter === "resident") return list.filter((u) => u.role === "resident");
    if (roleFilter === "guard") return list.filter((u) => u.role === "guard");
    if (roleFilter === "other") return list.filter((u) => u.role !== "admin" && u.role !== "resident" && u.role !== "guard");
    return list;
  };

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

  const filterByDateRange = (list, dateField = "timestamp") => {
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

  const pendingUsers = sortData(filterByDateRange(filterByRole(filterBySearch(
    users.filter((u) => u.approval_status === "pending" || (!u.is_approved && u.approval_status !== "rejected"))
  )), "created_at"));
  
  const approvedUsers = sortData(filterByDateRange(filterByRole(filterBySearch(
    users.filter((u) => u.approval_status === "approved" || (u.is_approved && u.approval_status !== "rejected"))
  )), "created_at"));
  
  const rejectedUsers = sortData(filterByDateRange(filterByRole(filterBySearch(
    users.filter((u) => u.approval_status === "rejected")
  )), "created_at"));

  const filteredLogs = sortData(logs.filter((log) => {
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (log.action && log.action.toLowerCase().includes(q)) ||
      (log.visitor_pass?.vehicle_number && log.visitor_pass.vehicle_number.toLowerCase().includes(q)) ||
      (log.visitor_pass?.visitor_name && log.visitor_pass.visitor_name.toLowerCase().includes(q)) ||
      (log.guard?.full_name && log.guard.full_name.toLowerCase().includes(q))
    );
  }));

  const dateFilteredLogs = filterByDateRange(filteredLogs, "timestamp");

  const groupedLogs = (() => {
    const groups = {};
    dateFilteredLogs.forEach((log) => {
      const key = getDateKey(log.timestamp);
      if (!groups[key]) groups[key] = [];
      groups[key].push(log);
    });

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => ({
        dateKey: key,
        dateLabel: formatDateGroupHeader(key),
        logs: groups[key],
      }));
  })();

  const handleShowTenMore = (dateKey) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [dateKey]: (prev[dateKey] || 10) + 10,
    }));
  };

  const handleViewAllForDay = (dateKey, totalCount) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [dateKey]: totalCount,
    }));
  };

  const handleCollapseDay = (dateKey) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [dateKey]: 10,
    }));
  };

  const toggleSort = (field) => {
    if (field === "id") {
      setSortOrder((prev) => (prev === "id_asc" ? "id_desc" : "id_asc"));
    } else if (field === "name") {
      setSortOrder((prev) => (prev === "name_asc" ? "name_desc" : "name_asc"));
    } else if (field === "date") {
      setSortOrder((prev) => (prev === "date_desc" ? "date_asc" : "date_desc"));
    }
  };

  return (
    <>
      <CampusSketchBG />
      <Navbar />
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "info" })} />

      <div className="dashboard">
        <h2>Admin Console</h2>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
            <div className="search-filter-box" style={{ flex: 1, minWidth: "260px", marginBottom: 0 }}>
              <SearchIcon className="search-icon" size={16} />
              <input
                type="text"
                className="search-input"
                placeholder="Search users or logs by name, username, email, role, flat, vehicle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {activeTab !== "logs" ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px" }}>
                  <FilterIcon size={16} /> Filter Role:
                </label>
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
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
                  <option value="all">All Roles</option>
                  <option value="admin">Admins Only</option>
                  <option value="resident">Residents Only</option>
                  <option value="guard">Guards Only</option>
                  <option value="other">Others Only</option>
                </select>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px" }}>
                  <FilterIcon size={16} /> Filter Action:
                </label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
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
                  <option value="all">All Gate Actions</option>
                  <option value="entry">Vehicle Entry Only</option>
                  <option value="exit">Vehicle Exit Only</option>
                </select>
              </div>
            )}

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
                <option value="id_asc">ID: Ascending (1 ➔ N)</option>
                <option value="id_desc">ID: Descending (N ➔ 1)</option>
                <option value="name_asc">Name: A to Z</option>
                <option value="name_desc">Name: Z to A</option>
                <option value="date_desc">Created/Time: Newest First</option>
                <option value="date_asc">Created/Time: Oldest First</option>
              </select>
            </div>
          </div>

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

              {(fromDate || toDate || searchQuery || roleFilter !== "all" || actionFilter !== "all" || datePreset !== "all") && (
                <button type="button" className="btn btn-outline btn-sm" onClick={resetAllFilters} style={{ fontSize: "0.8rem" }}>
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === "pending" ? "active" : ""}`}
            onClick={() => setActiveTab("pending")}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <PendingIcon size={16} /> Pending Approvals ({pendingUsers.length})
          </button>
          <button
            className={`tab ${activeTab === "approved" ? "active" : ""}`}
            onClick={() => setActiveTab("approved")}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <ApprovedUsersIcon size={16} /> Approved Users ({approvedUsers.length})
          </button>
          <button
            className={`tab ${activeTab === "rejected" ? "active" : ""}`}
            onClick={() => setActiveTab("rejected")}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <RejectedIcon size={16} /> Rejected List ({rejectedUsers.length})
          </button>
          <button
            className={`tab ${activeTab === "logs" ? "active" : ""}`}
            onClick={() => setActiveTab("logs")}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <LogsIcon size={16} /> System Access Logs ({dateFilteredLogs.length})
          </button>
        </div>

        {activeTab === "pending" && (
          <div className="panel">
            <div className="panel-header">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><PendingIcon size={18} /> Pending Registration Requests</h3>
              <button className="btn btn-outline btn-sm" onClick={() => handleExportUsersCSV(pendingUsers, "pending_user_requests.csv")} style={{ display: "flex", alignItems: "center", gap: "4px" }}><ExportIcon size={14} /> Export CSV</button>
            </div>

            {pendingUsers.length === 0 ? (
              <p className="empty-state">No pending registration requests matching your filter criteria.</p>
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
                            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <CheckIcon size={14} /> Approve
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRejectUser(u.id, u.username)}
                            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <TrashIcon size={14} /> Reject
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

        {activeTab === "approved" && (
          <div className="panel">
            <div className="panel-header">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><ApprovedUsersIcon size={18} /> Approved System Users</h3>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn btn-outline btn-sm" onClick={() => handleExportUsersCSV(approvedUsers, "approved_system_users.csv")} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><ExportIcon size={14} /> Export CSV</button>
                <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(!showCreateForm)} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  {showCreateForm ? "Cancel" : <><UserPlusIcon size={14} /> Create Admin User</>}
                </button>
              </div>
            </div>

            {showCreateForm && (() => {
              const isCreateUserDisabled = !formData.full_name.trim() || !formData.username.trim() || !formData.email.trim() || !formData.password.trim() || (formData.role === "resident" && !formData.flat_number.trim());
              return (
                <form className="create-form" onSubmit={handleCreateUser}>
                  <div className="form-row">
                    <div className="form-group"><label>Full Name *</label><input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required /></div>
                    <div className="form-group"><label>Username *</label><input value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} required /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Email *</label><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required /></div>
                    <div className="form-group"><label>Password *</label><input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label>Role *</label><select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}><option value="resident">Resident</option><option value="guard">Security Guard</option><option value="admin">Admin</option></select></div>
                    <div className="form-group"><label>Flat Number {formData.role === "resident" && "*"}</label><input value={formData.flat_number} onChange={(e) => setFormData({ ...formData, flat_number: e.target.value })} required={formData.role === "resident"} /></div>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={isCreateUserDisabled}>Create User</button>
                </form>
              );
            })()}

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
                    <td><span className="badge badge-approved">APPROVED</span></td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u.id, u.username)} disabled={u.role === "admin"}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "rejected" && (
          <div className="panel">
            <div className="panel-header">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}><RejectedIcon size={18} /> Rejected Registration Requests</h3>
              <button className="btn btn-outline btn-sm" onClick={() => handleExportUsersCSV(rejectedUsers, "rejected_user_requests.csv")} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><ExportIcon size={14} /> Export CSV</button>
            </div>

            {rejectedUsers.length === 0 ? (
              <p className="empty-state">No rejected accounts matching your filter criteria.</p>
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
                    <th>Rejection Reason</th>
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
                      <td><span className="badge badge-expired">REJECTED</span></td>
                      <td><code style={{ color: "var(--danger)" }}>{u.rejection_reason || "Application details could not be verified by Admin."}</code></td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button className="btn btn-primary btn-sm" onClick={() => handleApproveUser(u.id, u.username)}>Approve</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteUser(u.id, u.username)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === "logs" && (
          <div className="panel">
            <div className="panel-header">
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <LogsIcon size={18} /> Access Activity Logs ({dateFilteredLogs.length} Records)
              </h3>
              <button className="btn btn-outline btn-sm" onClick={handleExportLogsCSV} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <ExportIcon size={14} /> Export CSV
              </button>
            </div>

            {groupedLogs.length === 0 ? (
              <p className="empty-state">No matching vehicle access logs found for the selected date range and filter criteria.</p>
            ) : (
              groupedLogs.map((group) => {
                const visibleLimit = visibleCounts[group.dateKey] || 10;
                const displayedLogs = group.logs.slice(0, visibleLimit);
                const entryCount = group.logs.filter((l) => l.action === "entry").length;
                const exitCount = group.logs.filter((l) => l.action === "exit").length;

                return (
                  <div key={group.dateKey} className="date-group-card" style={{ marginBottom: "24px", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", background: "var(--bg-card)" }}>
                    <div className="date-group-header" style={{ padding: "14px 18px", background: "var(--bg-input)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                      <h4 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <CalendarIcon size={18} style={{ color: "var(--primary)" }} /> {group.dateLabel}
                      </h4>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span className="badge badge-approved" style={{ fontSize: "0.78rem" }}>
                          Total: {group.logs.length} Vehicles ({entryCount} ENTRY, {exitCount} EXIT)
                        </span>
                        {group.logs.length > 10 && (
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
                            Showing {displayedLogs.length} of {group.logs.length}
                          </span>
                        )}
                      </div>
                    </div>

                    <table className="data-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Action</th>
                          <th>Visitor Name</th>
                          <th>Vehicle Number</th>
                          <th>Scanned By Guard</th>
                          <th>Time Recorded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedLogs.map((log) => (
                          <tr key={log.id}>
                            <td>{log.id}</td>
                            <td><span className={`badge badge-${log.action}`}>{log.action.toUpperCase()}</span></td>
                            <td><strong>{log.visitor_pass?.visitor_name || "—"}</strong></td>
                            <td><code>{log.visitor_pass?.vehicle_number || "—"}</code></td>
                            <td>{log.guard?.full_name || "—"}</td>
                            <td>{formatDateTime(log.timestamp)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {group.logs.length > 10 && (
                      <div style={{ padding: "12px 18px", background: "var(--bg-card)", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                        <div style={{ display: "flex", gap: "8px" }}>
                          {displayedLogs.length < group.logs.length && (
                            <>
                              <button className="btn btn-outline btn-sm" onClick={() => handleShowTenMore(group.dateKey)}>
                                + Show 10 More ({group.logs.length - displayedLogs.length} remaining)
                              </button>
                              <button className="btn btn-primary btn-sm" onClick={() => handleViewAllForDay(group.dateKey, group.logs.length)}>
                                View All ({group.logs.length}) Vehicles
                              </button>
                            </>
                          )}
                        </div>
                        {visibleLimit > 10 && (
                          <button className="btn btn-outline btn-sm" onClick={() => handleCollapseDay(group.dateKey)}>
                            Collapse to 10
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  );
}
