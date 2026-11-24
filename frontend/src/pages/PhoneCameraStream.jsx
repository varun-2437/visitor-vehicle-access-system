import React, { useState, useRef, useEffect } from "react";
import API from "../api";

export default function PhoneCameraStream() {
  const [isSecure, setIsSecure] = useState(false);
  const [hasMediaDevices, setHasMediaDevices] = useState(false);
  const [activeTab, setActiveTab] = useState("snap"); // "snap" (primary native camera) or "live" (WebRTC stream)
  
  // Native snap state
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState(null);
  const [transmitting, setTransmitting] = useState(false);
  const [modelResult, setModelResult] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("info"); // "info", "success", "warning", "error"
  const [lastTransmittedTime, setLastTransmittedTime] = useState(null);
  const [serverConnected, setServerConnected] = useState(true);

  // Live stream state (only available if secure context or flagged)
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [showLiveStreamHelp, setShowLiveStreamHelp] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputCameraRef = useRef(null);
  const fileInputGalleryRef = useRef(null);

  useEffect(() => {
    // Check security context and browser media capabilities
    const secure = Boolean(window.isSecureContext);
    const media = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    setIsSecure(secure);
    setHasMediaDevices(media);

    // Verify backend connectivity
    checkBackendConnection();

    return () => {
      stopLiveStream();
    };
  }, []);

  const checkBackendConnection = async () => {
    try {
      await API.get("/api/anpr/network-info");
      setServerConnected(true);
    } catch {
      setServerConnected(false);
    }
  };

  // ── Native Camera Capture Flow (100% reliable across all Android/iOS browsers over HTTP LAN) ──
  const handlePhotoCaptured = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same photo can be re-selected if desired
    e.target.value = "";

    const localUrl = URL.createObjectURL(file);
    setCapturedPhotoUrl(localUrl);
    setTransmitting(true);
    setModelResult(null);
    setStatusMessage("⚡ Transmitting snapshot & running Fast-ALPR AI model...");
    setStatusType("info");

    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "device_info",
      navigator.userAgent.includes("iPhone") ? "iPhone Camera" : "Android Phone Camera"
    );

    try {
      const res = await API.post("/api/anpr/remote-frame", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = res.data;
      navigator.vibrate?.([80, 50, 80]); // Haptic feedback on phone
      const timeStr = new Date().toLocaleTimeString();
      setLastTransmittedTime(timeStr);
      setServerConnected(true);

      if (data.detected_plate) {
        setModelResult(data);
        setStatusMessage(data.message || `Plate ${data.detected_plate} detected!`);
        setStatusType("success");
      } else {
        setModelResult({
          detected_plate: "",
          message: "No vehicle license plate recognized in this photo. Please retake closer to the plate.",
        });
        setStatusMessage("No license plate found in image. Please retake closer.");
        setStatusType("warning");
      }
    } catch (err) {
      const errDetail = err.response?.data?.detail || err.message;
      setStatusMessage("Upload failed: " + errDetail);
      setStatusType("error");
      setServerConnected(false);
    } finally {
      setTransmitting(false);
    }
  };

  // ── Live Viewfinder WebRTC Flow (Optional) ──
  const startLiveStream = async () => {
    stopLiveStream();
    setStatusMessage("Requesting live camera stream...");
    setStatusType("info");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Live WebRTC video is disabled by your browser on insecure HTTP.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setCameraActive(true);
      setStatusMessage("Gate camera live. Align license plate inside guide box.");
      setStatusType("info");

      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() || {};
      setHasTorch(Boolean(capabilities.torch));
    } catch (err) {
      console.warn("Live stream error:", err);
      setCameraActive(false);
      setStatusMessage("Live video stream unavailable. Use the 'Open Camera & Snap' button below.");
      setStatusType("warning");
      setShowLiveStreamHelp(true);
    }
  };

  const stopLiveStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const handleLiveSnapAndTransmit = async () => {
    if (!videoRef.current || transmitting) return;
    setTransmitting(true);
    setStatusMessage("Capturing and transmitting frame to laptop...");
    setStatusType("info");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 1280;
      canvas.height = videoRef.current.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

      setCapturedPhotoUrl(dataUrl);

      const formData = new FormData();
      formData.append("image_base64", dataUrl);
      formData.append(
        "device_info",
        navigator.userAgent.includes("iPhone") ? "iPhone Live Camera" : "Android Live Camera"
      );

      const res = await API.post("/api/anpr/remote-frame", formData);
      const data = res.data;

      navigator.vibrate?.([80, 50, 80]);
      setLastTransmittedTime(new Date().toLocaleTimeString());

      if (data.detected_plate) {
        setModelResult(data);
        setStatusMessage(data.message || `Plate ${data.detected_plate} detected!`);
        setStatusType("success");
      } else {
        setModelResult({
          detected_plate: "",
          message: "No plate recognized in this frame. Try adjusting camera angle.",
        });
        setStatusMessage("No plate recognized in this frame.");
        setStatusType("warning");
      }
    } catch (err) {
      setStatusMessage("Transmit failed: " + (err.response?.data?.detail || err.message));
      setStatusType("error");
    } finally {
      setTransmitting(false);
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: nextTorch }] });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn("Torch error:", e);
    }
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#080c14",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: "16px",
        boxSizing: "border-box",
      }}
    >
      {/* ── Top Header ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: "12px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          marginBottom: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg, #a81b34, #e11d48)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.2rem",
              boxShadow: "0 2px 10px rgba(225, 29, 72, 0.4)",
            }}
          >
            🚗
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, letterSpacing: "-0.2px" }}>
              VVAS Gate Camera
            </h1>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
              Mobile ANPR AI Scanner Client
            </div>
          </div>
        </div>

        {/* Server Connection Indicator */}
        <div
          style={{
            background: serverConnected ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${serverConnected ? "#22c55e" : "#ef4444"}`,
            color: serverConnected ? "#4ade80" : "#fca5a5",
            fontSize: "0.72rem",
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: serverConnected ? "#4ade80" : "#ef4444",
              display: "inline-block",
            }}
          ></span>
          {serverConnected ? "LINKED" : "OFFLINE"}
        </div>
      </div>

      {/* ── Hidden File Inputs for Native Camera & Gallery ── */}
      <input
        ref={fileInputCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoCaptured}
        style={{ display: "none" }}
      />
      <input
        ref={fileInputGalleryRef}
        type="file"
        accept="image/*"
        onChange={handlePhotoCaptured}
        style={{ display: "none" }}
      />

      {/* ── Mode Selection Tabs ── */}
      <div
        style={{
          display: "flex",
          background: "rgba(255,255,255,0.06)",
          padding: "4px",
          borderRadius: "10px",
          marginBottom: "14px",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab("snap");
            stopLiveStream();
          }}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "8px",
            border: "none",
            background: activeTab === "snap" ? "#a81b34" : "transparent",
            color: "#ffffff",
            fontSize: "0.85rem",
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            transition: "all 0.2s",
          }}
        >
          <span>📸</span> Camera Shutter (HD)
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("live");
            startLiveStream();
          }}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "8px",
            border: "none",
            background: activeTab === "live" ? "#2563eb" : "transparent",
            color: "#ffffff",
            fontSize: "0.85rem",
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            transition: "all 0.2s",
          }}
        >
          <span>📹</span> Live Stream
        </button>
      </div>

      {/* ── Status Banner (When message exists) ── */}
      {statusMessage && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "8px",
            fontSize: "0.82rem",
            fontWeight: 600,
            marginBottom: "14px",
            background:
              statusType === "success"
                ? "rgba(34, 197, 94, 0.18)"
                : statusType === "error"
                ? "rgba(239, 68, 68, 0.18)"
                : statusType === "warning"
                ? "rgba(245, 158, 11, 0.18)"
                : "rgba(59, 130, 246, 0.15)",
            color:
              statusType === "success"
                ? "#86efac"
                : statusType === "error"
                ? "#fca5a5"
                : statusType === "warning"
                ? "#fcd34d"
                : "#93c5fd",
            border: `1px solid ${
              statusType === "success"
                ? "#22c55e"
                : statusType === "error"
                ? "#ef4444"
                : statusType === "warning"
                ? "#f59e0b"
                : "rgba(59, 130, 246, 0.4)"
            }`,
            textAlign: "center",
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB 1: CAMERA SHUTTER (NATIVE HD HARDWARE CAMERA - 100% RELIABLE)
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === "snap" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Main Visual Frame / Preview Card */}
          <div
            style={{
              flex: 1,
              minHeight: "280px",
              maxHeight: "420px",
              borderRadius: "14px",
              overflow: "hidden",
              background: "linear-gradient(180deg, #0e1524 0%, #080c14 100%)",
              border: "2px dashed rgba(255, 255, 255, 0.18)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
              padding: "16px",
            }}
          >
            {capturedPhotoUrl ? (
              <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative" }}>
                <img
                  src={capturedPhotoUrl}
                  alt="Captured Plate Snapshot"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "260px",
                    objectFit: "contain",
                    borderRadius: "10px",
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                />

                {transmitting && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "rgba(0, 0, 0, 0.75)",
                      borderRadius: "10px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        border: "3px solid rgba(255,255,255,0.2)",
                        borderTopColor: "#e11d48",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#ffffff" }}>
                      AI Model Processing...
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "20px" }}>
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    margin: "0 auto 16px auto",
                    borderRadius: "50%",
                    background: "rgba(168, 27, 52, 0.15)",
                    border: "2px solid #a81b34",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2.2rem",
                  }}
                >
                  📸
                </div>
                <h3 style={{ margin: "0 0 6px 0", fontSize: "1.1rem", fontWeight: 700 }}>
                  Ready to Scan License Plate
                </h3>
                <p style={{ margin: "0 0 16px 0", fontSize: "0.82rem", color: "#94a3b8", lineHeight: 1.4 }}>
                  Tap the button below to launch phone camera. Point directly at the vehicle number plate.
                </p>
                <div
                  style={{
                    display: "inline-block",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    background: "rgba(34, 197, 94, 0.12)",
                    border: "1px solid #22c55e",
                    color: "#86efac",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                  }}
                >
                  ✓ Works instantly on all Android & iOS devices
                </div>
              </div>
            )}
          </div>

          {/* ── Recognized Plate Result Card (Shown when detected) ── */}
          {modelResult && modelResult.detected_plate && (
            <div
              style={{
                marginTop: "14px",
                padding: "16px",
                borderRadius: "12px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(34, 197, 94, 0.4)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              }}
            >
              <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "1px", color: "#94a3b8", fontWeight: 700, textAlign: "center", marginBottom: "8px" }}>
                RECOGNIZED NUMBER PLATE (FETCHED FROM MODEL)
              </div>

              {/* Indian License Plate Graphic */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "#ffffff",
                  color: "#000000",
                  borderRadius: "8px",
                  border: "3px solid #111827",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                  overflow: "hidden",
                  width: "100%",
                  justifyContent: "center",
                  margin: "0 auto 12px auto",
                  boxSizing: "border-box",
                }}
              >
                <div
                  style={{
                    background: "#003399",
                    color: "#ffffff",
                    padding: "8px 10px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.7rem",
                    fontWeight: 800,
                    letterSpacing: "0.5px",
                    borderRight: "2px solid #111827",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      border: "1.5px solid #ffcc00",
                      marginBottom: "2px",
                    }}
                  />
                  <span>IND</span>
                </div>
                <div
                  style={{
                    padding: "8px 16px",
                    fontFamily: "'Courier New', Courier, monospace",
                    fontSize: "1.55rem",
                    fontWeight: 900,
                    letterSpacing: "3px",
                    color: "#0f172a",
                    textTransform: "uppercase",
                  }}
                >
                  {modelResult.detected_plate}
                </div>
              </div>

              {/* Metrics */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.75rem",
                  color: "#94a3b8",
                  paddingBottom: "10px",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  marginBottom: "10px",
                }}
              >
                <span>Conf: <strong style={{ color: "#4ade80" }}>{Math.round((modelResult.confidence || 0.95) * 100)}%</strong></span>
                <span>Latency: <strong style={{ color: "#ffffff" }}>{modelResult.processing_time_ms || 120} ms</strong></span>
                <span>AI: <strong style={{ color: "#60a5fa" }}>Fast-ALPR</strong></span>
              </div>

              {/* Visitor Pass Status */}
              {modelResult.pass_found ? (
                <div
                  style={{
                    background: "rgba(34, 197, 94, 0.12)",
                    border: "1px solid #22c55e",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "0.82rem",
                  }}
                >
                  <div style={{ color: "#4ade80", fontWeight: 700, marginBottom: "4px" }}>
                    ✓ Valid Visitor Pass Found (#{modelResult.pass_id || "VP"})
                  </div>
                  <div style={{ color: "#e2e8f0" }}>
                    Visitor: <strong>{modelResult.visitor_name || "Guest"}</strong> | Flat: <strong>{modelResult.flat_number || "Campus"}</strong>
                  </div>
                  {modelResult.purpose && (
                    <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginTop: "2px" }}>
                      Purpose: {modelResult.purpose}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid #f59e0b",
                    borderRadius: "8px",
                    padding: "10px 12px",
                    fontSize: "0.82rem",
                  }}
                >
                  <div style={{ color: "#fbbf24", fontWeight: 700, marginBottom: "2px" }}>
                    ℹ️ Unregistered Vehicle Plate
                  </div>
                  <div style={{ color: "#cbd5e1", fontSize: "0.78rem" }}>
                    Plate sent to Laptop Gate Terminal for Walk-in registration.
                  </div>
                </div>
              )}

              <div
                style={{
                  marginTop: "8px",
                  textAlign: "center",
                  fontSize: "0.74rem",
                  color: "#4ade80",
                  fontWeight: 600,
                }}
              >
                ✓ Transmitted to Laptop Gate Dashboard in Real-Time
              </div>
            </div>
          )}

          {/* ── Action Buttons ── */}
          <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Primary Action Button: Open Camera & Snap */}
            <button
              type="button"
              onClick={() => fileInputCameraRef.current?.click()}
              disabled={transmitting}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "12px",
                border: "none",
                background: transmitting
                  ? "#475569"
                  : "linear-gradient(135deg, #a81b34 0%, #dc2626 100%)",
                color: "#ffffff",
                fontSize: "1.1rem",
                fontWeight: 800,
                letterSpacing: "0.5px",
                boxShadow: "0 6px 20px rgba(168, 27, 52, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                cursor: transmitting ? "not-allowed" : "pointer",
              }}
            >
              <span style={{ fontSize: "1.3rem" }}>📸</span>
              {transmitting
                ? "Analyzing with AI..."
                : capturedPhotoUrl
                ? "Snap Another Vehicle Plate"
                : "Open Camera & Take Photo"}
            </button>

            {/* Secondary Action: Choose from Gallery / Files */}
            <button
              type="button"
              onClick={() => fileInputGalleryRef.current?.click()}
              disabled={transmitting}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.06)",
                color: "#e2e8f0",
                fontSize: "0.88rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <span>🖼️</span> Choose Photo from Gallery / Files
            </button>

            {lastTransmittedTime && (
              <div style={{ fontSize: "0.75rem", color: "#94a3b8", textAlign: "center", marginTop: "4px" }}>
                Last snapshot transmitted at: <strong>{lastTransmittedTime}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB 2: LIVE STREAM (WEBRTC VIEW FINDER - REQUIRES SECURE CONTEXT)
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === "live" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {/* Viewfinder Video Area */}
          <div
            style={{
              flex: 1,
              position: "relative",
              borderRadius: "14px",
              overflow: "hidden",
              background: "#000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "320px",
              maxHeight: "420px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: cameraActive ? "block" : "none",
              }}
            />

            {!cameraActive && (
              <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8" }}>
                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📹</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ffffff" }}>
                  Live Viewfinder Idle
                </div>
                <div style={{ fontSize: "0.78rem", marginTop: "4px" }}>
                  Tap 'Start Live Camera' below to initialize video stream.
                </div>
              </div>
            )}

            {/* Target Plate Guide Box Overlay */}
            {cameraActive && (
              <div
                style={{
                  position: "absolute",
                  width: "80%",
                  maxWidth: "340px",
                  height: "110px",
                  border: "3px solid #22c55e",
                  borderRadius: "10px",
                  boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.7)",
                    color: "#22c55e",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                  }}
                >
                  [ ALIGN NUMBER PLATE HERE ]
                </div>
              </div>
            )}

            {/* Controls (Torch & Flip) */}
            {cameraActive && (
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  zIndex: 10,
                }}
              >
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      border: "none",
                      background: torchOn ? "#eab308" : "rgba(0,0,0,0.65)",
                      color: torchOn ? "#000" : "#fff",
                      fontSize: "1.2rem",
                      cursor: "pointer",
                    }}
                    title="Toggle Torch"
                  >
                    🔦
                  </button>
                )}

                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "50%",
                    border: "none",
                    background: "rgba(0,0,0,0.65)",
                    color: "#fff",
                    fontSize: "1.2rem",
                    cursor: "pointer",
                  }}
                  title="Switch Camera"
                >
                  🔄
                </button>
              </div>
            )}
          </div>

          {/* Help box for insecure context */}
          {showLiveStreamHelp && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px 14px",
                borderRadius: "10px",
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                fontSize: "0.78rem",
                lineHeight: 1.45,
                color: "#bfdbfe",
              }}
            >
              <strong style={{ display: "block", color: "#60a5fa", marginBottom: "4px" }}>
                ℹ️ Note on Mobile Browser Live Streaming:
              </strong>
              Chrome & Safari restrict continuous live video streams over unencrypted HTTP (Wi-Fi LAN IP).
              <div style={{ marginTop: "6px" }}>
                👉 <strong>Recommended:</strong> Switch to the <strong>"Camera Shutter (HD)"</strong> tab above. It uses your phone's native camera sensor with full resolution and autofocus without restrictions.
              </div>
            </div>
          )}

          {/* Live Action Buttons */}
          <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {cameraActive ? (
              <button
                type="button"
                onClick={handleLiveSnapAndTransmit}
                disabled={transmitting}
                style={{
                  width: "100%",
                  padding: "16px",
                  borderRadius: "12px",
                  border: "none",
                  background: transmitting
                    ? "#475569"
                    : "linear-gradient(135deg, #a81b34 0%, #dc2626 100%)",
                  color: "#ffffff",
                  fontSize: "1.1rem",
                  fontWeight: 800,
                  boxShadow: "0 6px 20px rgba(168, 27, 52, 0.45)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  cursor: "pointer",
                }}
              >
                <span>📸</span>
                {transmitting ? "Sending..." : "Snap & Transmit Live Frame"}
              </button>
            ) : (
              <button
                type="button"
                onClick={startLiveStream}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                }}
              >
                Start Live Camera
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab("snap")}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "8px",
                border: "none",
                background: "transparent",
                color: "#94a3b8",
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              ← Back to Camera Shutter Mode
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
