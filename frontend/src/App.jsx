import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import ResidentDashboard from "./pages/ResidentDashboard";
import GuardDashboard from "./pages/GuardDashboard";
import ProtectedRoute from "./components/ProtectedRoute";

function HomeRedirect() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  const roleHomeMap = {
    admin: "/admin",
    resident: "/resident",
    guard: "/guard",
  };

  const homePath = roleHomeMap[user.role] || "/login";
  return <Navigate to={homePath} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminDashboard />
          </ProtectedRoute>
        } />

        <Route path="/resident" element={
          <ProtectedRoute allowedRoles={["resident"]}>
            <ResidentDashboard />
          </ProtectedRoute>
        } />

        <Route path="/guard" element={
          <ProtectedRoute allowedRoles={["guard"]}>
            <GuardDashboard />
          </ProtectedRoute>
        } />

        <Route path="/" element={<HomeRedirect />} />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
