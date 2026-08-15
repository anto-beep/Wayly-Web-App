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
