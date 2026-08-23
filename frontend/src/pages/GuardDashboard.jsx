import { useState, useRef, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import API from "../api";
import Navbar from "../components/Navbar";
import Toast from "../components/Toast";
import { formatDateTime, formatTimeOnly } from "../utils/datetime";
import { exportToCSV } from "../utils/exportCsv";

export default function GuardDashboard() {
  const [scanResult, setScanResult] = useState(null);
  const [lastSource, setLastSource] = useState(null); // 'qr' or 'manual'
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ message: "", type: "info" });
  const [searchQuery, setSearchQuery] = useState("");
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

  // Keyboard Shortcuts for Power Users (Alt+S: Scanner, Alt+E: Toggle Action, Alt+R: Refresh)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (scanning) stopScanner();
        else startScanner();
      } else if (e.altKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        setAction((prev) => (prev === "entry" ? "exit" : "entry"));
        setToast({ message: `Gate action set to ${action === "entry" ? "EXIT" : "ENTRY"}`, type: "info" });
      } else if (e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        fetchTodayData();
        setToast({ message: "Today's logs and passes refreshed", type: "info" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scanning, action]);

  const handleExportPasses = () => {
    exportToCSV("today_approved_passes.csv", filteredPasses, [
      { label: "Visitor Name", accessor: "visitor_name" },
      { label: "Vehicle Number", accessor: (r) => r.vehicle_number || "N/A" },
      { label: "Purpose", accessor: (r) => r.purpose || "N/A" },
      { label: "Resident Name", accessor: (r) => r.resident?.full_name || "N/A" },
      { label: "Flat Number", accessor: (r) => r.resident?.flat_number || "N/A" },
      { label: "Pass Status", accessor: "status" },
      { label: "Expires Date & Time", accessor: (r) => formatDateTime(r.expires_at) },
    ]);
    setToast({ message: "✅ Exported today's passes to CSV", type: "success" });
  };

  const handleExportLogs = () => {
    exportToCSV("today_vehicle_logs.csv", filteredLogs, [
      { label: "Log ID", accessor: "id" },
      { label: "Gate Action", accessor: (r) => r.action.toUpperCase() },
      { label: "Vehicle Number", accessor: (r) => r.visitor_pass?.vehicle_number || "N/A" },
      { label: "Visitor Name", accessor: (r) => r.visitor_pass?.visitor_name || "N/A" },
      { label: "Resident Name", accessor: (r) => r.visitor_pass?.resident?.full_name || "N/A" },
      { label: "Flat Number", accessor: (r) => r.visitor_pass?.resident?.flat_number || "N/A" },
      { label: "Logged By Guard", accessor: (r) => r.guard?.full_name || "N/A" },
      { label: "Timestamp", accessor: (r) => formatDateTime(r.timestamp) },
    ]);
    setToast({ message: "✅ Exported today's activity logs to CSV", type: "success" });
  };

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
          verifyToken(decodedText, 'qr');
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

  const verifyToken = async (token, source = 'qr') => {
    setError("");
    setScanResult(null);
    try {
      const res = await API.post("/api/qr/verify", { qr_token: token, action });
      setScanResult(res.data);
      setLastSource(source);
      fetchTodayData(); // Refresh tables in real-time
    } catch (err) {
      setError(err.response?.data?.detail || "Verification failed");
    }
  };

  const handleManualVerify = (e) => {
    e.preventDefault();
    if (manualToken.trim()) {
      verifyToken(manualToken.trim(), 'qr');
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
      verifyToken(decodedText, 'qr');
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
      setLastSource('manual');
      setManualVehicle("");
      setManualVisitor("");
      setManualFlat("");
      setManualPurpose("");
      fetchTodayData(); // Refresh tables in real-time
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to log manual vehicle entry");
    }
  };

  const renderResultCard = () => {
    if (!scanResult) return null;
    return (
      <div className={`scan-result-container ${scanResult.valid ? "result-valid" : "result-invalid"}`}>
        <h3>{scanResult.valid ? "✅" : "❌"} {scanResult.message}</h3>
        {scanResult.visitor_pass && (
          <div className="result-details">
            <div className="detail-row"><strong>Visitor:</strong> {scanResult.visitor_pass.visitor_name}</div>
            <div className="detail-row"><strong>Vehicle Number:</strong> <code>{scanResult.visitor_pass.vehicle_number || "Not specified"}</code></div>
            <div className="detail-row"><strong>Purpose:</strong> {scanResult.visitor_pass.purpose || "Not specified"}</div>
            <div className="detail-row"><strong>Vehicle Status:</strong> {renderStatusBadge(scanResult.visitor_pass.status)}</div>
            <div className="detail-row"><strong>Host Resident:</strong> {scanResult.visitor_pass.resident?.full_name || "—"} ({scanResult.visitor_pass.resident?.flat_number || "Gate"})</div>
            <div className="detail-row"><strong>Expires / Valid Until:</strong> {formatDateTime(scanResult.visitor_pass.expires_at)}</div>
          </div>
        )}
      </div>
    );
  };

  const filteredPasses = todayPasses.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (p.visitor_name && p.visitor_name.toLowerCase().includes(q)) ||
      (p.vehicle_number && p.vehicle_number.toLowerCase().includes(q)) ||
      (p.purpose && p.purpose.toLowerCase().includes(q)) ||
      (p.resident?.full_name && p.resident.full_name.toLowerCase().includes(q)) ||
      (p.resident?.flat_number && p.resident.flat_number.toLowerCase().includes(q)) ||
      (p.status && p.status.toLowerCase().includes(q))
    );
  });

  const filteredLogs = todayLogs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (log.action && log.action.toLowerCase().includes(q)) ||
      (log.visitor_pass?.vehicle_number && log.visitor_pass.vehicle_number.toLowerCase().includes(q)) ||
      (log.visitor_pass?.visitor_name && log.visitor_pass.visitor_name.toLowerCase().includes(q)) ||
      (log.visitor_pass?.resident?.full_name && log.visitor_pass.resident.full_name.toLowerCase().includes(q)) ||
      (log.visitor_pass?.resident?.flat_number && log.visitor_pass.resident.flat_number.toLowerCase().includes(q)) ||
      (log.guard?.full_name && log.guard.full_name.toLowerCase().includes(q))
    );
  });

  return (
    <>
      <Navbar />
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "info" })} />

      <div className="dashboard" onPaste={handlePaste}>
        <h2>Gate Guard Terminal</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="shortcuts-legend">
          <span>⌨️ Power Shortcuts:</span>
          <span><span className="shortcut-badge">Alt + S</span> Start/Stop Camera</span>
          <span><span className="shortcut-badge">Alt + E</span> Toggle Action (Entry/Exit)</span>
          <span><span className="shortcut-badge">Alt + R</span> Refresh Logs</span>
        </div>

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

              {/* QR Scan Result Banner rendered immediately inside the QR section */}
              {lastSource === 'qr' && renderResultCard()}
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
                      onChange={(e) => setManualVehicle(e.target.value.toUpperCase())}
                      placeholder="e.g. MH14DX5842"
                      required
                    />
                    {manualVehicle && (
                      <small style={{ color: (/^[A-Z0-9\s-]{4,15}$/i.test(manualVehicle.trim())) ? "var(--success)" : "var(--danger)", fontSize: "0.8rem", marginTop: "4px", display: "block" }}>
                        {(/^[A-Z0-9\s-]{4,15}$/i.test(manualVehicle.trim())) ? "✓ Valid vehicle license plate format" : "⚠️ Format should be e.g. MH14DX5842 or KA01AB1234"}
                      </small>
                    )}
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

              {/* Manual Entry Result Banner rendered immediately inside the Manual Entry section */}
              {lastSource === 'manual' && renderResultCard()}
            </div>
          </>
        )}

        {/* Tab 2: Today's Approved Visitor Passes */}
        {activeTab === "passes" && (
          <div className="panel">
            <div className="panel-header">
              <h3>🎫 Today's Approved Visitor Passes</h3>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn btn-outline btn-sm" onClick={handleExportPasses}>📥 Export CSV</button>
                <button className="btn btn-outline btn-sm" onClick={fetchTodayData}>🔄 Refresh</button>
              </div>
            </div>

            <div className="search-filter-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search passes by visitor name, vehicle number, host resident, flat..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {filteredPasses.length === 0 ? (
              <p className="empty-state">No matching visitor passes found.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Visitor Name</th>
                    <th>Vehicle Number</th>
                    <th>Purpose</th>
                    <th>Host Resident / Flat</th>
                    <th>Pass Status</th>
                    <th>Expires Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPasses.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.visitor_name}</strong></td>
                      <td><code>{p.vehicle_number || "—"}</code></td>
                      <td>{p.purpose || "—"}</td>
                      <td>{p.resident?.full_name || "—"} ({p.resident?.flat_number || "Gate"})</td>
                      <td>{renderStatusBadge(p.status)}</td>
                      <td>{formatDateTime(p.expires_at)}</td>
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
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn btn-outline btn-sm" onClick={handleExportLogs}>📥 Export CSV</button>
                <button className="btn btn-outline btn-sm" onClick={fetchTodayData}>🔄 Refresh</button>
              </div>
            </div>

            <div className="search-filter-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                className="search-input"
                placeholder="Search logs by vehicle number, visitor name, gate action, guard..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {filteredLogs.length === 0 ? (
              <p className="empty-state">No matching vehicle activity logs found.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Gate Action</th>
                    <th>Vehicle Number</th>
                    <th>Visitor Name</th>
                    <th>Host Resident / Flat</th>
                    <th>Logged By Guard</th>
                    <th>Logged Date & Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td><span className={`badge badge-${log.action}`}>{log.action.toUpperCase()}</span></td>
                      <td><code>{log.visitor_pass?.vehicle_number || "—"}</code></td>
                      <td>{log.visitor_pass?.visitor_name || "—"}</td>
                      <td>{log.visitor_pass?.resident?.full_name || "—"} ({log.visitor_pass?.resident?.flat_number || "Gate"})</td>
                      <td>{log.guard?.full_name || "—"}</td>
                      <td>{formatDateTime(log.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  );
}
