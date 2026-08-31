import { useState, useEffect } from "react";
import { WifiOffIcon } from "./Icons";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="offline-banner" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <WifiOffIcon size={18} />
      <span>
        <strong>You're currently offline.</strong> Changes will sync automatically when network connection is restored.
      </span>
    </div>
  );
}
