/**
 * Decoder export helpers, CSV + PDF download for both:
 *   - the public Statement Decoder result (shape: { extracted, audit })
 *   - the dashboard Statement object (shape: { line_items, anomalies... })
 *
 * The PDF is generated client-side via window.print() on a temporary
 * stylable HTML document opened in a new window, so we don't need a PDF
 * library bundled. Users get the browser's "Save as PDF" dialog.
 */

const fmtAUD = (n) => {
    const v = typeof n === "number" ? n : parseFloat(n);
    if (!Number.isFinite(v)) return "$0.00";
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(v);
};

/**
 * Render a date as DD/MM/YYYY (Australian). Accepts ISO YYYY-MM-DD,
 * a Date, a Date-parseable string, or day-first strings like
 * "09/07/2026", "9-7-2026", "9.7.2026". Returns "" for nullish/invalid.
 * Mirrors /app/frontend/src/lib/formatDate.js formatDate() but is
 * inlined here so the export util has no cross-lib import.
 */
const fmtDate = (v) => {
    if (v == null || v === "") return "";
    if (typeof v === "string") {
        // Already ISO YYYY-MM-DD → swap to DD/MM/YYYY, no TZ shift.
        let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
        if (m) return `${m[3]}/${m[2]}/${m[1]}`;
        // Day-first slash/hyphen/dot: DD/MM/YYYY or D/M/YY etc. → normalise.
        m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(v.trim());
        if (m) {
            let d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
            if (y < 100) y += y < 70 ? 2000 : 1900;
            // If the first token is > 12 it can only be a day → assume DD/MM.
            // If the second is > 12 it can only be a day → assume MM/DD, swap.
            if (mo > 12 && d <= 12) [d, mo] = [mo, d];
            if (d < 1 || d > 31 || mo < 1 || mo > 12) return v;
            const pad = (n) => String(n).padStart(2, "0");
            return `${pad(d)}/${pad(mo)}/${y}`;
        }
    }
    const d = v instanceof Date ? v : new Date(v);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return String(v || "");
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

function csvEscape(value) {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function downloadBlob(content, filename, mimetype) {
    const blob = new Blob([content], { type: mimetype });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/** Normalise a "decoder result" or "dashboard Statement" into a common shape. */
function normalise(result) {
    if (!result) return { lineItems: [], anomalies: [], summary: {}, label: "" };

    // Public decoder shape: { extracted, audit }
    if (result.extracted || result.audit) {
        const ext = result.extracted || {};
        const aud = result.audit || {};
        const _streamDisp = (s) => ({
            "EverydayLiving": "Everyday Living",
            "ATHM": "AT-HM",
            "CareMgmt": "Care Management",
        }[s] || s || "");
        const lineItems = (ext.line_items || []).map((li) => ({
            date: li.date || "",
            service_code: li.service_code || "",
            service_name: li.service_description || li.service_name || "",
            stream: _streamDisp(li.stream),
            hours: li.hours ?? li.units ?? "",
            unit_rate: li.unit_rate ?? li.unit_price ?? "",
            gross: li.gross ?? li.total ?? 0,
            participant_contribution: li.participant_contribution ?? li.contribution_paid ?? 0,
            government_paid: li.government_paid ?? 0,
            is_cancellation: !!li.is_cancellation,
            worker_name: li.worker_name || "",
            provider_notes: li.provider_notes || "",
        }));
        const anomalies = (aud.anomalies || []).map((a) => ({
            severity: a.severity || "",
            rule: a.rule || "",
            title: a.headline || a.title || "",
            detail: a.detail || "",
            dollar_impact: a.dollar_impact || 0,
            suggested_action: a.suggested_action || "",
        }));
        const summary = aud.statement_summary || {};
        return {
            lineItems,
            anomalies,
            summary: {
                participant: ext.participant_name || "",
                provider: ext.provider_name || "",
                period: ext.statement_period || "",
                gross: summary.total_gross || 0,
                contribution: summary.total_participant_contribution || 0,
                government_paid: summary.total_government_paid || 0,
                cadence: summary.cadence || "",
                care_management_fee: summary.care_management_fee || ext.care_management_deducted || 0,
                opening_balance:
                    ext.opening_balance ??
                    ext.rollover_from_prior_quarter ??
                    ext.unused_funding_rolled_over ??
                    null,
                allocation:
                    ext.quarterly_allocation_received ??
                    ext.quarterly_subsidy_this_period ??
                    ext.quarterly_budget_total ??
                    null,
                closing_balance:
                    ext.closing_balance ??
                    ext.budget_remaining_at_quarter_end ??
                    ext.remaining_quarterly_budget ??
                    summary.adjusted_budget_remaining ??
                    summary.budget_remaining ??
                    null,
            },
            label: ext.statement_period || ext.participant_name || "Statement",
        };
    }

    // Dashboard Statement shape: line_items[] + anomalies[]
    const lineItems = (result.line_items || []).map((li) => ({
        date: li.date || "",
        service_code: li.service_code || "",
        service_name: li.service_name || "",
        stream: li.stream || "",
        hours: li.units ?? "",
        unit_rate: li.unit_price ?? "",
        gross: li.total ?? 0,
        participant_contribution: li.contribution_paid ?? 0,
        government_paid: li.government_paid ?? 0,
        is_cancellation: false,
        worker_name: "",
        provider_notes: "",
    }));
    const anomalies = (result.anomalies || []).map((a) => ({
        severity: a.severity || "",
        rule: "",
        title: a.title || "",
        detail: a.detail || "",
        dollar_impact: 0,
        suggested_action: a.suggested_action || "",
    }));
    const totalGross = lineItems.reduce((acc, li) => acc + (li.gross || 0), 0);
    const totalContrib = lineItems.reduce((acc, li) => acc + (li.participant_contribution || 0), 0);
    const totalGov = lineItems.reduce((acc, li) => acc + (li.government_paid || 0), 0);
    return {
        lineItems,
        anomalies,
        summary: {
            participant: "",
            provider: "",
            period: result.period_label || "",
            gross: totalGross,
            contribution: totalContrib,
            government_paid: totalGov,
        },
        label: result.period_label || result.filename || "statement",
    };
}

// DOC-PARITY-1 v2 Workstream A: server-authoritative decoded artefact. Both
// web and mobile POST the decode payload to /api/decoder/artifact and download
// identical bytes + filename. Falls back to the client renderers below on error
// or when the payload lacks the rich {extracted, audit} shape.
async function serverArtifact(result, fmt) {
    const backend = process.env.REACT_APP_BACKEND_URL;
    const payload = {
        extracted: result?.extracted || null,
        audit: result?.audit || null,
        summary: (result && typeof result.summary === "string") ? result.summary : null,
        input_method: result?.input_method || null,
    };
    const res = await fetch(`${backend}/api/decoder/artifact?fmt=${fmt}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`artifact ${res.status}`);
    const cd = res.headers.get("Content-Disposition") || "";
    const m = /filename="?([^"]+)"?/.exec(cd);
    const filename = m ? m[1] : `Wayly-Decoded-Statement.${fmt}`;
    const blob = await res.blob();
    downloadBlob(blob, filename, blob.type || (fmt === "csv" ? "text/csv" : "application/pdf"));
}

export async function downloadDecodedAsCsv(result, baseName = "statement") {
    if (result?.extracted || result?.audit) {
        try { await serverArtifact(result, "csv"); return; } catch { /* fall back */ }
    }
    _downloadDecodedAsCsvClient(result, baseName);
}

export async function downloadDecodedAsPdf(result, baseName = "statement") {
    if (result?.extracted || result?.audit) {
        try { await serverArtifact(result, "pdf"); return; } catch { /* fall back */ }
    }
    _downloadDecodedAsPdfClient(result, baseName);
}

function _downloadDecodedAsCsvClient(result, baseName = "statement") {
    const { lineItems, anomalies, summary } = normalise(result);
    const rows = [];
    // Header summary block
    rows.push(["Wayly, Decoded Statement"]);
    if (summary.participant) rows.push(["Participant", summary.participant]);
    if (summary.provider) rows.push(["Provider", summary.provider]);
    if (summary.period) rows.push(["Period", summary.period]);
    if (summary.cadence && summary.cadence !== "irregular") rows.push(["Cadence", summary.cadence]);
    rows.push(["Gross total", summary.gross]);
    rows.push(["Participant contribution", summary.contribution]);
    rows.push(["Government paid", summary.government_paid]);
    if (summary.care_management_fee) rows.push(["Care management fee", summary.care_management_fee]);
    if (summary.opening_balance != null) rows.push(["Opening balance", summary.opening_balance]);
    if (summary.allocation != null) rows.push(["Quarterly allocation", summary.allocation]);
    if (summary.closing_balance != null) rows.push(["Closing balance", summary.closing_balance]);
    rows.push([]);
    // Line items
    rows.push([
        "Date", "Service code", "Service", "Stream", "Hours/Units", "Unit rate",
        "Gross", "Participant contribution", "Government paid",
        "Cancelled", "Worker", "Provider notes",
    ]);
    for (const li of lineItems) {
        rows.push([
            fmtDate(li.date), li.service_code, li.service_name, li.stream,
            li.hours, li.unit_rate, li.gross, li.participant_contribution, li.government_paid,
            li.is_cancellation ? "Y" : "", li.worker_name, li.provider_notes,
        ]);
    }
    rows.push([]);
    // Anomalies
    rows.push(["Anomalies"]);
    rows.push(["Severity", "Rule", "Headline", "Detail", "Dollar impact", "Suggested action"]);
    for (const a of anomalies) {
        rows.push([a.severity, a.rule, a.title, a.detail, a.dollar_impact, a.suggested_action]);
    }
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(csv, `${baseName}-decoded-${stamp}.csv`, "text/csv;charset=utf-8");
}

function _downloadDecodedAsPdfClient(result, baseName = "statement") {
    const { lineItems, anomalies, summary, label } = normalise(result);
    const plainEnglish = (result && typeof result.summary === "string") ? result.summary.trim() : "";

    // Open a printable window styled with Wayly's brand system: Fraunces
    // (heading), Inter (body), IBM Plex Mono (numbers), Teal-Ink #0E4D52 on
    // warm off-white #FBF8F3, Clay #A5512B accent, Sage #6B8F71 confirm.
    // Users pick "Save as PDF" from the browser dialog → the file matches the
    // in-app decoder screen exactly.
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) return;
    const nowAU = new Date().toLocaleDateString("en-AU");

    const html = `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"/><title>${esc(label)} · Wayly decoded statement</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#FBF8F3;color:#0E4D52}
  body{
    font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    font-size:11pt; line-height:1.55;
    padding:28px 36px 40px;
    max-width:900px; margin:0 auto;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .wm-heading{font-family:'Fraunces',Georgia,serif;letter-spacing:-0.01em;font-weight:600;color:#0E4D52;margin:0}
  .num{font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;letter-spacing:-0.01em}
  .overline{font-size:9pt;text-transform:uppercase;letter-spacing:0.14em;color:#6b6b6b;font-weight:500}
  .muted{color:#6b6b6b}
  .brand-strip{
    display:flex; align-items:center; justify-content:space-between; gap:16px;
    padding-bottom:14px; border-bottom:1px solid #D4CFC4; margin-bottom:22px;
  }
  .brand-logo{
    display:flex; align-items:center; gap:10px;
    font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:20pt; color:#0E4D52; letter-spacing:-0.02em;
  }
  .brand-logo-mark{
    width:36px;height:36px;border-radius:9px;background:#0E4D52;
    color:#fff; display:flex; align-items:center; justify-content:center;
    font-family:'Fraunces',Georgia,serif; font-size:16pt; font-weight:600;
  }
  .brand-tag{font-family:'Inter',sans-serif; font-size:9pt; text-transform:uppercase; letter-spacing:0.16em; color:#6b6b6b}
  h1.doc-title{font-size:24pt; margin:0 0 4px}
  .doc-sub{color:#6b6b6b; font-size:10.5pt; margin:0}
  h2{font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:14.5pt; margin:26px 0 10px; color:#0E4D52; letter-spacing:-0.005em}
  .meta{display:grid; grid-template-columns:auto 1fr; gap:6px 14px; margin:16px 0 4px; font-size:10.5pt}
  .meta dt{color:#6b6b6b; text-transform:uppercase; letter-spacing:0.10em; font-size:9pt; padding-top:3px}
  .meta dd{margin:0; color:#0E4D52}
  .summary-card{
    background:#0E4D52; color:#FFFFFF; border-radius:14px; padding:18px 22px; margin:14px 0 8px;
  }
  .summary-card .card-hd{color:#FFFFFF; font-size:9.5pt; text-transform:uppercase; letter-spacing:0.14em; margin-bottom:12px}
  .summary-grid{display:grid; grid-template-columns:repeat(4,1fr); gap:14px}
  .summary-grid .tile .lbl{display:block; color:#F4F1EA; opacity:.85; font-size:9pt; text-transform:uppercase; letter-spacing:0.10em; margin-bottom:4px}
  .summary-grid .tile .val{display:block; color:#FFFFFF; font-family:'IBM Plex Mono',monospace; font-variant-numeric:tabular-nums; font-size:16pt; font-weight:500}
  .plain-english{
    background:#F4F1EA; border:1px solid #D4CFC4; border-radius:12px;
    padding:16px 20px; margin:18px 0 4px;
  }
  .plain-english .hd{display:flex; align-items:center; gap:8px; color:#0E4D52; font-weight:500; margin-bottom:8px}
  .plain-english .dot{width:22px; height:22px; border-radius:999px; background:#0E4D52; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:11pt; font-weight:600; font-family:'Fraunces',serif}
  .plain-english p{margin:0 0 10px; color:#0E4D52; font-size:11pt; line-height:1.6}
  .plain-english p:last-child{margin-bottom:0}
  .plain-english .caveat{margin-top:10px; padding-top:10px; border-top:1px solid #E4DED2; color:#6b6b6b; font-size:9pt}

  table{width:100%; border-collapse:collapse; margin-top:8px; font-size:10pt; background:#FFFFFF; border:1px solid #E4DED2; border-radius:10px; overflow:hidden}
  th{background:#F4F1EA; color:#0E4D52; text-align:left; padding:8px 10px; font-weight:500; font-size:9.5pt; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid #D4CFC4}
  td{padding:8px 10px; border-bottom:1px solid #E4DED2; vertical-align:top; color:#0E4D52}
  tbody tr:last-child td{border-bottom:0}
  td.right, th.right{text-align:right}

  .anomaly{
    border:1px solid #D4CFC4; border-left-width:4px; border-radius:10px;
    padding:12px 16px; margin:10px 0; background:#FFFFFF;
  }
  .anomaly.high{border-left-color:#A5512B}
  .anomaly.medium{border-left-color:#D99E42}
  .anomaly.low{border-left-color:#6B8F71}
  .anomaly .chip{display:inline-block; padding:2px 8px; border-radius:999px; font-size:8.5pt; text-transform:uppercase; letter-spacing:0.12em; font-weight:500; color:#FFFFFF}
  .anomaly.high .chip{background:#A5512B}
  .anomaly.medium .chip{background:#B27A25}
  .anomaly.low .chip{background:#6B8F71}
  .anomaly .title{font-weight:600; color:#0E4D52; margin-left:8px}
  .anomaly .detail{margin:8px 0 0; color:#0E4D52; font-size:10pt; line-height:1.55}
  .anomaly .action{margin:8px 0 0; padding:8px 12px; background:#F4F1EA; border-radius:8px; color:#0E4D52; font-size:9.5pt}
  .anomaly .impact{margin:6px 0 0; font-family:'IBM Plex Mono',monospace; font-size:9.5pt; color:#A5512B}

  .no-anomalies{
    display:flex; align-items:center; gap:10px;
    background:#EEF3EE; border:1px solid #C6D4C6; border-radius:10px;
    padding:12px 16px; color:#0E4D52; font-size:10.5pt;
  }
  .no-anomalies .dot{width:22px;height:22px;border-radius:999px;background:#6B8F71;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:600}

  .footer{
    margin-top:32px; padding-top:14px; border-top:1px solid #D4CFC4;
    display:flex; justify-content:space-between; gap:12px; align-items:center;
    color:#6b6b6b; font-size:9pt;
  }
  .footer .lockup{display:flex; align-items:center; gap:8px; color:#0E4D52; font-family:'Fraunces',Georgia,serif; font-weight:600}
  .print-btn{
    position:fixed; top:16px; right:16px; z-index:10;
    background:#A5512B; color:#fff; border:0;
    padding:10px 16px; border-radius:999px; cursor:pointer;
    font-family:'Inter',sans-serif; font-weight:500; font-size:10pt;
    box-shadow:0 4px 12px rgba(14,77,82,0.15);
  }
  .print-btn:hover{background:#7A3A1F}

  @media print{
    body{padding:24px 28px}
    .print-btn{display:none}
    .anomaly.plain-english.summary-card, table{page-break-inside:avoid}
    h2{page-break-after:avoid}
  }
</style></head>
<body>
  <button class="print-btn" onclick="window.print()">Save as PDF</button>

  <div class="brand-strip">
    <div class="brand-logo"><span class="brand-logo-mark">W</span>Wayly</div>
    <div class="brand-tag">Support at Home · Decoded statement</div>
  </div>

  <h1 class="wm-heading doc-title">Decoded statement</h1>
  <p class="doc-sub">${esc(label || "Statement")}</p>

  <dl class="meta">
    ${summary.participant ? `<dt>Participant</dt><dd>${esc(summary.participant)}</dd>` : ""}
    ${summary.provider ? `<dt>Provider</dt><dd>${esc(summary.provider)}</dd>` : ""}
    ${summary.period ? `<dt>Period</dt><dd>${esc(summary.period)}</dd>` : ""}
    ${summary.cadence && summary.cadence !== "irregular" ? `<dt>Cadence</dt><dd>${esc(summary.cadence[0].toUpperCase() + summary.cadence.slice(1))}</dd>` : ""}
    <dt>Decoded on</dt><dd>${esc(nowAU)}</dd>
  </dl>

  <div class="summary-card">
    <div class="card-hd">Money summary</div>
    <div class="summary-grid">
      <div class="tile"><span class="lbl">Gross billed</span><span class="val">${fmtAUD(summary.gross)}</span></div>
      <div class="tile"><span class="lbl">You paid</span><span class="val">${fmtAUD(summary.contribution)}</span></div>
      <div class="tile"><span class="lbl">Government paid</span><span class="val">${fmtAUD(summary.government_paid)}</span></div>
      <div class="tile"><span class="lbl">Line items</span><span class="val">${lineItems.length}</span></div>
    </div>
    ${(summary.opening_balance != null || summary.allocation != null || summary.closing_balance != null) ? `
    <div class="card-hd" style="margin-top:14px;">Budget continuity</div>
    <div class="summary-grid" data-testid="pdf-balance-panel">
      <div class="tile"><span class="lbl">Opening balance</span><span class="val">${summary.opening_balance != null ? fmtAUD(summary.opening_balance) : ","}</span></div>
      <div class="tile"><span class="lbl">Quarterly allocation</span><span class="val">${summary.allocation != null ? fmtAUD(summary.allocation) : ","}</span></div>
      <div class="tile"><span class="lbl">Closing balance</span><span class="val">${summary.closing_balance != null ? fmtAUD(summary.closing_balance) : ","}</span></div>
      <div class="tile"><span class="lbl">Care management fee</span><span class="val">${summary.care_management_fee ? fmtAUD(summary.care_management_fee) : ","}</span></div>
    </div>` : ""}
  </div>

  ${plainEnglish ? `
  <div class="plain-english">
    <div class="hd"><span class="dot">i</span><span class="overline">In plain English</span></div>
    ${plainEnglish.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join("")}
    <div class="caveat">AI-generated summary. Always verify important figures with your provider or My Aged Care before acting.</div>
  </div>` : ""}

  <h2>Line items (${lineItems.length})</h2>
  <table>
    <thead><tr>
      <th>Date</th><th>Service</th><th>Stream</th>
      <th class="right">Hours</th><th class="right">Rate</th>
      <th class="right">Gross</th><th class="right">You paid</th><th class="right">Govt paid</th>
    </tr></thead>
    <tbody>
      ${lineItems.map((li) => `<tr>
        <td class="num">${esc(fmtDate(li.date))}</td>
        <td>${esc(li.service_name || li.service_code || "Service")}${li.is_cancellation ? ' <em style="color:#A5512B">(cancelled)</em>' : ""}</td>
        <td>${esc(li.stream)}</td>
        <td class="right num">${esc(li.hours)}</td>
        <td class="right num">${li.unit_rate ? fmtAUD(li.unit_rate) : ""}</td>
        <td class="right num">${fmtAUD(li.gross)}</td>
        <td class="right num">${fmtAUD(li.participant_contribution)}</td>
        <td class="right num">${fmtAUD(li.government_paid)}</td>
      </tr>`).join("")}
    </tbody>
  </table>

  <h2>Wayly review${anomalies.length ? ` (${anomalies.length})` : ""}</h2>
  ${anomalies.length ? anomalies.map((a) => {
      const sev = (a.severity || "").toLowerCase();
      const cls = ["high", "medium", "low"].includes(sev) ? sev : "low";
      return `<div class="anomaly ${cls}">
    <span class="chip">${esc(sev || "note")}</span><span class="title">${esc(a.title || "Item flagged")}</span>
    ${a.detail ? `<p class="detail">${esc(a.detail)}</p>` : ""}
    ${a.suggested_action ? `<div class="action"><strong>Suggested action.</strong> ${esc(a.suggested_action)}</div>` : ""}
    ${a.dollar_impact ? `<div class="impact">Estimated dollar impact ${fmtAUD(a.dollar_impact)}</div>` : ""}
  </div>`; }).join("")
      : `<div class="no-anomalies"><span class="dot">✓</span>Wayly checked every line against the Support at Home rules and nothing looked out of order on this statement.</div>`
    }

  <div class="footer">
    <div class="lockup"><span class="brand-logo-mark" style="width:24px;height:24px;font-size:11pt;border-radius:6px">W</span>Wayly</div>
    <div style="text-align:right">Generated ${esc(nowAU)} · This is an AI summary; the original statement remains the source of truth. wayly.com.au</div>
  </div>

  <script>
    setTimeout(function(){ try { window.print(); } catch(e){} }, 400);
  </script>
</body></html>`;
    win.document.write(html);
    win.document.close();
}

/**
 * STMT-UI-1 v2 improvement, Shareable, single-page "Here's what your provider
 * is charging you" summary. Designed for forwarding to family, advisers, or
 * anyone questioning a bill. Includes a subtle "Decoded by Wayly" CTA at the
 * foot so recipients discover the free tool.
 *
 * `result` shape matches the DecoderResultView contract: { extracted, audit, summary }.
 */
export function downloadShareablePdf(result, options = {}) {
    const audit = (result && result.audit) || {};
    const extracted = (result && result.extracted) || {};
    const summary = audit.statement_summary || {};
    const anomalies = audit.anomalies || [];
    const counts = audit.anomaly_count || { high: 0, medium: 0, low: 0 };
    const totals = summary.totals || extracted.totals || {};
    const provider = extracted.provider_name || summary.provider_name || options.provider || "your provider";
    const period = summary.period_label || extracted.period_label || options.period || "this period";

    const gross = Number(totals.gross_total ?? totals.total ?? totals.grand_total ?? 0) || 0;
    const services = Number(totals.services_subtotal ?? totals.services_total ?? 0) || 0;
    const careMgmt = Number(totals.care_management_fee ?? totals.care_management ?? 0) || 0;
    const closing = Number((audit.balance || {}).closing_balance ?? totals.closing_balance ?? 0) || 0;
    const potentialImpact = anomalies.reduce((a, x) => a + (Number(x.dollar_impact || 0) || 0), 0);

    const highlights = anomalies
        .filter((a) => a && (a.severity === "high" || a.severity === "medium"))
        .slice(0, 3)
        .map((a) => ({
            title: a.title || a.rule || "Something to check",
            detail: (a.detail || "").slice(0, 220),
            impact: Number(a.dollar_impact || 0) || 0,
        }));

    const totalFlags = counts.high + counts.medium + counts.low;
    const headline = counts.high > 0
        ? `${counts.high} thing${counts.high === 1 ? "" : "s"} worth questioning`
        : counts.medium > 0
        ? `${counts.medium} thing${counts.medium === 1 ? "" : "s"} worth a closer look`
        : totalFlags > 0
        ? `${totalFlags} small note${totalFlags === 1 ? "" : "s"}, no red flags`
        : `Statement looks clean`;

    const win = window.open("", "_blank", "width=760,height=1020");
    if (!win) return;
    const nowAU = new Date().toLocaleDateString("en-AU");

    const html = `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"/><title>Decoded by Wayly · ${esc(provider)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#FBF8F3;color:#0E4D52}
  body{
    font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;
    font-size:11pt; line-height:1.55;
    padding:34px 42px 32px; max-width:760px; margin:0 auto;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .brand{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:1px solid #D4CFC4;margin-bottom:24px}
  .brand-lockup{display:flex;align-items:center;gap:10px;font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:20pt;color:#0E4D52;letter-spacing:-0.02em}
  .brand-mark{width:36px;height:36px;border-radius:9px;background:#0E4D52;color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Fraunces',Georgia,serif;font-size:16pt;font-weight:600}
  .brand-tag{font-family:'Inter',sans-serif;font-size:9pt;text-transform:uppercase;letter-spacing:0.18em;color:#6b6b6b}

  h1.hd{font-family:'Fraunces',Georgia,serif;font-size:28pt;font-weight:600;color:#0E4D52;margin:0 0 6px;letter-spacing:-0.015em;line-height:1.1}
  h1.hd em{font-style:normal;color:#A5512B}
  .sub{color:#6b6b6b;font-size:11pt;margin:0 0 20px}

  .stat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:14px 0 22px}
  .stat{background:#FFFFFF;border:1px solid #D4CFC4;border-radius:12px;padding:14px 16px}
  .stat.hero{background:#0E4D52;border-color:#0E4D52;color:#FFFFFF}
  .stat.hero .val.stat.hero .lbl{color:#FFFFFF}
  .stat .lbl{display:block;font-size:8.5pt;text-transform:uppercase;letter-spacing:0.14em;color:#6b6b6b;margin-bottom:6px}
  .stat .val{display:block;font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;font-size:22pt;color:#0E4D52;font-weight:500;letter-spacing:-0.01em}
  .stat .cap{display:block;color:#6b6b6b;font-size:9.5pt;margin-top:6px}
  .stat.hero .cap{color:rgba(255,255,255.7)}

  .verdict{display:flex;align-items:center;gap:14px;background:${counts.high > 0 ? "#F8E8E1" : counts.medium > 0 ? "#F4EAD0" : "#EEF3EE"};border:1px solid ${counts.high > 0 ? "#E4B79E" : counts.medium > 0 ? "#D9BE7E" : "#C6D4C6"};border-radius:14px;padding:14px 18px;margin:8px 0 22px}
  .verdict .dot{width:34px;height:34px;border-radius:999px;background:${counts.high > 0 ? "#A5512B" : counts.medium > 0 ? "#B27A25" : "#6B8F71"};color:#fff;display:inline-flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;font-size:16pt;font-weight:700;flex:0 0 auto}
  .verdict .txt{font-size:12pt;color:#0E4D52;font-weight:500}
  .verdict .txt em{font-style:normal;color:#A5512B;font-weight:600}

  h2{font-family:'Fraunces',Georgia,serif;font-size:14pt;font-weight:600;color:#0E4D52;margin:22px 0 10px}
  .flag{background:#FFFFFF;border:1px solid #D4CFC4;border-left:4px solid #A5512B;border-radius:10px;padding:12px 16px;margin-bottom:10px}
  .flag.medium{border-left-color:#B27A25}
  .flag .row{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
  .flag .ttl{font-weight:600;color:#0E4D52;font-size:11pt}
  .flag .imp{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:10.5pt;color:#A5512B}
  .flag .det{color:#0E4D52;font-size:10pt;line-height:1.5;margin:6px 0 0}

  .cta{margin-top:26px;padding:16px 20px;border-radius:14px;background:#0E4D52;color:#FFFFFF;display:flex;align-items:center;justify-content:space-between;gap:14px}
  .cta .msg{font-size:11pt;line-height:1.5}
  .cta .msg strong{font-family:'Fraunces',serif;font-size:12.5pt;font-weight:600}
  .cta .url{font-family:'IBM Plex Mono',monospace;font-size:11pt;font-weight:600;background:rgba(255,255,255.14);padding:8px 14px;border-radius:8px;color:#FFFFFF;text-decoration:none;white-space:nowrap}

  .foot{margin-top:14px;text-align:center;font-size:8.5pt;color:#6b6b6b;line-height:1.5}
  .foot a{color:#0E4D52;text-decoration:none}

  @page{margin:12mm}
  @media print{body{padding:0}}
</style></head>
<body>
  <div class="brand">
    <div class="brand-lockup"><span class="brand-mark">W</span>Wayly</div>
    <div class="brand-tag">Decoded aged-care statement</div>
  </div>

  <h1 class="hd">Here's what <em>${esc(provider)}</em> is charging.</h1>
  <p class="sub">${esc(period)} · decoded ${esc(nowAU)}</p>

  <div class="stat-grid">
    <div class="stat hero">
      <span class="lbl">Gross total this period</span>
      <span class="val">${esc(fmtAUD(gross))}</span>
      <span class="cap">what the provider is invoicing</span>
    </div>
    <div class="stat">
      <span class="lbl">Services subtotal</span>
      <span class="val">${esc(fmtAUD(services))}</span>
      <span class="cap">before care-management fee</span>
    </div>
    <div class="stat">
      <span class="lbl">Care management fee</span>
      <span class="val">${esc(fmtAUD(careMgmt))}</span>
      <span class="cap">${services > 0 ? `${((careMgmt / services) * 100).toFixed(1)}% of services` : "provider overhead"}</span>
    </div>
  </div>

  <div class="verdict">
    <span class="dot">${counts.high > 0 ? "!" : counts.medium > 0 ? "?" : "✓"}</span>
    <div class="txt">
      ${counts.high > 0 || counts.medium > 0
        ? `<em>${esc(headline)}.</em> Potential dollar impact: <strong>${esc(fmtAUD(potentialImpact))}</strong>.`
        : `${esc(headline)}, nothing unusual found in this statement.`}
    </div>
  </div>

  ${highlights.length > 0 ? `
  <h2>Things worth checking</h2>
  ${highlights.map((h) => `
    <div class="flag ${h.impact > 0 ? "" : "medium"}">
      <div class="row">
        <div class="ttl">${esc(h.title)}</div>
        ${h.impact > 0 ? `<div class="imp">${esc(fmtAUD(h.impact))} impact</div>` : ""}
      </div>
      ${h.detail ? `<div class="det">${esc(h.detail)}</div>` : ""}
    </div>
  `).join("")}
  ` : ""}

  ${closing > 0 ? `
  <h2>Money still with the provider</h2>
  <div class="flag" style="border-left-color:#0E4D52">
    <div class="row">
      <div class="ttl">Closing balance</div>
      <div class="imp" style="color:#0E4D52">${esc(fmtAUD(closing))}</div>
    </div>
    <div class="det">This sits with your provider and rolls into next period.</div>
  </div>
  ` : ""}

  <div class="cta">
    <div class="msg"><strong>Decode any statement free.</strong><br/>Upload a PDF, get plain-English answers in 60 seconds.</div>
    <span class="url">wayly.com.au</span>
  </div>

  <p class="foot">
    Generated by Wayly · This is an AI-assisted summary; the original statement remains the source of truth.<br/>
    Not financial or legal advice. <a href="https://wayly.com.au">wayly.com.au</a>
  </p>

  <script>
    setTimeout(function(){ try { window.print(); } catch(e){} }, 500);
  </script>
</body></html>`;
    win.document.write(html);
    win.document.close();
}


function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
