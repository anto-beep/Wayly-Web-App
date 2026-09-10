// Friendly, plain-English category from a technical rule code like
// "RULE_4_AT_HM_STREAM_MISCODING" -> "Wrong funding category".
export function ruleLabel(rule?: string | null): string {
  if (!rule) return "";
  const r = String(rule).toUpperCase();
  const map: [RegExp, string][] = [
    [/DUPLICATE/, "Possible duplicate"],
    [/CARE_MGMT|CARE_MANAGEMENT|_CAP/, "Care management fee"],
    [/AT_HM|ATHM/, "Wrong funding category"],
    [/ARITHMETIC|TOTAL|GAP|RECONCIL/, "Totals check"],
    [/CONTRIB|PENSION|MEANS/, "Contribution check"],
    [/STREAM|CLASSIF|MISCOD/, "Category check"],
    [/GST/, "GST check"],
    [/RATE/, "Rate check"],
    [/DATE|BACKDAT|PERIOD/, "Timing check"],
  ];
  for (const [re, label] of map) if (re.test(r)) return label;
  const cleaned = r.replace(/^RULE_?\d+[A-Z]?_?/, "").replace(/_/g, " ").trim().toLowerCase();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Flagged";
}

export function money(n: number | null | undefined): string {  const v = typeof n === "number" && !isNaN(n) ? n : 0;
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

// Turn AI/technical copy into plain English (mirrors web lib/plainText.humanize
// for the key cases): AU dates, drop stream codes and snake_case field names.
function humanizeText(input?: string | null): string {
  let s = sanitizeAI(input || "");
  if (!s) return s;
  // YYYY-MM-DD -> DD/MM/YYYY anywhere
  s = s.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, m, d) => `${d}/${m}/${y}`);
  s = s
    .replace(/\bstream\s*=?\s*'?([A-Za-z][A-Za-z\s-]*?)'?(?=[\s.,)])/gi, "category \u201c$1\u201d")
    .replace(/\bAT[-\s]?HM\b/g, "government-funded support")
    .replace(/\bATHM\b/g, "government-funded support")
    .replace(/\bINDEX[-_\s]?1\b/gi, "the official price guide")
    .replace(/\bRULE[_\s]?[A-Z0-9]+(?:_[A-Z0-9]+)*\b/g, "")
    .replace(/\bmeans[-\s]tested\b/gi, "income-assessed")
    .replace(/\b([a-z]+(?:_[a-z]+)+)\b/g, (m: string) => m.replace(/_/g, " "))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
  return s;
}

// Collapse long inline runs of dates into "(N dates)" so explanations stay
// readable. Mirrors web lib/plainText.condenseDates.
export function condenseDates(input?: string | null): string {
  let s = humanizeText(input);
  s = s.replace(/\(([^)]*)\)/g, (m, inner) => {
    const dates = String(inner).match(/\d{2}\/\d{2}\/\d{4}/g);
    return dates && dates.length >= 3 ? `(${dates.length} dates)` : m;
  });
  s = s.replace(/\d{2}\/\d{2}\/\d{4}(?:\s*,\s*\d{2}\/\d{2}\/\d{4}){2,}/g, (m) => {
    const dates = m.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    return `${dates.length} dates`;
  });
  return s;
}

// A clean, short, properly-capitalised heading from a headline sentence. The
// backend headlines are already whole sentences — humanise, drop any trailing
// parenthetical/second clause, strip the full stop and capitalise.
export function cleanTitle(input?: string | null, max = 96): string {
  let h = condenseDates(input).trim();
  if (!h) return "Something to check";
  h = h.replace(/^line[-\s]?items?\s+(?:dated\s+\S+\s+)?(?:for\s+)?/i, "");
  h = h.split(/\s+\(/)[0];
  h = h.split(/,\s/)[0];
  h = h.replace(/[.\s]+$/, "").trim();
  if (h.length > max) {
    const slice = h.slice(0, max);
    const sp = slice.lastIndexOf(" ");
    h = (sp > 0 ? slice.slice(0, sp) : slice).trim();
  }
  return h.charAt(0).toUpperCase() + h.slice(1);
}

// Plain, complete explanation: humanised + date-condensed, capped at a SENTENCE
// boundary (never mid-number) so nothing reads as a broken fragment.
export function plainBody(input?: string | null, max = 340): string {
  const h = condenseDates(input).trim();
  if (!h || h.length <= max) return h;
  const slice = h.slice(0, max);
  const dot = slice.lastIndexOf(". ");
  if (dot > max * 0.5) return slice.slice(0, dot + 1);
  const sp = slice.lastIndexOf(" ");
  return (sp > 0 ? slice.slice(0, sp) : slice).trim() + "\u2026";
}

// A single "From your statement" evidence line, in plain English: strips
// internal codes (INDEX-1, rule codes, snake_case), formats AU dates and
// capitalises the first letter. Mirrors the web FlagCard evidence fix.
export function plainEvidence(input?: string | null): string {
  const h = humanizeText(input).trim();
  return h ? h.charAt(0).toUpperCase() + h.slice(1) : "";
}

// Wayly rule (UI-1 §0.6): render ALL full dates as DD/MM/YYYY (Australian),
// datetimes as DD/MM/YYYY HH:mm (24h), month-only as "Month YYYY". Mirrors
// the web util frontend/src/lib/formatDate.js so web and mobile read identically.
const _pad = (n: number) => String(n).padStart(2, "0");

export function shortDate(iso?: string | null): string {
  if (!iso) return "";
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(iso).trim());
  const d = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(iso);
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
