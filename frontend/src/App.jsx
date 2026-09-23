import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import API from "./api";
import ProtectedRoute from "./components/ProtectedRoute";
import LoadingScreen from "./components/LoadingScreen";

const Login = lazy(() => import("./pages/Login"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const ResidentDashboard = lazy(() => import("./pages/ResidentDashboard"));
const GuardDashboard = lazy(() => import("./pages/GuardDashboard"));

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
  useEffect(() => {
    // Initialize CSRF token on app load
    API.get("/api/csrf-token").catch(err => console.error("Failed to fetch CSRF token:", err));
  }, []);

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen message="Loading page..." />}>
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
      </Suspense>
    </BrowserRouter>
  );
}

export default App;

