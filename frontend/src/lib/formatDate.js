/**
 * UI-1 §0.6, centralised date formatter.
 *
 * Always render dates in the product as DD/MM/YYYY (Australian English default).
 * For datetimes use formatDateTime → DD/MM/YYYY HH:mm. No hard-coded format()
 * strings elsewhere in the product, every caller goes through this util.
 */

const pad = (n) => String(n).padStart(2, "0");

const _toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === "number") {
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value === "string") {
        // Already-formatted DD/MM/YYYY (AU) parses wrongly via new Date();
        // convert it explicitly so display stays stable when values are mixed.
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
        if (m) {
            const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
            return isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(value);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
};

/** Render a month value as full "Month YYYY", e.g. "May 2026". Accepts either
 *  an ISO YYYY-MM string, ISO YYYY-MM-DD string, or a Date. Returns "" for
 *  nullish/invalid input. Used everywhere the copy rules require full month
 *  names (notifications, PDFs, adviser stats). Never render "2026-05". */
export function formatMonthYear(value) {
    if (!value) return "";
    let d = null;
    if (value instanceof Date) {
        d = isNaN(value.getTime()) ? null : value;
    } else if (typeof value === "string") {
        // Accept plain "YYYY-MM" too, Date() parses that as UTC 1st-of-month.
        const s = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value;
        const parsed = new Date(s);
        d = isNaN(parsed.getTime()) ? null : parsed;
    }
    if (!d) return "";
    const MONTHS = ["January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"];
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Replace raw ISO "YYYY-MM" month tokens inside a text blob with "Month YYYY"
 *  (e.g. "2026-05" → "May 2026"). Guards stored alert/notification bodies that
 *  were written before the copy rules landed. Leaves full dates alone. */
export function humanizeMonths(text) {
    if (typeof text !== "string" || !text) return text;
    return text.replace(/\b(\d{4})-(0[1-9]|1[0-2])\b(?!-\d)/g, (_m, y, mo) => formatMonthYear(`${y}-${mo}`));
}

/** Render a date value as DD/MM/YYYY. Returns the empty string for nullish/invalid. */
export function formatDate(value) {
    const d = _toDate(value);
    if (!d) return "";
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Render a date+time as DD/MM/YYYY HH:mm (24h). */
export function formatDateTime(value) {
    const d = _toDate(value);
    if (!d) return "";
    return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Render a relative "x ago" string, falling back to formatDate for older items. */
export function formatRelative(value) {
    const d = _toDate(value);
    if (!d) return "";
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(d);
}

export default formatDate;
