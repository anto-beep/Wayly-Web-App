// Maps a notification's stored link (which uses the canonical WEB paths, e.g.
// "/app/statements/{id}") to a valid MOBILE (expo-router) route. Returns null
// when the link is empty or cannot be mapped to a real mobile screen, so the
// caller can skip navigation instead of landing on the "Unmatched route"
// screen. Keeping the mapping here (one place) means both the in-app
// notifications sheet and any future deep-link handler stay in sync.

// First path-segments that correspond to a real mobile route file under app/.
// Used to validate the generic "/app/<rest>" fallback below.
const KNOWN_MOBILE_SEGMENTS = new Set<string>([
  "about", "amendments", "athm-project", "athm", "audit", "budget-alerts",
  "budget-scenarios", "calendar", "care-plan-compare", "care-plan", "care-plans",
  "care-team", "carer-self-check", "case", "cases", "chsp-tools",
  "classification-prep", "compare-providers", "complaints", "contribution-position",
  "correspondence", "danger-zone", "documents", "family-members", "handover-pack",
  "hospital", "invoice", "invoices", "key-contacts", "letters", "pacing",
  "participants", "plan-billing", "plan-select", "price-history", "profile-edit",
  "profile", "provider-quality", "provider-switch", "ratings", "referrals",
  "report", "reports", "scenarios", "security", "short-term-pathways",
  "statement-audit", "statement-compare", "statement", "statements-archived",
  "support", "switch-decision", "switch-settlement", "timeline", "tool", "upload",
  "usage", "weekly-digest",
]);

function splitLink(link: string): { path: string; query: URLSearchParams } {
  const [rawPath, rawQuery = ""] = link.split("?");
  const path = rawPath.replace(/\/+$/, "") || "/";
  return { path, query: new URLSearchParams(rawQuery) };
}

export function resolveNotificationLink(link?: string | null): string | null {
  if (!link || typeof link !== "string") return null;
  if (!link.startsWith("/")) return null;

  const { path, query } = splitLink(link);
  const parts = path.split("/").filter(Boolean); // e.g. ["app","statements","123"]

  // --- Explicit web → mobile remaps -------------------------------------
  // Reports: /app/reports?report_id=X → /report/X ; else the reports list.
  if (path === "/app/reports" || path === "/reports") {
    const rid = query.get("report_id");
    return rid ? `/report/${rid}` : "/reports";
  }
  // Statements list / dashboard shortcuts.
  if (path === "/app/statements" || path === "/statements") return "/(tabs)/statements";
  if (path === "/app/invoices" || path === "/invoices") return "/invoices";
  // Caregiver wellbeing nudge points at the participant view → home dashboard.
  if (path === "/participant" || path === "/app/participant" || path === "/app") return "/(tabs)";
  // Settings-area links.
  if (path === "/settings/digest") return "/weekly-digest";
  if (path === "/settings/notifications" || path === "/settings") return "/settings";

  // Statement / invoice detail (web uses plural under /app, mobile is singular).
  if (parts[0] === "app" && parts[1] === "statements" && parts[2]) return `/statement/${parts[2]}`;
  if (parts[0] === "app" && parts[1] === "invoices" && parts[2]) return `/invoice/${parts[2]}`;

  // Already-mobile-shaped detail links.
  if (parts[0] === "statement" && parts[1]) return `/statement/${parts[1]}`;
  if (parts[0] === "invoice" && parts[1]) return `/invoice/${parts[1]}`;

  // --- Generic "/app/<rest>" fallback -----------------------------------
  // Many screens share the same slug on both surfaces (documents, complaints,
  // calendar, …). Strip the web "/app" prefix and accept only when the first
  // remaining segment is a known mobile route.
  if (parts[0] === "app" && parts[1] && KNOWN_MOBILE_SEGMENTS.has(parts[1])) {
    return "/" + parts.slice(1).join("/");
  }
  // A top-level link that already matches a known mobile route.
  if (parts[0] && KNOWN_MOBILE_SEGMENTS.has(parts[0])) {
    return path;
  }

  return null;
}
