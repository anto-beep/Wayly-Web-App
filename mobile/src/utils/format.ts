export function money(n: number | null | undefined): string {
  const v = typeof n === "number" && !isNaN(n) ? n : 0;
  return v.toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
}

export function shortDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
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
