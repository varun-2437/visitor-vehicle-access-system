import { useEffect } from "react";
import { CheckCircleIcon, XCircleIcon, AlertCircleIcon, BellIcon, CloseIcon } from "./Icons";

export default function Toast({ message, type = "success", onClose, duration = 4000 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  const renderIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircleIcon size={18} style={{ color: "var(--success)" }} />;
      case "error":
        return <XCircleIcon size={18} style={{ color: "var(--danger)" }} />;
      case "warning":
        return <AlertCircleIcon size={18} style={{ color: "var(--warning)" }} />;
      default:
        return <BellIcon size={18} style={{ color: "var(--primary)" }} />;
    }
  };

  return (
    <div className={`toast-container toast-${type}`}>
      <span className="toast-icon" style={{ display: "inline-flex", alignItems: "center" }}>{renderIcon()}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Close notification" style={{ display: "inline-flex", alignItems: "center" }}>
        <CloseIcon size={14} />
      </button>
    </div>
  );
}
