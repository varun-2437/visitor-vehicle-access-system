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

/**
 * Standardizes vehicle pass ID formatting, e.g. 1 -> "#VP-00001"
 */
export function formatPassId(id) {
  if (id === null || id === undefined) return "—";
  return `#VP-${String(id).padStart(5, "0")}`;
}

/**
 * Formats a Date object as local "YYYY-MM-DDTHH:mm" for datetime-local inputs.
 */
export function toLocalDateTimeInput(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Computes { fromDate, toDate } local input strings for preset filters ("all", "today", "yesterday", "last7").
 */
export function getPresetDateRange(preset) {
  if (preset === "all") return { fromDate: "", toDate: "" };
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (preset === "last7") {
    start.setDate(start.getDate() - 7);
  }

  return {
    fromDate: toLocalDateTimeInput(start),
    toDate: toLocalDateTimeInput(end),
  };
}
