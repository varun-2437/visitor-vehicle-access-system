import { useState, useEffect } from "react";
import { CalendarIcon, ClockIcon } from "./Icons";

export default function LiveClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = time.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const formattedTime = time.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="live-clock" title="Current Real-Time Date & Clock" style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
      <span className="clock-date" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
        <CalendarIcon size={14} /> {formattedDate}
      </span>
      <span className="clock-time" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
        <ClockIcon size={14} /> {formattedTime}
      </span>
    </div>
  );
}
