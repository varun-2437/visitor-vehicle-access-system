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

/**
 * Returns local YYYY-MM-DD key from ISO date string
 */
export function getDateKey(dateStr) {
  if (!dateStr) return "1970-01-01";
  const isoStr = (typeof dateStr === "string" && !dateStr.endsWith("Z") && !dateStr.includes("+"))
    ? dateStr + "Z"
    : dateStr;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "1970-01-01";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats YYYY-MM-DD to a clean date header string (e.g. Monday, Aug 24, 2026)
 */
export function formatDateGroupHeader(dateKey) {
  if (!dateKey || dateKey === "1970-01-01") return "Unknown Date";
  const [year, month, day] = dateKey.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
