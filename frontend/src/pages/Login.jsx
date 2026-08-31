import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api";
import ThemeToggle from "../components/ThemeToggle";
import CampusSketchBG from "../components/CampusSketchBG";
import vmsLogo from "../assets/vms_logo.svg";
import { EyeIcon, EyeOffIcon } from "../components/Icons";

export default function Login() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Auto-redirect if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (token && user?.role) {
      const dashboardMap = {
        admin: "/admin",
        resident: "/resident",
        guard: "/guard",
      };
      if (dashboardMap[user.role]) {
        navigate(dashboardMap[user.role], { replace: true });
      }
    }
  }, [navigate]);

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
      const loginRes = await API.post("/api/auth/login", { username: username.trim(), password });
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
      navigate(dashboardMap[user.role] || "/admin");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed. Please check your credentials.");
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
      await API.post("/api/auth/signup", {
        ...signupData,
        username: signupData.username.trim(),
        full_name: signupData.full_name.trim(),
        email: signupData.email.trim(),
      });
      setMessage("Account created successfully! Your account is pending Admin approval. Please contact the administrator to activate your account.");
      setSignupData({ full_name: "", username: "", email: "", password: "", role: "resident", flat_number: "" });
      setIsSignUp(false);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create account. Please check your inputs.");
    } finally {
      setLoading(false);
    }
  };

  const isLoginDisabled = loading || !username.trim() || !password.trim();
  const isSignupDisabled =
    loading ||
    !signupData.full_name.trim() ||
    !signupData.username.trim() ||
    !signupData.email.trim() ||
    !signupData.password.trim() ||
    (signupData.role === "resident" && !signupData.flat_number.trim());

  return (
    <div className="login-container">
      <CampusSketchBG />
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
              <label htmlFor="username">
                Username <span style={{ color: "var(--primary)", fontWeight: "bold" }}>*</span>
              </label>
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
              <label htmlFor="password">
                Password <span style={{ color: "var(--primary)", fontWeight: "bold" }}>*</span>
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? "Hide Password" : "Show Password"}
                  style={{
                    position: "absolute",
                    right: "10px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                  }}
                >
                  {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={isLoginDisabled}>
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
              <label>
                Full Name <span style={{ color: "var(--primary)", fontWeight: "bold" }}>*</span>
              </label>
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
                <label>
                  Username <span style={{ color: "var(--primary)", fontWeight: "bold" }}>*</span>
                </label>
                <input
                  type="text"
                  value={signupData.username}
                  onChange={(e) => setSignupData({ ...signupData, username: e.target.value })}
                  placeholder="e.g. rahul"
                  required
                />
              </div>
              <div className="form-group">
                <label>
                  Email <span style={{ color: "var(--primary)", fontWeight: "bold" }}>*</span>
                </label>
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
              <label>
                Password <span style={{ color: "var(--primary)", fontWeight: "bold" }}>*</span>
              </label>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showSignupPassword ? "text" : "password"}
                  value={signupData.password}
                  onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                  placeholder="Create a strong password"
                  required
                  style={{ paddingRight: "40px" }}
                />
                <button
                  type="button"
                  onClick={() => setShowSignupPassword(!showSignupPassword)}
                  title={showSignupPassword ? "Hide Password" : "Show Password"}
                  style={{
                    position: "absolute",
                    right: "10px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                  }}
                >
                  {showSignupPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>
                  Role <span style={{ color: "var(--primary)", fontWeight: "bold" }}>*</span>
                </label>
                <select
                  value={signupData.role}
                  onChange={(e) => setSignupData({ ...signupData, role: e.target.value })}
                >
                  <option value="resident">Resident</option>
                  <option value="guard">Security Guard</option>
                </select>
              </div>
              {signupData.role === "resident" ? (
                <div className="form-group">
                  <label>
                    Flat Number <span style={{ color: "var(--primary)", fontWeight: "bold" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={signupData.flat_number}
                    onChange={(e) => setSignupData({ ...signupData, flat_number: e.target.value })}
                    placeholder="e.g. A-101"
                    required
                  />
                </div>
              ) : (
                <div className="form-group">
                  <label>
                    Flat Number <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: "normal" }}>(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={signupData.flat_number}
                    onChange={(e) => setSignupData({ ...signupData, flat_number: e.target.value })}
                    placeholder="N/A"
                  />
                </div>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={isSignupDisabled}>
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
