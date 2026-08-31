import { Link, useNavigate, useLocation } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import LiveClock from "./LiveClock";
import OfflineBanner from "./OfflineBanner";
import vmsLogo from "../assets/vms_logo.svg";

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "null");

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

      <div className="navbar-center">
        <LiveClock />
      </div>

      <div className="navbar-info">
        <ThemeToggle />
        <span className="navbar-user" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <strong>{user.full_name}</strong> <span className={`badge badge-${user.role}`}>{user.role.toUpperCase()}</span>
        </span>
        <button className="btn btn-outline btn-sm" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </nav>
  </>
  );
}
