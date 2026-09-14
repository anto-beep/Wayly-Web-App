// Mobile mirror of web frontend/src/lib/statementFields.js. Derives the
// register/detail fields (period, provider, gross total, closing balance,
// decode status, flags) from the persisted Statement document so the mobile
// register reads identically to web.
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Stmt = {
  id: string;
  filename?: string;
  period_label?: string | null;
  uploaded_at?: string;
  created_at?: string;
  state?: string;
  parsing_warnings?: any[];
  has_note?: boolean;
  line_items?: any[];
  anomalies?: any[];
  extracted_json?: any;
  audit_json?: any;
};

function toDateSafe(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** Compact billing period, e.g. "1,31 Oct 2025", falling back to period_label. */
export function periodCompact(stmt: Stmt): string {
  const ex = stmt?.extracted_json || {};
  const s = toDateSafe(ex.period_start || ex.statement_period_start);
  const e = toDateSafe(ex.period_end || ex.statement_period_end);
  if (s && e) {
    const sMonth = MONTHS_SHORT[s.getUTCMonth()];
    const eMonth = MONTHS_SHORT[e.getUTCMonth()];
    const sYear = s.getUTCFullYear();
    const eYear = e.getUTCFullYear();
    if (sMonth === eMonth && sYear === eYear) return `${s.getUTCDate()},${e.getUTCDate()} ${eMonth} ${eYear}`;
    if (sYear === eYear) return `${s.getUTCDate()} ${sMonth},${e.getUTCDate()} ${eMonth} ${eYear}`;
    return `${s.getUTCDate()} ${sMonth} ${sYear},${e.getUTCDate()} ${eMonth} ${eYear}`;
  }
  return stmt?.period_label || stmt?.filename || "—";
}

export function providerName(stmt: Stmt): string {
  const ex = stmt?.extracted_json || {};
  return ex.provider_name || ex.provider?.name || ex.header?.provider_name || (stmt as any)?.provider_name || "Unknown provider";
}

export function grossTotal(stmt: Stmt): number {
  const ex = stmt?.extracted_json || {};
  const t = ex.totals || ex.summary || {};
  const gross = Number(t.gross_total ?? t.total ?? t.grand_total);
  if (Number.isFinite(gross) && gross > 0) return gross;
  return (stmt?.line_items || []).reduce((a: number, li: any) => a + (Number(li.total) || 0), 0);
}

export function closingBalance(stmt: Stmt): number | null {
  const audit = stmt?.audit_json || {};
  const bal = audit.balance || audit.closing || {};
  const v = Number(bal.closing_balance ?? bal.closing ?? bal.balance);
  if (Number.isFinite(v)) return v;
  const ex = stmt?.extracted_json || {};
  const v2 = Number(ex.closing_balance ?? ex.totals?.closing_balance);
  return Number.isFinite(v2) ? v2 : null;
}

export function flagsCount(stmt: Stmt): number {
  return (stmt?.anomalies || []).filter((a: any) => a?.severity === "alert" || a?.severity === "warning").length;
}

/** "clean" | "flagged" | "processing" | "failed" */
export function decodeStatus(stmt: Stmt): "clean" | "flagged" | "processing" | "failed" {
  if (!stmt) return "processing";
  if (stmt.state === "processing") return "processing";
  if (stmt.state === "failed") return "failed";
  const warnings = stmt.parsing_warnings || [];
  if (warnings.length > 0 && (!stmt.line_items || stmt.line_items.length === 0)) return "failed";
  return flagsCount(stmt) > 0 ? "flagged" : "clean";
}

export function periodSortKey(stmt: Stmt): number {
  const ex = stmt?.extracted_json || {};
  const end = toDateSafe(ex.period_end || ex.statement_period_end);
  if (end) return end.getTime();
  const up = toDateSafe(stmt?.uploaded_at);
  return up ? up.getTime() : 0;
}

export function uploadedLabel(uploadedAt?: string): string {
  const d = toDateSafe(uploadedAt);
  if (!d) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 14) return `${days} days ago`;
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const STATUS_LABEL: Record<string, string> = {
  clean: "Clean",
  flagged: "Flagged",
  processing: "Processing",
  failed: "Failed",
};
