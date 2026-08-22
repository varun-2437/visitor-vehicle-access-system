import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Login to get token
      const loginRes = await API.post("/api/auth/login", { username, password });
      const token = loginRes.data.access_token;
      localStorage.setItem("token", token);

      // Fetch user profile
      const profileRes = await API.get("/api/auth/me");
      const user = profileRes.data;
      localStorage.setItem("user", JSON.stringify(user));

      // Redirect based on role
      const dashboardMap = {
        admin: "/admin",
        resident: "/resident",
        guard: "/guard",
      };
      navigate(dashboardMap[user.role] || "/");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🚗 VVAS</h1>
          <p>Visitor Vehicle Access System</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="login-footer">
          <p>Contact your administrator for an account</p>
        </div>
      </div>
    </div>
  );
}
