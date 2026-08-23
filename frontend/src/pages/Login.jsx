import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import ThemeToggle from "../components/ThemeToggle";
import vmsLogo from "../assets/vms_logo.svg";

export default function Login() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);

  // Login form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Signup form state
  const [signupData, setSignupData] = useState({
    full_name: "",
    username: "",
    email: "",
    password: "",
    role: "resident",
    flat_number: "",
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
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
      const detail = err.response?.data?.detail || "Incorrect username or password";
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      await API.post("/api/auth/signup", signupData);
      setMessage("✅ Account created successfully! Your account is pending Admin approval. Please contact the administrator to activate your account.");
      setSignupData({ full_name: "", username: "", email: "", password: "", role: "resident", flat_number: "" });
      setIsSignUp(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create account. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card" style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: "20px", right: "20px" }}>
          <ThemeToggle />
        </div>

        <div className="login-header">
          <img src={vmsLogo} alt="VMS Logo" className="brand-logo-img-large" />
          <p className="login-subtitle">Visitor Vehicle Access System</p>
        </div>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        {!isSignUp ? (
          /* Sign In Form */
          <form onSubmit={handleLogin}>
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
              {loading ? (
                <>
                  <span className="spinner"></span>Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        ) : (
          /* Create Account / Sign Up Form */
          <form onSubmit={handleSignUp}>
            <div className="form-group">
              <label>Full Name *</label>
              <input
                type="text"
                value={signupData.full_name}
                onChange={(e) => setSignupData({ ...signupData, full_name: e.target.value })}
                placeholder="e.g. Rahul Sharma"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Username *</label>
                <input
                  type="text"
                  value={signupData.username}
                  onChange={(e) => setSignupData({ ...signupData, username: e.target.value })}
                  placeholder="e.g. rahul"
                  required
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={signupData.email}
                  onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                  placeholder="e.g. rahul@example.com"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password *</label>
              <input
                type="password"
                value={signupData.password}
                onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                placeholder="Create a strong password"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Role</label>
                <select
                  value={signupData.role}
                  onChange={(e) => setSignupData({ ...signupData, role: e.target.value })}
                >
                  <option value="resident">Resident</option>
                  <option value="guard">Security Guard</option>
                </select>
              </div>
              {signupData.role === "resident" && (
                <div className="form-group">
                  <label>Flat Number</label>
                  <input
                    type="text"
                    value={signupData.flat_number}
                    onChange={(e) => setSignupData({ ...signupData, flat_number: e.target.value })}
                    placeholder="e.g. A-101"
                  />
                </div>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner"></span>Requesting Account...
                </>
              ) : (
                "Create Account & Request Approval"
              )}
            </button>
          </form>
        )}

        <div className="login-footer">
          {!isSignUp ? (
            <>
              <p style={{ marginBottom: "6px" }}>
                Need an account?{" "}
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => { setIsSignUp(true); setError(""); setMessage(""); }}
                  style={{ background: "none", border: "none", color: "var(--primary-hover)", fontWeight: 600, cursor: "pointer" }}
                >
                  Create Account
                </button>
              </p>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Contact the administrator for account creation & approval
              </p>
            </>
          ) : (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                className="btn-link"
                onClick={() => { setIsSignUp(false); setError(""); setMessage(""); }}
                style={{ background: "none", border: "none", color: "var(--primary-hover)", fontWeight: 600, cursor: "pointer" }}
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
