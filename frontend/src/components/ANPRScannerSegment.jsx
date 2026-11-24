import React, { useState, useRef, useEffect } from "react";
import API from "../api";
import { formatDateTime, formatPassId } from "../utils/datetime";
import {
  CarIcon,
  CarPlateIcon,
  CpuIcon,
  CameraIcon,
  StopIcon,
  VehicleEntryIcon,
  VehicleExitIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertCircleIcon,
  PrinterIcon,
  RefreshIcon,
  QrTicketIcon,
} from "./Icons";
import "./ANPRSegment.css";

export default function ANPRScannerSegment({
  onLogComplete,
  setToast,
  setPrintPass,
  defaultAction = "entry",
}) {
  const [gateAction, setGateAction] = useState(defaultAction); // "entry" or "exit"
  const [inputMode, setInputMode] = useState("camera"); // "camera", "upload", "simulator"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detectedResult, setDetectedResult] = useState(null);
  const [sampleVehicles, setSampleVehicles] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [recentDetections, setRecentDetections] = useState([]);

  // Walk-in form fields when plate has no pre-approved pass
  const [walkinVisitor, setWalkinVisitor] = useState("");
  const [walkinFlat, setWalkinFlat] = useState("");
  const [walkinPurpose, setWalkinPurpose] = useState("");
  const [loggingAccess, setLoggingAccess] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load sample test vehicles on mount
  useEffect(() => {
    fetchSampleVehicles();
    return () => {
      stopCamera();
    };
  }, []);

  const fetchSampleVehicles = async () => {
    try {
      const res = await API.get("/api/anpr/sample-vehicles");
      setSampleVehicles(res.data);
    } catch (e) {
      console.warn("Could not load sample vehicles:", e);
    }
  };

  // Start live webcam for camera frame capture
  const startCamera = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setError("Camera access unavailable or blocked. You can upload vehicle photos or use the ANPR Simulator below.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  // Capture frame from webcam and send to ANPR model
  const handleCaptureFrame = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

    await sendToANPRModel({ image_base64: dataUrl });
  };

  // Handle uploaded vehicle image file
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await sendToANPRModel({ file });
  };

  // Trigger model with sample / simulated vehicle plate
  const handleSimulatePlate = async (plateNumber) => {
    await sendToANPRModel({ mock_plate: plateNumber });
  };

  // Core API call: Sends data to the model endpoint
  const sendToANPRModel = async ({ file, image_base64, mock_plate }) => {
    setError("");
    setLoading(true);
    setDetectedResult(null);

    try {
      const formData = new FormData();
      if (file) {
        formData.append("file", file);
      }
      if (image_base64) {
        formData.append("image_base64", image_base64);
      }
      if (mock_plate) {
        formData.append("mock_plate", mock_plate);
      }

      const res = await API.post("/api/anpr/detect-plate", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = res.data;
      setDetectedResult(data);

      // Pre-fill walk-in visitor name if found
      if (data.visitor_pass) {
        setWalkinVisitor(data.visitor_pass.visitor_name || "");
        setWalkinFlat(data.visitor_pass.resident?.flat_number || "");
        setWalkinPurpose(data.visitor_pass.purpose || "");
      } else {
        setWalkinVisitor("");
        setWalkinFlat("");
        setWalkinPurpose("ANPR Automated Gate Entry");
      }

      // Add to session detections list
      setRecentDetections((prev) => [
        {
          plate: data.detected_plate,
          time: new Date().toLocaleTimeString(),
          pass_found: data.pass_found,
          pass_id: data.visitor_pass?.id,
          visitor: data.visitor_pass?.visitor_name || "Walk-In",
        },
        ...prev.slice(0, 4),
      ]);

      setToast?.({
        message: `ANPR Model recognized plate: ${data.detected_plate}`,
        type: "success",
      });
    } catch (err) {
      const msg = err.response?.data?.detail || "ANPR model failed to process frame";
      setError(msg);
      setToast?.({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Log Entry or Exit using the model-fetched plate
  const handleLogAccess = async () => {
    if (!detectedResult?.detected_plate) return;
    setLoggingAccess(true);
    setError("");

    try {
      const payload = {
        vehicle_number: detectedResult.detected_plate,
        action: gateAction,
        pass_id: detectedResult.visitor_pass?.id || null,
        visitor_name: walkinVisitor.trim() || undefined,
        flat_number: walkinFlat.trim() || undefined,
        purpose: walkinPurpose.trim() || undefined,
      };

      const res = await API.post("/api/anpr/log-entry-exit", payload);

      setToast?.({
        message: res.data.message || `Logged ${gateAction.toUpperCase()} for ${detectedResult.detected_plate}`,
        type: "success",
      });

      // Update pass in result card so guard sees the new state
      if (res.data.visitor_pass) {
        setDetectedResult((prev) => ({
          ...prev,
          pass_found: true,
          visitor_pass: res.data.visitor_pass,
        }));
      }

      // Notify parent dashboard to refresh Today's Passes and Today's Logs tables
      onLogComplete?.();
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to log vehicle access";
      setError(msg);
      setToast?.({ message: msg, type: "error" });
    } finally {
      setLoggingAccess(false);
    }
  };

  return (
    <div className="anpr-container">
      {/* Segment Header Card */}
      <div className="anpr-header-card">
        <div>
          <h3 style={{ margin: "0 0 4px 0", display: "flex", alignItems: "center", gap: "8px" }}>
            <CarPlateIcon size={22} style={{ color: "var(--primary)" }} />
            Automated Number Plate Recognition (ANPR) Terminal
          </h3>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Vehicle license plates are recognized directly by the AI model from camera snapshots and sensor feeds without manual typing.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="anpr-model-pill">
            <CpuIcon size={14} /> Model: Fast-ALPR (YOLOv9 + Transformer OCR)
          </span>

          {/* Gate Action Toggle */}
          <div className="gate-action-toggle-group" style={{ margin: 0 }}>
            <button
              type="button"
              className={`gate-action-btn ${gateAction === "entry" ? "active" : ""}`}
              onClick={() => setGateAction("entry")}
            >
              <VehicleEntryIcon size={16} /> Vehicle Entry
            </button>
            <button
              type="button"
              className={`gate-action-btn ${gateAction === "exit" ? "active" : ""}`}
              onClick={() => setGateAction("exit")}
            >
              <VehicleExitIcon size={16} /> Vehicle Exit
            </button>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Main 2-Column Work Area */}
      <div className="anpr-grid">
        {/* Left Column: Data Feeds into Model */}
        <div className="panel" style={{ margin: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h4 style={{ margin: 0, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "6px" }}>
              <CameraIcon size={16} /> Model Ingestion Feeds
            </h4>

            {/* Input Mode Selector */}
            <div style={{ display: "flex", gap: "4px" }}>
              <button
                type="button"
                className={`btn btn-sm ${inputMode === "camera" ? "btn-primary" : "btn-outline"}`}
                onClick={() => { setInputMode("camera"); startCamera(); }}
              >
                Live Camera
              </button>
              <button
                type="button"
                className={`btn btn-sm ${inputMode === "upload" ? "btn-primary" : "btn-outline"}`}
                onClick={() => { setInputMode("upload"); stopCamera(); }}
              >
                Upload Photo
              </button>
              <button
                type="button"
                className={`btn btn-sm ${inputMode === "simulator" ? "btn-primary" : "btn-outline"}`}
                onClick={() => { setInputMode("simulator"); stopCamera(); }}
              >
                Simulator
              </button>
            </div>
          </div>

          {/* Mode 1: Live Gate Camera Stream */}
          {inputMode === "camera" && (
            <div>
              <div style={{ position: "relative", background: "#0f172a", borderRadius: "var(--radius)", overflow: "hidden", minHeight: "220px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{ width: "100%", maxHeight: "280px", objectFit: "cover", display: cameraActive ? "block" : "none" }}
                />

                {!cameraActive && (
                  <div style={{ textAlign: "center", padding: "30px 20px", color: "var(--text-muted)" }}>
                    <CameraIcon size={36} style={{ marginBottom: "8px", opacity: 0.6 }} />
                    <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem" }}>Gate CCTV camera is currently standby.</p>
                    <button type="button" className="btn btn-primary btn-sm" onClick={startCamera}>
                      Activate Gate Camera Feed
                    </button>
                  </div>
                )}

                {cameraActive && (
                  <div style={{ position: "absolute", top: "10px", left: "10px", background: "rgba(0,0,0,0.65)", color: "#22c55e", padding: "3px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "badgeGlowPulse 1.5s infinite" }}></span>
                    LIVE GATE FEED
                  </div>
                )}
              </div>

              {cameraActive && (
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={loading}
                    onClick={handleCaptureFrame}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                  >
                    <CpuIcon size={16} />
                    {loading ? "Processing with Model..." : "Capture Frame & Detect Plate with Model"}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={stopCamera}>
                    <StopIcon size={16} /> Stop
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Vehicle Image Upload */}
          {inputMode === "upload" && (
            <div style={{ textAlign: "center", padding: "24px 16px", border: "2px dashed var(--border)", borderRadius: "var(--radius)", background: "var(--bg-input)" }}>
              <CarIcon size={36} style={{ color: "var(--primary)", marginBottom: "8px" }} />
              <h5 style={{ margin: "0 0 6px 0" }}>Upload Vehicle Snapshot</h5>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "16px" }}>
                Select a front/rear camera snapshot (.jpg, .png, .jpeg) for the model to extract the license plate.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                {loading ? "Model Detecting Plate..." : "Choose Image File"}
              </button>
            </div>
          )}

          {/* Mode 3: Gate Simulator / Sample Vehicles */}
          {inputMode === "simulator" && (
            <div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "12px" }}>
                Select an arriving vehicle from the gate sensor queue or active passes to simulate automated AI plate reading:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {sampleVehicles.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--bg-input)",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div>
                      <strong style={{ fontFamily: "monospace", fontSize: "0.95rem", color: "var(--primary)" }}>
                        {s.vehicle_number}
                      </strong>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {s.visitor_name} ({s.flat_number || "Gate"}) • {s.purpose}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      disabled={loading}
                      onClick={() => handleSimulatePlate(s.vehicle_number)}
                      style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "4px" }}
                    >
                      <CpuIcon size={12} /> Run Model
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Shift Detections */}
          {recentDetections.length > 0 && (
            <div style={{ marginTop: "20px", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px" }}>
                RECENT MODEL DETECTIONS (THIS SHIFT):
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {recentDetections.map((d, i) => (
                  <button
                    key={i}
                    type="button"
                    className="anpr-sample-btn"
                    onClick={() => handleSimulatePlate(d.plate)}
                    title={`Detected at ${d.time}`}
                  >
                    {d.plate} ({d.pass_found ? "Pass #" + d.pass_id : "Walk-in"})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Model Detection & Verification Results */}
        <div className="panel" style={{ margin: 0 }}>
          <h4 style={{ margin: "0 0 16px 0", fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "6px" }}>
            <CpuIcon size={16} /> Model Output & Pass Verification
          </h4>

          {loading && (
            <div className="anpr-scanning-box">
              <div className="anpr-laser"></div>
              <CpuIcon size={32} style={{ color: "#22c55e", marginBottom: "12px", animation: "badgeGlowPulse 1s infinite" }} />
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>ANPR AI Model Processing</div>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "4px" }}>
                Running localization and character recognition on frame...
              </div>
            </div>
          )}

          {!loading && !detectedResult && (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: "var(--radius)" }}>
              <CarPlateIcon size={40} style={{ opacity: 0.4, marginBottom: "12px" }} />
              <h5 style={{ margin: "0 0 6px 0", color: "var(--text)" }}>Awaiting Vehicle Feed</h5>
              <p style={{ margin: 0, fontSize: "0.85rem" }}>
                Capture a camera frame or upload an image on the left. The recognized vehicle number plate and visitor pass will be presented here automatically.
              </p>
            </div>
          )}

          {!loading && detectedResult && (
            <div>
              {/* License Plate Display Graphic */}
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <div style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px" }}>
                  RECOGNIZED NUMBER PLATE (FETCHED FROM MODEL)
                </div>

                <div className="license-plate-badge">
                  <div className="license-plate-blue-strip">
                    <div className="license-plate-chakra"></div>
                    <span>IND</span>
                  </div>
                  <div className="license-plate-number">{detectedResult.detected_plate}</div>
                </div>

                <div className="anpr-metrics-row" style={{ justifyContent: "center" }}>
                  <span>
                    Model: <strong>{detectedResult.model_name}</strong>
                  </span>
                  <span>
                    Confidence: <strong>{Math.round(detectedResult.confidence * 100)}%</strong>
                  </span>
                  <span>
                    Latency: <strong>{detectedResult.processing_time_ms} ms</strong>
                  </span>
                </div>
              </div>

              {/* Pass Verification Status Banner */}
              {detectedResult.pass_found && detectedResult.visitor_pass ? (
                <div style={{ background: "rgba(34, 197, 94, 0.08)", border: "1px solid var(--success-border, #86efac)", borderRadius: "var(--radius)", padding: "16px", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--success, #16a34a)", fontWeight: 700, fontSize: "0.95rem", marginBottom: "10px" }}>
                    <CheckCircleIcon size={18} />
                    VALID VISITOR PASS FOUND ({formatPassId(detectedResult.visitor_pass.id)})
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.85rem" }}>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Visitor:</span>{" "}
                      <strong>{detectedResult.visitor_pass.visitor_name}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Vehicle:</span>{" "}
                      <code>{detectedResult.visitor_pass.vehicle_number}</code>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Host Resident:</span>{" "}
                      <strong>{detectedResult.visitor_pass.resident?.full_name || "—"}</strong> ({detectedResult.visitor_pass.resident?.flat_number || "Gate"})
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Purpose:</span>{" "}
                      {detectedResult.visitor_pass.purpose || "Visit"}
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Current Status:</span>{" "}
                      <span className="badge badge-in_campus" style={{ fontSize: "0.75rem" }}>
                        {detectedResult.visitor_pass.status?.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Valid Until:</span>{" "}
                      {formatDateTime(detectedResult.visitor_pass.expires_at)}
                    </div>
                  </div>

                  <div style={{ marginTop: "14px", display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={loggingAccess}
                      onClick={handleLogAccess}
                      style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                    >
                      {gateAction === "entry" ? <VehicleEntryIcon size={16} /> : <VehicleExitIcon size={16} />}
                      {loggingAccess ? "Logging..." : `Approve & Log ${gateAction.toUpperCase()} for ${detectedResult.detected_plate}`}
                    </button>

                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setPrintPass?.(detectedResult.visitor_pass)}
                      title="View & Print Gate Pass Badge / PDF"
                    >
                      <PrinterIcon size={16} /> Pass
                    </button>
                  </div>
                </div>
              ) : (
                /* Unregistered / Walk-in Vehicle Form */
                <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "var(--radius)", padding: "16px", marginBottom: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#d97706", fontWeight: 700, fontSize: "0.95rem", marginBottom: "8px" }}>
                    <AlertCircleIcon size={18} />
                    UNREGISTERED VEHICLE (NO PRE-APPROVED PASS)
                  </div>
                  <p style={{ margin: "0 0 14px 0", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                    Number plate was recognized by the model. Provide visitor details below to log instant gate registration:
                  </p>

                  <div className="form-row" style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: "0.78rem", fontWeight: 600 }}>Visitor Name *</label>
                      <input
                        type="text"
                        value={walkinVisitor}
                        onChange={(e) => setWalkinVisitor(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        required
                        style={{ width: "100%", padding: "8px 10px", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text)" }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: "0.78rem", fontWeight: 600 }}>Visiting Flat / Unit</label>
                      <input
                        type="text"
                        value={walkinFlat}
                        onChange={(e) => setWalkinFlat(e.target.value)}
                        placeholder="e.g. B-204"
                        style={{ width: "100%", padding: "8px 10px", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text)" }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ fontSize: "0.78rem", fontWeight: 600 }}>Visit Purpose</label>
                    <input
                      type="text"
                      value={walkinPurpose}
                      onChange={(e) => setWalkinPurpose(e.target.value)}
                      placeholder="e.g. Delivery, Guest, Service"
                      style={{ width: "100%", padding: "8px 10px", fontSize: "0.85rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--bg-input)", color: "var(--text)" }}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={loggingAccess || !walkinVisitor.trim()}
                    onClick={handleLogAccess}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                  >
                    {gateAction === "entry" ? <VehicleEntryIcon size={16} /> : <VehicleExitIcon size={16} />}
                    {loggingAccess ? "Registering & Logging..." : `Log Walk-In ${gateAction.toUpperCase()} for ${detectedResult.detected_plate}`}
                  </button>
                </div>
              )}

              {/* Reset / Scan Next Vehicle Button */}
              <div style={{ textAlign: "right" }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { setDetectedResult(null); setError(""); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <RefreshIcon size={14} /> Scan Next Vehicle
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
