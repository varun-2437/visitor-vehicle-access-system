import React, { useState, useRef, useEffect } from "react";
import API from "../api";
import { formatDateTime, formatPassId } from "../utils/datetime";
import { exportToCSV } from "../utils/exportCsv";
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
  SearchIcon,
  ExportIcon,
  FilterIcon,
} from "./Icons";
import "./ANPRSegment.css";

export default function ANPRScannerSegment({
  onLogComplete,
  setToast,
  setPrintPass,
  defaultAction = "entry",
}) {
  const [gateAction, setGateAction] = useState(defaultAction); // "entry" or "exit"
  // Camera input modes: "phone_qr", "local_cam", "ip_stream", "upload", "simulator"
  const [inputMode, setInputMode] = useState("phone_qr");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detectedResult, setDetectedResult] = useState(null);

  // Network info for phone camera connection
  const [networkInfo, setNetworkInfo] = useState({
    lan_ip: window.location.hostname,
    phone_camera_url: `http://${window.location.hostname}:5173/phone-camera`,
    qr_data_uri: null,
  });

  // Local camera devices (webcam, Continuity camera, external USB/DroidCam)
  const [availableDevices, setAvailableDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [cameraActive, setCameraActive] = useState(false);

  // Phone IP webcam stream state
  const [streamUrl, setStreamUrl] = useState("http://192.168.1.15:8080/shot.jpg");
  const [autoFetchIp, setAutoFetchIp] = useState(false);

  // Sample vehicles
  const [sampleVehicles, setSampleVehicles] = useState([]);

  // Full detailed ANPR activity records table
  const [activityRecords, setActivityRecords] = useState([]);
  const [recordsSearchQuery, setRecordsSearchQuery] = useState("");
  const [recordsActionFilter, setRecordsActionFilter] = useState("all");

  // Walk-in form fields
  const [walkinVisitor, setWalkinVisitor] = useState("");
  const [walkinFlat, setWalkinFlat] = useState("");
  const [walkinPurpose, setWalkinPurpose] = useState("");
  const [loggingAccess, setLoggingAccess] = useState(false);

  // Phone remote frame status & live stream options
  const [remoteFrameStatus, setRemoteFrameStatus] = useState(null);
  const [lastRemoteFrameId, setLastRemoteFrameId] = useState(0);
  const [autoDetectStream, setAutoDetectStream] = useState(true);
  const [showConnectSetup, setShowConnectSetup] = useState(true);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);
  const ipFetchTimerRef = useRef(null);

  // Initialize
  useEffect(() => {
    fetchNetworkInfo();
    fetchSampleVehicles();
    fetchActivityRecords();
    enumerateLocalCameras();
    checkRemoteFrame();

    return () => {
      stopLocalCamera();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (ipFetchTimerRef.current) clearInterval(ipFetchTimerRef.current);
    };
  }, []);

  // Poll for live mobile feed & connection state continuously when active
  useEffect(() => {
    const intervalMs = inputMode === "phone_qr" ? 1000 : 3000;
    pollTimerRef.current = setInterval(checkRemoteFrame, intervalMs);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [inputMode, lastRemoteFrameId, autoDetectStream]);

  // Handle auto-fetch for IP stream
  useEffect(() => {
    if (inputMode === "ip_stream" && autoFetchIp) {
      ipFetchTimerRef.current = setInterval(() => {
        handleFetchIpStream(true);
      }, 3500);
    } else {
      if (ipFetchTimerRef.current) clearInterval(ipFetchTimerRef.current);
    }
    return () => {
      if (ipFetchTimerRef.current) clearInterval(ipFetchTimerRef.current);
    };
  }, [inputMode, autoFetchIp, streamUrl]);

  const fetchNetworkInfo = async () => {
    try {
      const res = await API.get("/api/anpr/network-info");
      setNetworkInfo(res.data);
    } catch (e) {
      console.warn("Could not fetch server network info:", e);
    }
  };

  const fetchSampleVehicles = async () => {
    try {
      const res = await API.get("/api/anpr/sample-vehicles");
      setSampleVehicles(res.data);
    } catch (e) {
      console.warn("Could not fetch sample vehicles:", e);
    }
  };

  const fetchActivityRecords = async () => {
    try {
      const res = await API.get("/api/anpr/activity-records");
      setActivityRecords(res.data);
    } catch (e) {
      console.warn("Could not fetch ANPR activity records:", e);
    }
  };

  // Enumerate cameras (handles Built-in, iPhone Continuity Camera, USB Cams)
  const enumerateLocalCameras = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      setAvailableDevices(videoDevices);
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (e) {
      console.warn("Could not enumerate camera devices:", e);
    }
  };

  // Check if phone app or browser has pushed a new frame or updated status
  const checkRemoteFrame = async () => {
    try {
      const res = await API.get("/api/anpr/remote-frame");
      setRemoteFrameStatus(res.data);

      if (
        inputMode === "phone_qr" &&
        autoDetectStream &&
        res.data.has_frame &&
        !res.data.consumed &&
        res.data.frame_id !== lastRemoteFrameId
      ) {
        setLastRemoteFrameId(res.data.frame_id);
        const isLiveStream = res.data.stream_mode === "live_stream";
        await processIncomingRemoteFrame(isLiveStream);
      }
    } catch (e) {
      // ignore transient polling errors
    }
  };

  const getStreamStatusMeta = () => {
    const state = remoteFrameStatus?.stream_state || "disconnected";
    const sender = remoteFrameStatus?.sender_username
      ? `@${remoteFrameStatus.sender_username}`
      : remoteFrameStatus?.device_info || "Phone Camera";

    switch (state) {
      case "streaming":
        return { cls: "state-streaming", label: `Streaming Live (${sender})` };
      case "connected":
        return { cls: "state-connected", label: `Connected (${sender})` };
      case "paused":
        return { cls: "state-paused", label: `Paused (${sender})` };
      case "reconnecting":
        return { cls: "state-reconnecting", label: `Reconnecting (${sender})` };
      default:
        return { cls: "state-disconnected", label: "Phone Cam: Disconnected" };
    }
  };

  const processIncomingRemoteFrame = async (silentOnEmpty = false) => {
    if (!silentOnEmpty) {
      setLoading(true);
      setError("");
    }
    try {
      const res = await API.post("/api/anpr/process-remote-frame");
      if (!res.data.success || !res.data.detected_plate) {
        if (!silentOnEmpty) {
          setError(res.data.message || "No vehicle license plate recognized in this phone snapshot. Please take a closer photo with good lighting.");
          setToast?.({
            message: res.data.message || "No plate detected in phone snapshot.",
            type: "warning",
          });
          setDetectedResult(null);
        }
      } else {
        setError("");
        handleModelInferenceSuccess(
          res.data,
          remoteFrameStatus?.stream_mode === "live_stream"
            ? `Mobile Live Feed (${remoteFrameStatus?.sender_username ? "@" + remoteFrameStatus.sender_username : "Phone"})`
            : "Wireless Phone Camera"
        );
        if (!silentOnEmpty) {
          setToast?.({
            message: `Phone snapshot received! Plate ${res.data.detected_plate} detected.`,
            type: "success",
          });
        }
      }
    } catch (err) {
      if (!silentOnEmpty) {
        setError(err.response?.data?.detail || "Failed to process phone frame");
      }
    } finally {
      if (!silentOnEmpty) setLoading(false);
    }
  };

  // Start local camera
  const startLocalCamera = async (deviceId) => {
    stopLocalCamera();
    setError("");
    const targetId = deviceId || selectedDeviceId;

    try {
      const constraints = {
        video: targetId ? { deviceId: { exact: targetId } } : { facingMode: "environment" },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
      enumerateLocalCameras(); // Refresh labels
    } catch (err) {
      setError("Camera device access failed: " + err.message);
      setCameraActive(false);
    }
  };

  const stopLocalCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleCaptureLocalFrame = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);

    await sendToANPRModel({ image_base64: dataUrl }, "Local / Continuity Camera");
  };

  // Fetch from phone IP stream
  const handleFetchIpStream = async (silent = false) => {
    if (!streamUrl.trim()) return;
    if (!silent) setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("stream_url", streamUrl.trim());

      const res = await API.post("/api/anpr/fetch-url-frame", formData);
      if (!res.data.success || !res.data.detected_plate) {
        if (!silent) {
          setError(res.data.message || "No vehicle license plate recognized in IP stream frame.");
          setToast?.({ message: res.data.message || "No plate detected in IP stream.", type: "warning" });
        }
      } else {
        handleModelInferenceSuccess(res.data, "Phone IP Stream (" + streamUrl + ")");
        if (!silent) {
          setToast?.({
            message: `IP Camera snapshot processed: ${res.data.detected_plate}`,
            type: "success",
          });
        }
      }
    } catch (err) {
      if (!silent) {
        const msg = err.response?.data?.detail || "Failed to fetch stream from phone IP";
        setError(msg);
        setToast?.({ message: msg, type: "error" });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Handle uploaded vehicle image
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await sendToANPRModel({ file }, "Uploaded Image File");
  };

  // Run model with simulated plate
  const handleSimulatePlate = async (plateNumber) => {
    await sendToANPRModel({ mock_plate: plateNumber }, "Simulated Gate Queue");
  };

  // Core API call
  const sendToANPRModel = async ({ file, image_base64, mock_plate }, sourceLabel) => {
    setError("");
    setLoading(true);
    setDetectedResult(null);

    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      if (image_base64) formData.append("image_base64", image_base64);
      if (mock_plate) formData.append("mock_plate", mock_plate);

      const res = await API.post("/api/anpr/detect-plate", formData);
      if (!res.data.success || !res.data.detected_plate) {
        setError(res.data.message || "No vehicle license plate detected. Please provide a clear, well-lit snapshot.");
        setToast?.({
          message: res.data.message || "No plate detected in image.",
          type: "warning",
        });
      } else {
        handleModelInferenceSuccess(res.data, sourceLabel);
        setToast?.({
          message: `Plate ${res.data.detected_plate} detected by AI Model`,
          type: "success",
        });
      }
    } catch (err) {
      const msg = err.response?.data?.detail || "ANPR model error";
      setError(msg);
      setToast?.({ message: msg, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleModelInferenceSuccess = (data, sourceLabel) => {
    setDetectedResult({ ...data, source: sourceLabel });

    if (data.visitor_pass) {
      setWalkinVisitor(data.visitor_pass.visitor_name || "");
      setWalkinFlat(data.visitor_pass.resident?.flat_number || "");
      setWalkinPurpose(data.visitor_pass.purpose || "");
    } else {
      setWalkinVisitor("");
      setWalkinFlat("");
      setWalkinPurpose("ANPR Automated Gate Entry");
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

      if (res.data.visitor_pass) {
        setDetectedResult((prev) => ({
          ...prev,
          pass_found: true,
          visitor_pass: res.data.visitor_pass,
        }));
      }

      // Refresh activity records and parent dashboard
      fetchActivityRecords();
      onLogComplete?.();
    } catch (err) {
      const msg = err.response?.data?.detail || "Failed to log vehicle access";
      setError(msg);
      setToast?.({ message: msg, type: "error" });
    } finally {
      setLoggingAccess(false);
    }
  };

  // Filtered Activity Records
  const filteredRecords = activityRecords.filter((rec) => {
    if (recordsActionFilter !== "all" && rec.action !== recordsActionFilter) return false;
    if (!recordsSearchQuery.trim()) return true;
    const q = recordsSearchQuery.toLowerCase().trim();
    return (
      (rec.vehicle_number && rec.vehicle_number.toLowerCase().includes(q)) ||
      (rec.visitor_name && rec.visitor_name.toLowerCase().includes(q)) ||
      (rec.purpose && rec.purpose.toLowerCase().includes(q)) ||
      (rec.resident_name && rec.resident_name.toLowerCase().includes(q)) ||
      (rec.flat_number && rec.flat_number.toLowerCase().includes(q)) ||
      (rec.pass_id && String(rec.pass_id).includes(q))
    );
  });

  const handleExportRecords = () => {
    exportToCSV("anpr_activity_records.csv", filteredRecords, [
      { label: "Pass ID", accessor: (r) => r.pass_id ? formatPassId(r.pass_id) : "Walk-in" },
      { label: "Vehicle Number", accessor: (r) => r.vehicle_number || "N/A" },
      { label: "Visitor Name", accessor: (r) => r.visitor_name || "N/A" },
      { label: "Purpose of Visit", accessor: (r) => r.purpose || "N/A" },
      { label: "Host Resident", accessor: (r) => r.resident_name || "N/A" },
      { label: "Flat Number", accessor: (r) => r.flat_number || "N/A" },
      { label: "Gate Action", accessor: (r) => r.action.toUpperCase() },
      { label: "Logged By Guard", accessor: (r) => r.guard_name || "N/A" },
      { label: "Date & Time", accessor: (r) => formatDateTime(r.timestamp) },
    ]);
    setToast?.({ message: "Exported ANPR activity logs to CSV", type: "success" });
  };

  return (
    <div className="anpr-container">
      {/* ─── Header Card ─── */}
      <div className="anpr-header-card">
        <div>
          <h3 style={{ margin: "0 0 4px 0", display: "flex", alignItems: "center", gap: "8px" }}>
            <CarPlateIcon size={22} style={{ color: "var(--primary)" }} />
            Automated Number Plate Recognition (ANPR) Terminal
          </h3>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Capture vehicle license plates wirelessly from your phone, laptop camera, or IP stream without typing.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Live Mobile Camera Connection Status Pill */}
          {(() => {
            const meta = getStreamStatusMeta();
            return (
              <span
                className={`anpr-conn-pill ${meta.cls}`}
                title="Live connection state of mobile camera feed"
              >
                <span className="status-dot" />
                {meta.label}
              </span>
            );
          })()}

          <span className="anpr-model-pill">
            <CpuIcon size={14} /> AI Model: Fast-ALPR (YOLOv9 + Transformer OCR)
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

      {/* ─── Main 2-Column Work Area ─── */}
      <div className="anpr-grid">
        {/* Left Column: Camera Feed Options */}
        <div className="panel" style={{ margin: 0 }}>
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px" }}>
              SELECT CAMERA FEED INPUT METHOD:
            </div>

            {/* Camera Options Tab Bar */}
            <div className="anpr-input-tabs">
              <button
                type="button"
                className={`anpr-input-tab-btn ${inputMode === "phone_qr" ? "active" : ""}`}
                onClick={() => { setInputMode("phone_qr"); stopLocalCamera(); }}
              >
                📱 Wireless Phone Camera
              </button>
              <button
                type="button"
                className={`anpr-input-tab-btn ${inputMode === "local_cam" ? "active" : ""}`}
                onClick={() => { setInputMode("local_cam"); startLocalCamera(); }}
              >
                🎥 Webcam / Continuity
              </button>
              <button
                type="button"
                className={`anpr-input-tab-btn ${inputMode === "ip_stream" ? "active" : ""}`}
                onClick={() => { setInputMode("ip_stream"); stopLocalCamera(); }}
              >
                🌐 Phone IP Stream
              </button>
              <button
                type="button"
                className={`anpr-input-tab-btn ${inputMode === "upload" ? "active" : ""}`}
                onClick={() => { setInputMode("upload"); stopLocalCamera(); }}
              >
                🖼️ Upload Photo
              </button>
              <button
                type="button"
                className={`anpr-input-tab-btn ${inputMode === "simulator" ? "active" : ""}`}
                onClick={() => { setInputMode("simulator"); stopLocalCamera(); }}
              >
                ⚡ Simulator
              </button>
            </div>
          </div>

          {/* ── Option 1: Mobile App Live Feed / Wireless Phone Camera ── */}
          {inputMode === "phone_qr" && (
            <div>
              {/* Live Feed Preview Box when frames are present */}
              {remoteFrameStatus?.has_frame && remoteFrameStatus?.preview_base64 ? (
                <div className="anpr-live-feed-box">
                  <img
                    src={remoteFrameStatus.preview_base64}
                    alt="Live Mobile Gate Camera Feed"
                    className="anpr-live-feed-img"
                  />
                  <div className="anpr-live-feed-overlay">
                    <span className="anpr-live-badge">
                      {remoteFrameStatus.stream_state === "streaming"
                        ? "🔴 LIVE FEED"
                        : remoteFrameStatus.stream_state === "paused"
                        ? "⏸ PAUSED"
                        : "📸 LATEST FRAME"}{" "}
                      • #{remoteFrameStatus.frame_id}
                    </span>
                    <span className="anpr-live-badge">
                      {remoteFrameStatus.sender_username
                        ? `@${remoteFrameStatus.sender_username}`
                        : remoteFrameStatus.device_info}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="anpr-live-feed-box" style={{ flexDirection: "column", gap: "8px", padding: "20px", textAlign: "center" }}>
                  <div style={{ fontSize: "2rem" }}>📡</div>
                  <div style={{ color: "#e2e8f0", fontWeight: 700, fontSize: "0.95rem" }}>
                    Awaiting Live Mobile Camera Feed
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: "0.8rem", maxWidth: "340px" }}>
                    Sign in to the <strong>VVAS Android App</strong> with <code>gatecam</code> / <code>gatecam123</code> (or Guard/Admin <strong>📡 Cam</strong>) and tap <strong>Start Live Feed</strong>.
                  </div>
                </div>
              )}

              {/* Live Controls & Status Row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={autoDetectStream}
                    onChange={(e) => setAutoDetectStream(e.target.checked)}
                  />
                  Auto-Detect Plates from Incoming Feed
                </label>

                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setShowConnectSetup((v) => !v)}
                  >
                    {showConnectSetup ? "Hide Setup Guide" : "Show App Login / QR"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={loading || !remoteFrameStatus?.has_frame}
                    onClick={() => processIncomingRemoteFrame(false)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <RefreshIcon size={14} /> Scan Current Frame
                  </button>
                </div>
              </div>

              {showConnectSetup && (
                <div className="anpr-phone-connect-card">
                  {networkInfo.qr_data_uri ? (
                    <img
                      src={networkInfo.qr_data_uri}
                      alt="Scan to open Phone Camera"
                      className="anpr-qr-code-img"
                    />
                  ) : (
                    <div className="anpr-qr-code-img" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="spinner"></span>
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
                      <span className="anpr-pulse-indicator"></span>
                      <strong style={{ fontSize: "0.9rem", color: "var(--text)" }}>
                        Connect Phone (Android App or QR)
                      </strong>
                    </div>

                    <div className="anpr-phone-step">
                      <span className="anpr-step-num">1</span>
                      <span>
                        <strong>VVAS Android App:</strong> Login with dedicated camera credentials{" "}
                        <code>gatecam</code> / <code>gatecam123</code> (or Guard/Admin <strong>📡 Cam</strong>) and tap <strong>Start Live Feed</strong>.
                      </span>
                    </div>
                    <div className="anpr-phone-step">
                      <span className="anpr-step-num">2</span>
                      <span>
                        <strong>Browser Option:</strong> Scan this QR code on the same Wi-Fi to snap &amp; upload.
                      </span>
                    </div>

                    <div style={{ marginTop: "8px", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      Direct Mobile URL:{" "}
                      <a
                        href={networkInfo.phone_camera_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--primary)", fontWeight: 600, wordBreak: "break-all" }}
                      >
                        {networkInfo.phone_camera_url}
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Option 2: Webcam / Continuity Camera / USB ── */}
          {inputMode === "local_cam" && (
            <div>
              {availableDevices.length > 0 && (
                <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    Camera Device:
                  </label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => {
                      setSelectedDeviceId(e.target.value);
                      startLocalCamera(e.target.value);
                    }}
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      fontSize: "0.85rem",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "var(--bg-input)",
                      color: "var(--text)",
                    }}
                  >
                    {availableDevices.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Camera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                    <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem" }}>Camera device is standby.</p>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => startLocalCamera()}>
                      Activate Camera Feed
                    </button>
                  </div>
                )}

                {cameraActive && (
                  <div style={{ position: "absolute", top: "10px", left: "10px", background: "rgba(0,0,0,0.65)", color: "#22c55e", padding: "3px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "badgeGlowPulse 1.5s infinite" }}></span>
                    LIVE CAMERA FEED
                  </div>
                )}
              </div>

              {cameraActive && (
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={loading}
                    onClick={handleCaptureLocalFrame}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                  >
                    <CpuIcon size={16} />
                    {loading ? "Processing..." : "Capture Frame & Detect Plate with Model"}
                  </button>
                  <button type="button" className="btn btn-outline" onClick={stopLocalCamera}>
                    <StopIcon size={16} /> Stop
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Option 3: Phone IP Camera Stream (IP Webcam / RTSP / Snapshot URL) ── */}
          {inputMode === "ip_stream" && (
            <div>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: "12px" }}>
                Use apps like <strong>IP Webcam</strong> (Android) or <strong>Live-Reporter</strong> (iOS). Enter the phone's local stream snapshot URL below:
              </p>

              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <input
                  type="text"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="e.g. http://192.168.1.15:8080/shot.jpg"
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: "0.85rem",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    background: "var(--bg-input)",
                    color: "var(--text)",
                    fontFamily: "monospace",
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading || !streamUrl.trim()}
                  onClick={() => handleFetchIpStream(false)}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <CpuIcon size={14} /> Fetch & Detect
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "var(--bg-input)", borderRadius: "6px", fontSize: "0.82rem" }}>
                <input
                  type="checkbox"
                  id="auto-fetch-ip"
                  checked={autoFetchIp}
                  onChange={(e) => setAutoFetchIp(e.target.checked)}
                />
                <label htmlFor="auto-fetch-ip" style={{ cursor: "pointer", color: "var(--text)" }}>
                  Auto-poll frame every 3.5 seconds from phone stream
                </label>
              </div>
            </div>
          )}

          {/* ── Option 4: Upload Photo ── */}
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

          {/* ── Option 5: Simulator ── */}
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
                Snap a photo from your phone, capture webcam, or select a sample on the left. The recognized license plate and matching visitor pass details will appear here.
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
                    Source: <strong>{detectedResult.source || "Camera Feed"}</strong>
                  </span>
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

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.85rem" }}>
                    <div>
                      <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.78rem" }}>Pass Reference</span>
                      <span className="pass-id-tag">{formatPassId(detectedResult.visitor_pass.id)}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.78rem" }}>Vehicle Number</span>
                      <code>{detectedResult.visitor_pass.vehicle_number}</code>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.78rem" }}>Visitor Name</span>
                      <strong>{detectedResult.visitor_pass.visitor_name}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.78rem" }}>Purpose of Visit</span>
                      <strong style={{ color: "var(--primary)" }}>{detectedResult.visitor_pass.purpose || "General Visit"}</strong>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.78rem" }}>Host Resident & Flat</span>
                      <strong>{detectedResult.visitor_pass.resident?.full_name || "—"}</strong> ({detectedResult.visitor_pass.resident?.flat_number || "Gate"})
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)", display: "block", fontSize: "0.78rem" }}>Current Status</span>
                      <span className="badge badge-in_campus" style={{ fontSize: "0.75rem" }}>
                        {detectedResult.visitor_pass.status?.toUpperCase()}
                      </span>
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
                      <PrinterIcon size={16} /> Print Pass
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
                    <label style={{ fontSize: "0.78rem", fontWeight: 600 }}>Purpose of Visit *</label>
                    <input
                      type="text"
                      value={walkinPurpose}
                      onChange={(e) => setWalkinPurpose(e.target.value)}
                      placeholder="e.g. Delivery, Guest Visit, Maintenance, Cab"
                      required
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

      {/* ─── Detailed ANPR Vehicle Access Records Table with All Columns ─── */}
      <div className="panel" style={{ marginTop: "10px" }}>
        <div className="panel-header">
          <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CarPlateIcon size={20} /> ANPR Vehicle Access Records & Activity Log
          </h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleExportRecords}
              style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              <ExportIcon size={14} /> Export CSV
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={fetchActivityRecords}
              style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              <RefreshIcon size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* Search & Action Filter Bar */}
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px", marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div className="search-filter-box" style={{ flex: 1, minWidth: "240px", marginBottom: 0 }}>
              <SearchIcon className="search-icon" size={16} />
              <input
                type="text"
                className="search-input"
                placeholder="Search by vehicle plate, visitor name, purpose of visit, host resident..."
                value={recordsSearchQuery}
                onChange={(e) => setRecordsSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <label style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                <FilterIcon size={16} /> Action:
              </label>
              <select
                value={recordsActionFilter}
                onChange={(e) => setRecordsActionFilter(e.target.value)}
                style={{
                  padding: "8px 12px",
                  fontSize: "0.85rem",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-input)",
                  color: "var(--text)",
                  fontWeight: 500,
                }}
              >
                <option value="all">All Gate Actions</option>
                <option value="entry">Entry Only</option>
                <option value="exit">Exit Only</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table with all columns including Purpose of Visit */}
        {filteredRecords.length === 0 ? (
          <p className="empty-state">No vehicle access activity recorded yet.</p>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pass ID</th>
                  <th>Vehicle Plate</th>
                  <th>Visitor Name</th>
                  <th>Purpose of Visit</th>
                  <th>Host Resident / Flat</th>
                  <th>Gate Action</th>
                  <th>Logged By Guard</th>
                  <th>Time Recorded</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r, i) => (
                  <tr key={r.log_id || i}>
                    <td>
                      {r.pass_id ? (
                        <span className="pass-id-tag">{formatPassId(r.pass_id)}</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Walk-In</span>
                      )}
                    </td>
                    <td>
                      <code style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--primary)" }}>
                        {r.vehicle_number}
                      </code>
                    </td>
                    <td><strong>{r.visitor_name}</strong></td>
                    <td>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.purpose || "—"}</span>
                    </td>
                    <td>
                      {r.resident_name} ({r.flat_number || "Gate"})
                    </td>
                    <td>
                      <span className={`badge badge-${r.action}`}>
                        {r.action.toUpperCase()}
                      </span>
                    </td>
                    <td>{r.guard_name}</td>
                    <td>{formatDateTime(r.timestamp)}</td>
                    <td>
                      <span className={`badge badge-${r.status}`}>
                        {r.status?.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
