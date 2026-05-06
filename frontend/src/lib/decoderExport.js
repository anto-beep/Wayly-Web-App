/**
 * Decoder export helpers — CSV + PDF download for both:
 *   - the public Statement Decoder result (shape: { extracted, audit })
 *   - the dashboard Statement object (shape: { line_items, anomalies, ... })
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
        const lineItems = (ext.line_items || []).map((li) => ({
            date: li.date || "",
            service_code: li.service_code || "",
            service_name: li.service_description || li.service_name || "",
            stream: li.stream || "",
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

export function downloadDecodedAsCsv(result, baseName = "statement") {
    const { lineItems, anomalies, summary } = normalise(result);
    const rows = [];
    // Header summary block
    rows.push(["Kindred — Decoded Statement"]);
    if (summary.participant) rows.push(["Participant", summary.participant]);
    if (summary.provider) rows.push(["Provider", summary.provider]);
    if (summary.period) rows.push(["Period", summary.period]);
    rows.push(["Gross total", summary.gross]);
    rows.push(["Participant contribution", summary.contribution]);
    rows.push(["Government paid", summary.government_paid]);
    rows.push([]);
    // Line items
    rows.push([
        "Date", "Service code", "Service", "Stream", "Hours/Units", "Unit rate",
        "Gross", "Participant contribution", "Government paid",
        "Cancelled", "Worker", "Provider notes",
    ]);
    for (const li of lineItems) {
        rows.push([
            li.date, li.service_code, li.service_name, li.stream,
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

export function downloadDecodedAsPdf(result, baseName = "statement") {
    const { lineItems, anomalies, summary, label } = normalise(result);
    // Build a printable HTML document. Open in new window and trigger print →
    // user picks "Save as PDF" in the browser dialog.
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) return;
    const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>${label} — decoded</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1f3a5f;padding:32px;max-width:900px;margin:auto;font-size:12pt}
  h1{font-size:22pt;margin:0 0 6px;color:#1f3a5f}
  h2{font-size:14pt;margin:24px 0 8px;color:#1f3a5f;border-bottom:1px solid #d9c98c;padding-bottom:4px}
  .muted{color:#6b7280;font-size:10pt}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:10pt}
  th{text-align:left;background:#faf7f2;padding:6px 8px;border-bottom:1px solid #e5d9c0}
  td{padding:6px 8px;border-bottom:1px solid #f0e6d3;vertical-align:top}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
  .summary div{background:#faf7f2;padding:10px;border-radius:8px}
  .summary .label{display:block;color:#6b7280;font-size:9pt;text-transform:uppercase;letter-spacing:0.04em}
  .summary .val{font-size:13pt;font-weight:600;color:#1f3a5f}
  .anomaly{border-left:3px solid #d4a24e;padding:8px 12px;margin:8px 0;background:#fffaf0}
  .anomaly.alert{border-color:#a05545;background:#fdf3ef}
  .anomaly .sev{font-size:9pt;text-transform:uppercase;letter-spacing:0.04em;color:#6b7280;margin-right:8px}
  .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e5d9c0;color:#6b7280;font-size:9pt}
  @media print{button{display:none}}
</style></head>
<body>
  <button onclick="window.print()" style="float:right;background:#1f3a5f;color:#fff;border:0;padding:8px 14px;border-radius:6px;cursor:pointer">Print / Save as PDF</button>
  <h1>Decoded statement — ${esc(label)}</h1>
  <p class="muted">Decoded by Kindred. AI-generated summary — please verify against the original statement before acting.</p>

  <h2>Summary</h2>
  ${summary.participant ? `<p><strong>Participant:</strong> ${esc(summary.participant)}</p>` : ""}
  ${summary.provider ? `<p><strong>Provider:</strong> ${esc(summary.provider)}</p>` : ""}
  ${summary.period ? `<p><strong>Period:</strong> ${esc(summary.period)}</p>` : ""}
  <div class="summary">
    <div><span class="label">Gross total</span><span class="val">${fmtAUD(summary.gross)}</span></div>
    <div><span class="label">Participant contribution</span><span class="val">${fmtAUD(summary.contribution)}</span></div>
    <div><span class="label">Government paid</span><span class="val">${fmtAUD(summary.government_paid)}</span></div>
  </div>

  <h2>Line items (${lineItems.length})</h2>
  <table>
    <thead><tr>
      <th>Date</th><th>Service</th><th>Stream</th>
      <th class="num">Hrs</th><th class="num">Rate</th>
      <th class="num">Gross</th><th class="num">Contrib.</th><th class="num">Gov paid</th>
    </tr></thead>
    <tbody>
      ${lineItems.map((li) => `<tr>
        <td>${esc(li.date)}</td>
        <td>${esc(li.service_name || li.service_code)}${li.is_cancellation ? ' <em style="color:#a05545">(cancelled)</em>' : ""}</td>
        <td>${esc(li.stream)}</td>
        <td class="num">${esc(li.hours)}</td>
        <td class="num">${li.unit_rate ? fmtAUD(li.unit_rate) : ""}</td>
        <td class="num">${fmtAUD(li.gross)}</td>
        <td class="num">${fmtAUD(li.participant_contribution)}</td>
        <td class="num">${fmtAUD(li.government_paid)}</td>
      </tr>`).join("")}
    </tbody>
  </table>

  ${anomalies.length ? `<h2>Anomalies (${anomalies.length})</h2>
  ${anomalies.map((a) => `<div class="anomaly ${a.severity === "alert" || a.severity === "high" ? "alert" : ""}">
    <span class="sev">${esc(a.severity)}</span><strong>${esc(a.title)}</strong>
    <p style="margin:6px 0 0">${esc(a.detail)}</p>
    ${a.suggested_action ? `<p style="margin:6px 0 0;font-style:italic">→ ${esc(a.suggested_action)}</p>` : ""}
    ${a.dollar_impact ? `<p class="muted" style="margin:4px 0 0">Estimated dollar impact: ${fmtAUD(a.dollar_impact)}</p>` : ""}
  </div>`).join("")}` : ""}

  <div class="footer">
    Generated by Kindred · ${new Date().toLocaleDateString("en-AU")} · This is an AI summary; the original statement remains the source of truth.
  </div>
  <script>
    // Auto-trigger print dialog after a short delay so the document fully renders.
    setTimeout(function(){ try { window.print(); } catch(e){} }, 300);
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
