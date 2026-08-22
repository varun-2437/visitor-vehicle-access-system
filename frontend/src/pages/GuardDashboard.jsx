import { useState, useRef, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import API from "../api";
import Navbar from "../components/Navbar";

export default function GuardDashboard() {
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState("");
  const [action, setAction] = useState("entry");
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);

  // Manual vehicle entry form state
  const [manualVehicle, setManualVehicle] = useState("");
  const [manualVisitor, setManualVisitor] = useState("");
  const [manualFlat, setManualFlat] = useState("");
  const [manualPurpose, setManualPurpose] = useState("");

  // Today's lists state
  const [todayPasses, setTodayPasses] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [activeTab, setActiveTab] = useState("scanner"); // "scanner", "passes", "logs"

  const renderStatusBadge = (status) => {
    const map = {
      not_inside: { label: "🟡 Pass Created (Not Inside)", badge: "badge-not_inside" },
      approved: { label: "🟡 Pass Created (Not Inside)", badge: "badge-not_inside" },
      pending: { label: "🟡 Pass Created (Not Inside)", badge: "badge-not_inside" },
      in_campus: { label: "🟢 In Campus", badge: "badge-in_campus" },
      used: { label: "🟢 In Campus", badge: "badge-in_campus" },
      exited: { label: "🔵 Vehicle Exited Campus", badge: "badge-exited" },
      expired: { label: "🔴 Pass Expired", badge: "badge-expired" },
    };
    const item = map[status] || { label: status?.toUpperCase() || "UNKNOWN", badge: "badge-pending" };
    return <span className={`badge ${item.badge}`}>{item.label}</span>;
  };


  useEffect(() => {
    fetchTodayData();
    return () => {
      stopScanner();
    };
  }, []);

  const fetchTodayData = async () => {
    try {
      const [passesRes, logsRes] = await Promise.all([
        API.get("/api/qr/today-passes"),
        API.get("/api/qr/today-logs"),
      ]);
      setTodayPasses(passesRes.data);
      setTodayLogs(logsRes.data);
    } catch (err) {
      console.error("Failed to fetch today's guard data:", err);
    }
  };

  const startScanner = async () => {
    setError("");
    setScanResult(null);
    setScanning(true);

    try {
      const html5QrCode = new Html5Qrcode("qr-reader");
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          await html5QrCode.stop();
          setScanning(false);
          verifyToken(decodedText);
        },
        () => {} // ignore scan errors
      );
    } catch (err) {
      setError("Camera access denied or unavailable. Use manual entry or file upload below.");
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {
        // Scanner might already be stopped
      }
    }
    setScanning(false);
  };

  const verifyToken = async (token) => {
    setError("");
    setScanResult(null);
    try {
      const res = await API.post("/api/qr/verify", { qr_token: token, action });
      setScanResult(res.data);
      fetchTodayData(); // Refresh tables in real-time
    } catch (err) {
      setError(err.response?.data?.detail || "Verification failed");
    }
  };

  const handleManualVerify = (e) => {
    e.preventDefault();
    if (manualToken.trim()) {
      verifyToken(manualToken.trim());
      setManualToken("");
    }
  };

  const processImageFile = async (file) => {
    setError("");
    setScanResult(null);
    try {
      const html5QrCode = new Html5Qrcode("qr-file-helper");
      const decodedText = await html5QrCode.scanFile(file, true);
      html5QrCode.clear();
      verifyToken(decodedText);
    } catch (err) {
      setError("❌ Could not read a valid QR code from that image. Please try another image file.");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.files;
    if (items && items.length > 0) {
      const file = items[0];
      if (file.type.startsWith("image/")) {
        e.preventDefault();
        processImageFile(file);
      }
    }
  };

  const handleManualVehicleSubmit = async (e) => {
    e.preventDefault();
    if (!manualVehicle.trim() || !manualVisitor.trim()) {
      setError("Please provide at least Vehicle Number and Visitor Name.");
      return;
    }

    setError("");
    setScanResult(null);
    try {
      const res = await API.post("/api/qr/manual-entry", {
        vehicle_number: manualVehicle.trim().toUpperCase(),
        visitor_name: manualVisitor.trim(),
        flat_number: manualFlat.trim() || null,
        purpose: manualPurpose.trim() || "Manual Gate Entry",
        action: action,
      });
      setScanResult(res.data);
      setManualVehicle("");
      setManualVisitor("");
      setManualFlat("");
      setManualPurpose("");
      fetchTodayData(); // Refresh tables in real-time
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to log manual vehicle entry");
    }
  };

  return (
    <>
      <Navbar />
      <div className="dashboard" onPaste={handlePaste}>
        <h2>Security Guard Dashboard</h2>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Dashboard Section Navigation Tabs */}
        <div className="tabs">
          <button
            className={`tab ${activeTab === "scanner" ? "active" : ""}`}
            onClick={() => setActiveTab("scanner")}
          >
            📷 Gate Scanner & Manual Entry
          </button>
          <button
            className={`tab ${activeTab === "passes" ? "active" : ""}`}
            onClick={() => setActiveTab("passes")}
          >
            🎫 Today's Approved Passes ({todayPasses.length})
          </button>
          <button
            className={`tab ${activeTab === "logs" ? "active" : ""}`}
            onClick={() => setActiveTab("logs")}
          >
            🚗 Today's Entry / Exit Logs ({todayLogs.length})
          </button>
        </div>

        {/* Tab 1: Gate Scanner & Manual Entry */}
        {activeTab === "scanner" && (
          <>
            {/* Scan & Verification Panel */}
            <div className="panel">
              <h3>🔍 Scan / Upload Visitor QR Code</h3>

              <div className="scan-controls">
                <div className="form-group">
                  <label>Gate Action</label>
                  <select value={action} onChange={(e) => setAction(e.target.value)}>
                    <option value="entry">Vehicle Entry</option>
                    <option value="exit">Vehicle Exit</option>
                  </select>
                </div>

                {!scanning ? (
                  <button className="btn btn-primary" onClick={startScanner}>
                    📷 Start Live Camera Scanner
                  </button>
                ) : (
                  <button className="btn btn-danger" onClick={stopScanner}>
                    ⏹ Stop Camera Scanner
                  </button>
                )}
              </div>

              <div id="qr-reader" className="qr-scanner-box"></div>
              <div id="qr-file-helper" style={{ display: "none" }}></div>

              <div className="qr-methods">
                <div className="qr-method-card">
                  <h4>📁 Select QR Image File</h4>
                  <p className="method-desc">Choose a saved QR image (`.png`, `.jpg`, `.jpeg`) from device:</p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="file-input"
                  />
                </div>

                <div className="qr-method-card">
                  <h4>📋 Paste Image from Clipboard</h4>
                  <p className="method-desc">Press <strong>Ctrl + V</strong> (or <strong>Cmd + V</strong>) anywhere, or click below:</p>
                  <div className="paste-zone" tabIndex="0" onPaste={handlePaste}>
                    <span>Click & Press Ctrl+V to paste QR image</span>
                  </div>
                </div>

                <div className="qr-method-card">
                  <h4>⌨️ Manual Token UUID String</h4>
                  <p className="method-desc">Enter raw QR UUID token string:</p>
                  <form onSubmit={handleManualVerify} className="form-row">
                    <input
                      type="text"
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="e.g. e75baca1-d421-4191..."
                      className="flex-grow"
                    />
                    <button type="submit" className="btn btn-primary">Verify</button>
                  </form>
                </div>
              </div>
            </div>

            {/* Manual Vehicle Entry Panel */}
            <div className="panel">
              <h3>🚗 Manual Vehicle Entry / Register</h3>
              <p className="method-desc" style={{ marginBottom: "16px" }}>
                Use this section for walk-in visitors or vehicles arriving without a pre-generated QR code pass.
              </p>

              <form onSubmit={handleManualVehicleSubmit} className="create-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Vehicle Number *</label>
                    <input
                      type="text"
                      value={manualVehicle}
                      onChange={(e) => setManualVehicle(e.target.value)}
                      placeholder="e.g. MH14DX5842"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Visitor Name *</label>
                    <input
                      type="text"
                      value={manualVisitor}
                      onChange={(e) => setManualVisitor(e.target.value)}
                      placeholder="e.g. Suresh Kumar"
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Flat / Unit Number</label>
                    <input
                      type="text"
                      value={manualFlat}
                      onChange={(e) => setManualFlat(e.target.value)}
                      placeholder="e.g. A-101 (Optional)"
                    />
                  </div>
                  <div className="form-group">
                    <label>Purpose</label>
                    <input
                      type="text"
                      value={manualPurpose}
                      onChange={(e) => setManualPurpose(e.target.value)}
                      placeholder="e.g. Delivery, Maintenance, Guest"
                    />
                  </div>
                </div>

                <button type="submit" className="btn btn-primary">
                  📝 Log Manual Vehicle {action.toUpperCase()}
                </button>
              </form>
            </div>
          </>
        )}

        {/* Tab 2: Today's Approved Visitor Passes */}
        {activeTab === "passes" && (
          <div className="panel">
            <div className="panel-header">
              <h3>🎫 Today's Approved Visitor Passes</h3>
              <button className="btn btn-outline btn-sm" onClick={fetchTodayData}>🔄 Refresh</button>
            </div>
            {todayPasses.length === 0 ? (
              <p className="empty-state">No visitor passes created today yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Visitor Name</th>
                    <th>Vehicle Number</th>
                    <th>Purpose</th>
                    <th>Host Resident / Flat</th>
                    <th>Pass Status</th>
                    <th>Expires At</th>
                  </tr>
                </thead>
                <tbody>
                  {todayPasses.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.visitor_name}</strong></td>
                      <td><code>{p.vehicle_number || "—"}</code></td>
                      <td>{p.purpose || "—"}</td>
                      <td>{p.resident?.full_name || "—"} ({p.resident?.flat_number || "Gate"})</td>
                      <td>{renderStatusBadge(p.status)}</td>
                      <td>{new Date(p.expires_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 3: Today's Entry / Exit Activity Logs */}
        {activeTab === "logs" && (
          <div className="panel">
            <div className="panel-header">
              <h3>🚗 Today's Vehicle Entry & Exit Activity Logs</h3>
              <button className="btn btn-outline btn-sm" onClick={fetchTodayData}>🔄 Refresh</button>
            </div>
            {todayLogs.length === 0 ? (
              <p className="empty-state">No vehicle activity logged today yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Gate Action</th>
                    <th>Vehicle Number</th>
                    <th>Visitor Name</th>
                    <th>Host Resident / Flat</th>
                    <th>Logged By Guard</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {todayLogs.map((log) => (
                    <tr key={log.id}>
                      <td><span className={`badge badge-${log.action}`}>{log.action.toUpperCase()}</span></td>
                      <td><code>{log.visitor_pass?.vehicle_number || "—"}</code></td>
                      <td>{log.visitor_pass?.visitor_name || "—"}</td>
                      <td>{log.visitor_pass?.resident?.full_name || "—"} ({log.visitor_pass?.resident?.flat_number || "Gate"})</td>
                      <td>{log.guard?.full_name || "—"}</td>
                      <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Scan / Verification Result Card */}
        {scanResult && (
          <div className={`panel scan-result ${scanResult.valid ? "result-valid" : "result-invalid"}`}>
            <h3>{scanResult.valid ? "✅" : "❌"} {scanResult.message}</h3>
            {scanResult.visitor_pass && (
              <div className="result-details">
                <div className="detail-row"><strong>Visitor:</strong> {scanResult.visitor_pass.visitor_name}</div>
                <div className="detail-row"><strong>Vehicle Number:</strong> {scanResult.visitor_pass.vehicle_number || "Not specified"}</div>
                <div className="detail-row"><strong>Purpose:</strong> {scanResult.visitor_pass.purpose || "Not specified"}</div>
                <div className="detail-row"><strong>Pass Status:</strong> {scanResult.visitor_pass.status}</div>
                <div className="detail-row"><strong>Host Resident:</strong> {scanResult.visitor_pass.resident?.full_name || "—"} ({scanResult.visitor_pass.resident?.flat_number || "Gate"})</div>
                <div className="detail-row"><strong>Timestamp / Expires:</strong> {new Date(scanResult.visitor_pass.expires_at).toLocaleString()}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
