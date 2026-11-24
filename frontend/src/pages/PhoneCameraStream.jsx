import React, { useState, useRef, useEffect } from "react";
import API from "../api";

export default function PhoneCameraStream() {
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState("environment"); // "environment" (rear) or "user"
  const [transmitting, setTransmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("info"); // "info", "success", "error"
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [lastTransmittedTime, setLastTransmittedTime] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [facingMode]);

  const startCamera = async () => {
    stopCamera();
    setStatusMessage("Opening mobile gate camera...");
    setStatusType("info");

    try {
      const constraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setCameraActive(true);
      setStatusMessage("Gate camera live. Align vehicle number plate inside frame.");
      setStatusType("info");

      // Check if camera supports flashlight/torch
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.() || {};
      setHasTorch(Boolean(capabilities.torch));
    } catch (err) {
      console.error("Camera access failed:", err);
      setCameraActive(false);
      setStatusMessage("Could not open camera directly. You can use 'Snap with Phone Camera App' button below.");
      setStatusType("error");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn("Torch control error:", e);
    }
  };

  // Capture frame from video stream and transmit to laptop dashboard
  const handleSnapAndTransmit = async () => {
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

      await transmitFrameData(dataUrl);
    } catch (err) {
      setStatusMessage("Failed to capture frame from video: " + err.message);
      setStatusType("error");
      setTransmitting(false);
    }
  };

  // Handle image selected via phone camera app / file chooser
  const handleFileChosen = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTransmitting(true);
    setStatusMessage("Transmitting phone photo to laptop...");
    setStatusType("info");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("device_info", navigator.userAgent.includes("iPhone") ? "iPhone Camera" : "Android Phone Camera");

    try {
      const res = await API.post("/api/anpr/remote-frame", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      handleTransmitSuccess(res.data);
    } catch (err) {
      setStatusMessage("Failed to upload phone snapshot: " + (err.response?.data?.detail || err.message));
      setStatusType("error");
    } finally {
      setTransmitting(false);
    }
  };

  const transmitFrameData = async (base64Data) => {
    const formData = new FormData();
    formData.append("image_base64", base64Data);
    formData.append("device_info", navigator.userAgent.includes("iPhone") ? "iPhone Camera" : "Mobile Phone Camera");

    try {
      const res = await API.post("/api/anpr/remote-frame", formData);
      handleTransmitSuccess(res.data);
    } catch (err) {
      setStatusMessage("Failed to send frame to laptop: " + (err.response?.data?.detail || err.message));
      setStatusType("error");
    } finally {
      setTransmitting(false);
    }
  };

  const handleTransmitSuccess = (data) => {
    navigator.vibrate?.([80, 50, 80]); // Haptic feedback on phone
    const timeStr = new Date().toLocaleTimeString();
    setLastTransmittedTime(timeStr);
    setStatusMessage(`✅ Frame transmitted to laptop! Look at your laptop dashboard for model detection results.`);
    setStatusType("success");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#090d16",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "16px",
        boxSizing: "border-box",
      }}
    >
      {/* Mobile Top Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: "12px",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          marginBottom: "14px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1.4rem" }}>🚗</span>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>VVAS Phone Gate Camera</h1>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8" }}>Laptop ANPR Input Client</div>
          </div>
        </div>

        <div
          style={{
            background: "rgba(34, 197, 94, 0.15)",
            border: "1px solid #22c55e",
            color: "#4ade80",
            fontSize: "0.72rem",
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }}></span>
          LINKED
        </div>
      </div>

      {/* Status Bar */}
      <div
        style={{
          padding: "10px 14px",
          borderRadius: "8px",
          fontSize: "0.85rem",
          fontWeight: 600,
          marginBottom: "14px",
          background:
            statusType === "success"
              ? "rgba(34, 197, 94, 0.2)"
              : statusType === "error"
              ? "rgba(239, 68, 68, 0.2)"
              : "rgba(59, 130, 246, 0.15)",
          color:
            statusType === "success"
              ? "#86efac"
              : statusType === "error"
              ? "#fca5a5"
              : "#93c5fd",
          border:
            statusType === "success"
              ? "1px solid #22c55e"
              : statusType === "error"
              ? "1px solid #ef4444"
              : "1px solid rgba(59, 130, 246, 0.4)",
          textAlign: "center",
        }}
      >
        {statusMessage}
      </div>

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
          minHeight: "360px",
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

        {/* Target Plate Guide Box Overlay */}
        {cameraActive && (
          <div
            style={{
              position: "absolute",
              width: "78%",
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

        {/* Viewfinder Controls (Torch & Flip) */}
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
              title="Switch Front/Rear Camera"
            >
              🔄
            </button>
          </div>
        )}
      </div>

      {/* Main Snap Action Button */}
      <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {cameraActive && (
          <button
            type="button"
            onClick={handleSnapAndTransmit}
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
            {transmitting ? "Transmitting..." : "Snap & Send Plate to Laptop"}
          </button>
        )}

        {/* Fallback Native Camera App Button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChosen}
          style={{ display: "none" }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={transmitting}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.25)",
            background: "rgba(255,255,255,0.08)",
            color: "#ffffff",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          📷 Open Phone Camera App / Choose Photo
        </button>

        {!cameraActive && (
          <button
            type="button"
            onClick={startCamera}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: "10px",
              border: "none",
              background: "#2563eb",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            Start Camera Viewfinder
          </button>
        )}

        {lastTransmittedTime && (
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", textAlign: "center", marginTop: "4px" }}>
            Last snapshot sent at: <strong>{lastTransmittedTime}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
