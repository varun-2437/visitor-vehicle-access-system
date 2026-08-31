import { Navigate } from "react-router-dom";
import AnimatedPage from "./AnimatedPage";

export default function ProtectedRoute({ children, allowedRoles }) {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const token = localStorage.getItem("token");

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to their correct dashboard
    const dashboardMap = {
      admin: "/admin",
      resident: "/resident",
      guard: "/guard",
    };
    return <Navigate to={dashboardMap[user.role] || "/login"} replace />;
  }

  return <AnimatedPage>{children}</AnimatedPage>;
}
