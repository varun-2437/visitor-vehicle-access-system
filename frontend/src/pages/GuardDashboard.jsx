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
      setError("Camera access denied or unavailable. Use manual entry below.");
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

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const verifyToken = async (token) => {
    setError("");
    setScanResult(null);
    try {
      const res = await API.post("/api/qr/verify", { qr_token: token, action });
      setScanResult(res.data);
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

  return (
    <>
      <Navbar />
      <div className="dashboard">
        <h2>Security Guard Dashboard</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="panel">
          <h3>🔍 Scan Visitor QR Code</h3>

          <div className="scan-controls">
            <div className="form-group">
              <label>Action</label>
              <select value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="entry">Vehicle Entry</option>
                <option value="exit">Vehicle Exit</option>
              </select>
            </div>

            {!scanning ? (
              <button className="btn btn-primary" onClick={startScanner}>
                📷 Start Camera Scanner
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopScanner}>
                ⏹ Stop Scanner
              </button>
            )}
          </div>

          <div id="qr-reader" className="qr-scanner-box"></div>

          <div className="manual-entry">
            <h4>Or enter token manually:</h4>
            <form onSubmit={handleManualVerify} className="form-row">
              <input
                type="text"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste QR token here..."
                className="flex-grow"
              />
              <button type="submit" className="btn btn-primary">Verify</button>
            </form>
          </div>
        </div>

        {scanResult && (
          <div className={`panel scan-result ${scanResult.valid ? "result-valid" : "result-invalid"}`}>
            <h3>{scanResult.valid ? "✅" : "❌"} {scanResult.message}</h3>
            {scanResult.visitor_pass && (
              <div className="result-details">
                <div className="detail-row"><strong>Visitor:</strong> {scanResult.visitor_pass.visitor_name}</div>
                <div className="detail-row"><strong>Vehicle:</strong> {scanResult.visitor_pass.vehicle_number || "Not specified"}</div>
                <div className="detail-row"><strong>Purpose:</strong> {scanResult.visitor_pass.purpose || "Not specified"}</div>
                <div className="detail-row"><strong>Status:</strong> {scanResult.visitor_pass.status}</div>
                <div className="detail-row"><strong>Resident:</strong> {scanResult.visitor_pass.resident?.full_name || "—"}</div>
                <div className="detail-row"><strong>Expires:</strong> {new Date(scanResult.visitor_pass.expires_at).toLocaleString()}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
