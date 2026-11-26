import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import LiveClock from "./LiveClock";
import OfflineBanner from "./OfflineBanner";
import vmsLogo from "../assets/vms_logo.svg";
import API from "../api";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabaseConfig";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const [dbActive, setDbActive] = useState(null);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: "", next: "", confirm: "" });
  const [pwdStatus, setPwdStatus] = useState({ type: "", text: "" });
  const [pwdSaving, setPwdSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const checkDb = async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/vvas_api_get_stats`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });
        if (active) setDbActive(res.ok);
      } catch {
        if (active) setDbActive(false);
      }
    };
    checkDb();
    const t = setInterval(checkDb, 15000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to log out?")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  };

  if (!user) return null;

  const roleHomeMap = {
    admin: "/admin",
    resident: "/resident",
    guard: "/guard",
  };

  const homePath = roleHomeMap[user.role] || "/admin";

  const roleLabel = {
    admin: "System Admin",
    resident: "Resident",
    guard: "Security Guard",
  };

  const pageTitleMap = {
    "/admin": "Admin Console",
    "/resident": "Resident Portal",
    "/guard": "Gate Guard Terminal",
  };

  return (
    <>
      <OfflineBanner />
      <nav className="navbar">
      <div className="navbar-brand">
        <Link to={homePath} className="brand-logo-container" title="Visitor Management System">
          <img src={vmsLogo} alt="VMS Logo" className="brand-logo-img" />
        </Link>
        <div className="breadcrumb-container" style={{ borderLeft: "1px solid var(--border)", paddingLeft: "14px" }}>
          <Link to={homePath} className="breadcrumb-item">Home</Link>
          <span className="breadcrumb-separator">›</span>
          <span className="breadcrumb-item active">{pageTitleMap[location.pathname] || "Dashboard"}</span>
        </div>
      </div>

      <div className="navbar-center" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <LiveClock />
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: "999px",
            background: dbActive === true ? "rgba(16,185,129,0.12)" : dbActive === false ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
            color: dbActive === true ? "#059669" : dbActive === false ? "#dc2626" : "#d97706",
            border: `1px solid ${dbActive === true ? "rgba(16,185,129,0.3)" : dbActive === false ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
          }}
        >
          {dbActive === true ? "● Supabase: Active" : dbActive === false ? "● Supabase: Offline" : "● Checking DB..."}
        </span>
      </div>

      <div className="navbar-info">
        <ThemeToggle />
        <span className="navbar-user" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <strong>{user.full_name}</strong> <span className={`badge badge-${user.role}`}>{user.role.toUpperCase()}</span>
        </span>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            setPwdForm({ current: "", next: "", confirm: "" });
            setPwdStatus({ type: "", text: "" });
            setShowPwdModal(true);
          }}
        >
          Change Password
        </button>
        <button className="btn btn-outline btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </nav>

    {showPwdModal && (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.55)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: "16px",
        }}
        onClick={() => setShowPwdModal(false)}
      >
        <div
          className="panel"
          style={{ width: "100%", maxWidth: "400px", margin: 0, padding: "22px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Change Account Password</h3>
          {pwdStatus.text && (
            <div className={`alert ${pwdStatus.type === "error" ? "alert-error" : "alert-success"}`}>
              {pwdStatus.text}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setPwdStatus({ type: "", text: "" });
              if (pwdForm.next.length < 6) {
                setPwdStatus({ type: "error", text: "New password must be at least 6 characters." });
                return;
              }
              if (pwdForm.next !== pwdForm.confirm) {
                setPwdStatus({ type: "error", text: "New passwords do not match." });
                return;
              }
              setPwdSaving(true);
              try {
                await API.put("/api/auth/change-password", {
                  current_password: pwdForm.current,
                  new_password: pwdForm.next,
                });
                setPwdStatus({ type: "success", text: "Password updated successfully!" });
                setTimeout(() => setShowPwdModal(false), 1000);
              } catch (err) {
                setPwdStatus({
                  type: "error",
                  text: err.response?.data?.detail || "Failed to update password.",
                });
              } finally {
                setPwdSaving(false);
              }
            }}
          >
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={pwdForm.current}
                onChange={(e) => setPwdForm({ ...pwdForm, current: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>New Password (min 6 chars)</label>
              <input
                type="password"
                value={pwdForm.next}
                onChange={(e) => setPwdForm({ ...pwdForm, next: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={pwdForm.confirm}
                onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })}
                required
              />
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "14px" }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPwdModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={pwdSaving}>
                {pwdSaving ? "Saving..." : "Update Password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}
  </>
  );
}
