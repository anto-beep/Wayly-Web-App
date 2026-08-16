export function money(n: number | null | undefined): string {
  const v = typeof n === "number" && !isNaN(n) ? n : 0;
  return v.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
}

export function moneyWhole(n: number | null | undefined): string {
  const v = typeof n === "number" && !isNaN(n) ? n : 0;
  return v.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

// Wayly rule: AI copy uses a friendly-expert tone with NO dashes or em-dashes.
export function sanitizeAI(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/,\s*,/g, ",");
}

// Wayly rule (UI-1 §0.6): render ALL full dates as DD/MM/YYYY (Australian),
// datetimes as DD/MM/YYYY HH:mm (24h), month-only as "Month YYYY". Mirrors
// the web util frontend/src/lib/formatDate.js so web and mobile read identically.
const _pad = (n: number) => String(n).padStart(2, "0");

export function shortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${_pad(d.getDate())}/${_pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Canonical alias, prefer formatDate in new code.
export const formatDate = shortDate;

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${shortDate(iso)} ${_pad(d.getHours())}:${_pad(d.getMinutes())}`;
}

const _MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function formatMonthYear(value?: string | null): string {
  if (!value) return "";
  const s = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return `${_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return shortDate(iso);
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

// Time-of-day greeting for the logged-in caregiver.
export function greetingFor(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// Whole days remaining until an ISO date (0 if today/past, null if invalid).
export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (isNaN(end)) return null;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

export function verdictTone(v?: string): { label: string; tone: "success" | "alert" | "error" | "neutral" } {
  switch (v) {
    case "looks_clear":
    case "ok":
      return { label: "Looks clear", tone: "success" };
    case "check_before_paying":
      return { label: "Check before paying", tone: "alert" };
    case "do_not_pay":
    case "hold":
      return { label: "Hold — review", tone: "error" };
    default:
      return { label: "Reviewed", tone: "neutral" };
  }
}
