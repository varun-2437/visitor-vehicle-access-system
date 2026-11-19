import React, { useState, useEffect } from "react";
import { formatDateTime, formatPassId } from "../utils/datetime";
import {
  PrinterIcon,
  DownloadIcon,
  CloseIcon,
  QrTicketIcon,
  CheckIcon,
  ClipboardIcon,
} from "./Icons";
import "./PrintablePassModal.css";

export default function PrintablePassModal({ pass, onClose, hostInfo }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!pass) return null;

  const handlePrint = () => {
    window.print();
  };

  const qrSrc =
    pass.qr_image_path?.startsWith("data:") || pass.qr_image_path?.startsWith("http")
      ? pass.qr_image_path
      : pass.qr_image_path
      ? `http://${window.location.hostname}:8000${pass.qr_image_path}`
      : null;

  const handleDownload = () => {
    if (!qrSrc) return;
    const a = document.createElement("a");
    a.href = qrSrc;
    a.download = `Visitor_Pass_${pass.vehicle_number || pass.visitor_name}_QR.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyToken = () => {
    if (pass.qr_token) {
      navigator.clipboard.writeText(pass.qr_token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Determine host resident & flat number
  const hostName =
    pass.resident?.full_name ||
    hostInfo?.full_name ||
    (pass.resident?.username ? `@${pass.resident.username}` : "Host Resident");
  const hostFlat =
    pass.resident?.flat_number ||
    hostInfo?.flat_number ||
    "Campus Gate / Front Office";

  // Format Status label and CSS class
  const statusKey = pass.status || "not_inside";
  const statusMap = {
    not_inside: { label: "Pre-Approved (Awaiting Entry)", cls: "status-not_inside" },
    approved: { label: "Pre-Approved (Awaiting Entry)", cls: "status-not_inside" },
    pending: { label: "Pre-Approved (Awaiting Entry)", cls: "status-not_inside" },
    in_campus: { label: "Active Pass — Vehicle Inside Campus", cls: "status-in_campus" },
    used: { label: "Active Pass — Vehicle Inside Campus", cls: "status-in_campus" },
    exited: { label: "Visit Completed (Vehicle Exited)", cls: "status-exited" },
    expired: { label: "Pass Expired (Invalid for Entry)", cls: "status-expired" },
  };
  const statusInfo = statusMap[statusKey] || {
    label: String(statusKey).toUpperCase(),
    cls: "status-not_inside",
  };

  return (
    <div className="printable-pass-overlay" onClick={onClose}>
      <div
        className="printable-pass-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="printable-pass-title"
      >
        {/* Action Toolbar Header (Screen Only) */}
        <div className="printable-pass-actions no-print">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <QrTicketIcon size={18} style={{ color: "var(--primary, #3b82f6)" }} />
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
              Printable Gate Pass
            </span>
          </div>

          <div className="pass-action-btn-group">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={handlePrint}
              title="Print pass or Save as PDF (Ctrl/Cmd + P)"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <PrinterIcon size={15} />
              <span>Print / PDF</span>
            </button>

            {qrSrc && (
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={handleDownload}
                title="Download QR code image"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <DownloadIcon size={15} />
                <span>Save QR</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={handleCopyToken}
              title="Copy UUID Token to Clipboard"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              {copied ? <CheckIcon size={15} style={{ color: "#16a34a" }} /> : <ClipboardIcon size={15} />}
              <span>{copied ? "Copied!" : "Token"}</span>
            </button>

            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={onClose}
              aria-label="Close pass modal"
              style={{ padding: "6px 10px" }}
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        {/* Printable Pass Ticket Card (What prints on A4/PDF) */}
        <div className="printable-pass-card">
          {/* Header */}
          <div className="pass-header">
            <div className="pass-org-badge">Smart Visitor Vehicle Access System</div>
            <h2 id="printable-pass-title" className="pass-title">
              DIGITAL VISITOR GATE PASS
            </h2>
            <div className="pass-serial">
              PASS REF: <strong>{formatPassId(pass.id)}</strong>
            </div>
          </div>

          {/* Status Strip */}
          <div className={`pass-status-strip ${statusInfo.cls}`}>
            {statusInfo.label}
          </div>

          {/* Details Grid */}
          <div className="pass-details-grid">
            <div className="pass-field">
              <span className="pass-label">Visitor Name</span>
              <span className="pass-val">{pass.visitor_name}</span>
            </div>

            <div className="pass-field">
              <span className="pass-label">Vehicle Registration</span>
              <span className="pass-val">
                {pass.vehicle_number ? (
                  <span className="pass-plate-box">{pass.vehicle_number.toUpperCase()}</span>
                ) : (
                  <span style={{ color: "#64748b", fontWeight: 500 }}>Walk-in / No Vehicle</span>
                )}
              </span>
            </div>

            <div className="pass-field">
              <span className="pass-label">Host Resident</span>
              <span className="pass-val">{hostName}</span>
            </div>

            <div className="pass-field">
              <span className="pass-label">Destination Flat</span>
              <span className="pass-val">{hostFlat}</span>
            </div>

            <div className="pass-field full-width">
              <span className="pass-label">Purpose of Visit</span>
              <span className="pass-val" style={{ fontWeight: 600 }}>
                {pass.purpose || "General Visitor Access"}
              </span>
            </div>

            <div className="pass-field">
              <span className="pass-label">Issued / Allowed In-Time</span>
              <span className="pass-val" style={{ fontSize: "0.85rem" }}>
                {formatDateTime(pass.created_at)}
              </span>
            </div>

            <div className="pass-field">
              <span className="pass-label">Valid Until (Expiry)</span>
              <span className="pass-val" style={{ fontSize: "0.85rem", color: "#b91c1c" }}>
                {formatDateTime(pass.expires_at)}
              </span>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="pass-qr-section">
            {qrSrc ? (
              <img
                src={qrSrc}
                alt={`QR Pass for ${pass.visitor_name}`}
                className="pass-qr-image"
              />
            ) : (
              <div style={{ padding: "40px", color: "#64748b", fontSize: "0.85rem" }}>
                QR Image processing...
              </div>
            )}
            <p className="pass-qr-token">
              TOKEN: <code>{pass.qr_token}</code>
            </p>
          </div>

          {/* Footer Security Instructions */}
          <p className="pass-instructions">
            <strong>Security Advisory:</strong> Present this digital pass QR code to the
            security guard scanner at the gate for automatic vehicle entry &amp; exit
            verification. Valid exclusively for the authorized visitor and vehicle.
          </p>
        </div>
      </div>
    </div>
  );
}
