/**
 * Formats ISO date string from backend to user's local date and time string cleanly.
 * Ensures UTC timestamps without 'Z' are parsed correctly as UTC.
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const isoStr = (typeof dateStr === "string" && !dateStr.endsWith("Z") && !dateStr.includes("+"))
    ? dateStr + "Z"
    : dateStr;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Formats time string only (e.g. 11:15:30 AM)
 */
export function formatTimeOnly(dateStr) {
  if (!dateStr) return "—";
  const isoStr = (typeof dateStr === "string" && !dateStr.endsWith("Z") && !dateStr.includes("+"))
    ? dateStr + "Z"
    : dateStr;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
