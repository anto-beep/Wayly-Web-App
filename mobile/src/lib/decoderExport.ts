// Decoder export helpers for mobile — CSV + PDF, mirroring the web
// /app/frontend/src/lib/decoderExport.js so both surfaces produce an
// equivalent artefact from the same decode result shape ({ extracted, audit }).
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { shareTextFile, sharePostPdf } from "@/src/lib/download";
import { API } from "@/src/lib/api";

const STREAM_DISP: Record<string, string> = {
  Clinical: "Clinical",
  Independence: "Independence",
  EverydayLiving: "Everyday Living",
  ATHM: "AT-HM",
  CareMgmt: "Care Management",
};

function aud(n: any): string {
  const v = typeof n === "number" ? n : parseFloat(n);
  if (!Number.isFinite(v)) return "$0.00";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(v);
}

function fmtDate(v: any): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return String(v);
}

function esc(s: any): string {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function csvEscape(value: any): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type DecodeResult = any;

export function normaliseDecode(result: DecodeResult) {
  const ext = result?.extracted || {};
  const audit = result?.audit || {};
  const summary = audit.statement_summary || {};
  const lineItems = (ext.line_items || result?.line_items || []).map((li: any) => ({
    date: li.date || "",
    service_code: li.service_code || "",
    service_name: li.service_description || li.service_name || "",
    stream: STREAM_DISP[li.stream] || li.stream || "",
    hours: li.hours ?? li.units ?? "",
    unit_rate: li.unit_rate ?? li.unit_price ?? "",
    gross: li.gross ?? li.total ?? 0,
    participant_contribution: li.participant_contribution ?? li.contribution_paid ?? 0,
    government_paid: li.government_paid ?? 0,
    is_cancellation: !!li.is_cancellation,
    provider_notes: li.provider_notes || li.flags_in_original || "",
  }));
  const anomalies = (audit.anomalies || result?.anomalies || []).map((a: any) => ({
    severity: (a.severity || "").toLowerCase(),
    rule: a.rule || "",
    headline: a.headline || a.title || "",
    detail: a.detail || "",
    dollar_impact: a.dollar_impact || 0,
    evidence: Array.isArray(a.evidence) ? a.evidence : [],
    suggested_action: a.suggested_action || "",
  }));
  return {
    lineItems,
    anomalies,
    counts: audit.anomaly_count || { high: 0, medium: 0, low: 0, advisory: 0 },
    streams: audit.stream_breakdown || [],
    summaryText: typeof result?.summary === "string" ? result.summary : "",
    meta: {
      participant: summary.participant_name || ext.participant_name || "",
      provider: summary.provider || ext.provider_name || "",
      period: summary.period || ext.statement_period || result?.period_label || "",
      classification: summary.classification || "",
      cadence: summary.cadence || "",
      gross: summary.total_gross || 0,
      contribution: summary.total_participant_contribution || 0,
      government_paid: summary.total_government_paid || 0,
      budget_remaining: summary.adjusted_budget_remaining ?? summary.budget_remaining ?? null,
      care_management_fee: summary.care_management_fee || 0,
      rollover_applied: summary.rollover_applied || 0,
      lifetime_cap_remaining: summary.lifetime_cap_remaining ?? null,
      opening_balance: ext.opening_balance ?? ext.rollover_from_prior_quarter ?? ext.unused_funding_rolled_over ?? summary.rollover_applied ?? null,
      allocation: ext.quarterly_allocation_received ?? ext.quarterly_subsidy_this_period ?? ext.quarterly_budget_total ?? null,
      closing_balance: ext.closing_balance ?? ext.budget_remaining_at_quarter_end ?? ext.remaining_quarterly_budget ?? summary.adjusted_budget_remaining ?? summary.budget_remaining ?? null,
    },
    label: summary.period || ext.statement_period || summary.participant_name || "Statement",
  };
}

export async function exportDecodedCsv(result: DecodeResult): Promise<void> {
  // DOC-PARITY-1 v2: server-authoritative artefact — identical bytes + name to
  // web. Falls back to the local renderer below if the endpoint is unavailable.
  if (result?.extracted || result?.audit) {
    try {
      const res = await fetch(`${API}/decoder/artifact?fmt=csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(_artifactPayload(result)),
      });
      if (res.ok) {
        const csv = await res.text();
        await shareTextFile(_decodedFilename(result, "csv"), csv, "text/csv");
        return;
      }
    } catch { /* fall back to local */ }
  }
  await _exportDecodedCsvClient(result);
}

export async function exportDecodedPdf(result: DecodeResult): Promise<void> {
  if (result?.extracted || result?.audit) {
    try {
      await sharePostPdf("/decoder/artifact?fmt=pdf", _artifactPayload(result), _decodedFilename(result, "pdf"));
      return;
    } catch { /* fall back to local */ }
  }
  await _exportDecodedPdfClient(result);
}

function _artifactPayload(result: DecodeResult) {
  return {
    extracted: result?.extracted || null,
    audit: result?.audit || null,
    summary: typeof result?.summary === "string" ? result.summary : null,
    input_method: result?.input_method || null,
  };
}

function _slugName(s: any): string {
  const out = String(s || "").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  return out || "statement";
}
function _ddmmDash(v: any): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const m2 = /^(\d{2})[/-](\d{2})[/-](\d{4})/.exec(String(v || ""));
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return "";
}
function _decodedFilename(result: DecodeResult, ext: string): string {
  const e = result?.extracted || {};
  const s = (result?.audit || {}).statement_summary || {};
  const who = _slugName(s.participant_name || e.participant_name || s.provider || e.provider_name);
  const start = _ddmmDash(e.period_start);
  const end = _ddmmDash(e.period_end);
  const period = start && end ? `${start}-to-${end}` : (start || end || _slugName(s.period || e.statement_period));
  return `Wayly-Decoded-Statement_${who}_${period}.${ext}`;
}

async function _exportDecodedCsvClient(result: DecodeResult): Promise<void> {
  const { lineItems, anomalies, meta } = normaliseDecode(result);
  const rows: any[][] = [];
  rows.push(["Wayly, Decoded Statement"]);
  if (meta.participant) rows.push(["Participant", meta.participant]);
  if (meta.provider) rows.push(["Provider", meta.provider]);
  if (meta.period) rows.push(["Period", meta.period]);
  rows.push(["Gross total", meta.gross]);
  rows.push(["Participant contribution", meta.contribution]);
  rows.push(["Government paid", meta.government_paid]);
  if (meta.care_management_fee) rows.push(["Care management fee", meta.care_management_fee]);
  if (meta.opening_balance != null) rows.push(["Opening balance", meta.opening_balance]);
  if (meta.allocation != null) rows.push(["Quarterly allocation", meta.allocation]);
  if (meta.closing_balance != null) rows.push(["Closing balance", meta.closing_balance]);
  rows.push([]);
  rows.push(["Date", "Service code", "Service", "Stream", "Hours/Units", "Unit rate", "Gross", "Participant contribution", "Government paid", "Cancelled", "Provider notes"]);
  for (const li of lineItems) {
    rows.push([fmtDate(li.date), li.service_code, li.service_name, li.stream, li.hours, li.unit_rate, li.gross, li.participant_contribution, li.government_paid, li.is_cancellation ? "Y" : "", li.provider_notes]);
  }
  rows.push([]);
  rows.push(["Anomalies"]);
  rows.push(["Severity", "Rule", "Headline", "Detail", "Dollar impact", "Suggested action"]);
  for (const a of anomalies) rows.push([a.severity, a.rule, a.headline, a.detail, a.dollar_impact, a.suggested_action]);
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  await shareTextFile(`wayly-decoded-${stamp}.csv`, csv, "text/csv");
}

function decodedHtml(result: DecodeResult): string {
  const { lineItems, anomalies, meta, summaryText, label } = normaliseDecode(result);
  const nowAU = new Date().toLocaleDateString("en-AU");
  const rowsHtml = lineItems.map((li: any) => `<tr>
    <td>${esc(fmtDate(li.date))}</td>
    <td>${esc(li.service_name || li.service_code || "Service")}${li.is_cancellation ? ' <em style="color:#A5512B">(cancelled)</em>' : ""}</td>
    <td>${esc(li.stream)}</td>
    <td class="r">${esc(li.hours)}</td>
    <td class="r">${li.unit_rate ? aud(li.unit_rate) : ""}</td>
    <td class="r">${aud(li.gross)}</td>
    <td class="r">${aud(li.participant_contribution)}</td>
    <td class="r">${aud(li.government_paid)}</td>
  </tr>`).join("");
  const anomHtml = anomalies.length ? anomalies.map((a: any) => {
    const cls = ["high", "medium", "low"].includes(a.severity) ? a.severity : "low";
    return `<div class="anom ${cls}"><span class="chip">${esc(a.severity || "note")}</span> <strong>${esc(a.headline || "Item flagged")}</strong>
      ${a.detail ? `<p>${esc(a.detail)}</p>` : ""}
      ${a.suggested_action ? `<div class="act"><strong>Suggested action.</strong> ${esc(a.suggested_action)}</div>` : ""}
      ${a.dollar_impact ? `<div class="imp">Estimated dollar impact ${aud(a.dollar_impact)}</div>` : ""}</div>`;
  }).join("") : `<div class="clean">Wayly checked every line against the Support at Home rules and nothing looked out of order.</div>`;
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<style>
  body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#0E4D52;background:#FBF8F3;padding:20px;margin:0}
  .mark{width:30px;height:30px;border-radius:7px;background:#0E4D52;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:15px}
  .strip{display:flex;align-items:center;gap:10px;border-bottom:1px solid #D4CFC4;padding-bottom:12px;margin-bottom:16px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#6b6b6b;margin:0 0 14px}
  .card{background:#0E4D52;color:#fff;border-radius:12px;padding:16px;margin-bottom:14px}
  .grid{display:flex;flex-wrap:wrap;gap:14px}
  .tile{min-width:120px}
  .tile .l{font-size:9px;text-transform:uppercase;letter-spacing:0.1em;opacity:.85}
  .tile .v{font-size:17px;font-weight:600}
  .pe{background:#F4F1EA;border:1px solid #D4CFC4;border-radius:10px;padding:14px;margin-bottom:14px}
  h2{font-size:15px;margin:20px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid #E4DED2;border-radius:8px;overflow:hidden}
  th{background:#F4F1EA;text-align:left;padding:7px 8px;font-size:9px;text-transform:uppercase;letter-spacing:0.06em}
  td{padding:7px 8px;border-top:1px solid #E4DED2}
  .r{text-align:right}
  .anom{background:#fff;border:1px solid #D4CFC4;border-left-width:4px;border-radius:8px;padding:10px 14px;margin:8px 0}
  .anom.high{border-left-color:#A5512B}.anom.medium{border-left-color:#B27A25}.anom.low{border-left-color:#6B8F71}
  .chip{display:inline-block;padding:1px 7px;border-radius:99px;font-size:8px;text-transform:uppercase;letter-spacing:0.1em;color:#fff;background:#6B8F71}
  .anom.high .chip{background:#A5512B}.anom.medium .chip{background:#B27A25}
  .act{margin-top:6px;background:#F4F1EA;border-radius:6px;padding:6px 10px;font-size:10px}
  .imp{margin-top:5px;font-size:10px;color:#A5512B}
  .clean{background:#EEF3EE;border:1px solid #C6D4C6;border-radius:8px;padding:12px 14px}
  .foot{margin-top:24px;border-top:1px solid #D4CFC4;padding-top:12px;color:#6b6b6b;font-size:9px}
</style></head><body>
  <div class="strip"><span class="mark">W</span><strong style="font-size:18px">Wayly</strong><span style="margin-left:auto;font-size:9px;text-transform:uppercase;letter-spacing:0.16em;color:#6b6b6b">Support at Home · Decoded statement</span></div>
  <h1>Decoded statement</h1>
  <p class="sub">${esc(label)}${meta.participant ? ` · ${esc(meta.participant)}` : ""}${meta.provider ? ` · ${esc(meta.provider)}` : ""} · Decoded ${esc(nowAU)}</p>
  <div class="card"><div class="grid">
    <div class="tile"><div class="l">Gross billed</div><div class="v">${aud(meta.gross)}</div></div>
    <div class="tile"><div class="l">You paid</div><div class="v">${aud(meta.contribution)}</div></div>
    <div class="tile"><div class="l">Government paid</div><div class="v">${aud(meta.government_paid)}</div></div>
    <div class="tile"><div class="l">Budget remaining</div><div class="v">${meta.budget_remaining != null ? aud(meta.budget_remaining) : "—"}</div></div>
  </div></div>
  ${summaryText ? `<div class="pe"><strong>In plain English</strong><p>${esc(summaryText).replace(/\n{2,}/g, "</p><p>")}</p><div style="margin-top:8px;color:#6b6b6b;font-size:9px">AI-generated summary. Always verify important figures with your provider or My Aged Care before acting.</div></div>` : ""}
  <h2>Line items (${lineItems.length})</h2>
  <table><thead><tr><th>Date</th><th>Service</th><th>Stream</th><th class="r">Hours</th><th class="r">Rate</th><th class="r">Gross</th><th class="r">You paid</th><th class="r">Govt paid</th></tr></thead><tbody>${rowsHtml}</tbody></table>
  <h2>Wayly review${anomalies.length ? ` (${anomalies.length})` : ""}</h2>
  ${anomHtml}
  <div class="foot">Generated ${esc(nowAU)} · This is an AI summary; the original statement remains the source of truth. wayly.com.au</div>
</body></html>`;
}

async function _exportDecodedPdfClient(result: DecodeResult): Promise<void> {
  const html = decodedHtml(result);
  if (Platform.OS === "web") {
    const win = (globalThis as any).open?.("", "_blank");
    if (win) { win.document.write(html); win.document.close(); }
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf" });
}
