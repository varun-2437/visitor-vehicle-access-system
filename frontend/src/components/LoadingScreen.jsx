import React from "react";
import vmsLogo from "../assets/vms_logo.svg";

export default function LoadingScreen({ message = "Loading Visitor Vehicle Access System..." }) {
  return (
    <div className="loading-screen-overlay" role="status" aria-live="polite">
      <div className="loading-screen-card">
        <img src={vmsLogo} alt="VMS Logo" className="loading-logo-pulse" />
        <div className="loading-spinner-ring">
          <div className="spinner-inner"></div>
        </div>
        <p className="loading-screen-text">{message}</p>
      </div>
    </div>
  );
}
