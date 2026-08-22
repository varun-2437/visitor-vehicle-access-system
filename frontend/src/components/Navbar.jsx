import { Link, useNavigate } from "react-router-dom";

export default function Navbar() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "null");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (!user) return null;

  const roleLabel = {
    admin: "Admin",
    resident: "Resident",
    guard: "Security Guard",
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">🚗 VVAS</Link>
      </div>
      <div className="navbar-info">
        <span className="navbar-user">
          {user.full_name} <span className="badge">{roleLabel[user.role]}</span>
        </span>
        <button className="btn btn-outline" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </nav>
  );
}
