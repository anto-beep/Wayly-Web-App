// STMT-UI-1 v2 · Decision 10, CSV export of the CURRENT filtered/sorted view.
// No true data-portability export (see privacy suite).
import {
    periodCompact,
    providerName,
    grossTotal,
    closingBalance,
    decodeStatus,
    flagsCount,
    uploadedLabel,
    isoDay,
} from "@/lib/statementFields";

function csvEscape(val) {
    if (val === null || val === undefined) return "";
    const str = String(val);
    // RFC 4180: quote if contains comma, quote, newline
    if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function formatMoney(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "";
    return Number(v).toFixed(2);
}

const STATUS_LABEL = {
    clean: "Clean",
    flagged: "Flagged",
    processing: "Processing",
    failed: "Failed",
};

/** Download the given filtered/sorted statements list as CSV. */
export function downloadStatementsCsv(statements, options = {}) {
    const rows = statements || [];
    const headers = [
        "Period",
        "Provider",
        "Uploaded",
        "Gross total",
        "Closing balance",
        "Status",
        "Flags count",
        "Note",
    ];
    const lines = [headers.map(csvEscape).join(",")];

    for (const s of rows) {
        const status = decodeStatus(s);
        const row = [
            periodCompact(s),
            providerName(s),
            uploadedLabel(s.uploaded_at),
            formatMoney(grossTotal(s)),
            formatMoney(closingBalance(s)),
            STATUS_LABEL[status] || status,
            String(flagsCount(s)),
            // Register keeps note bodies out of the payload, CSV surfaces
            // only the boolean indicator per Decision 6.
            s.has_note ? "yes" : "",
        ];
        lines.push(row.map(csvEscape).join(","));
    }

    const bom = "\uFEFF"; // Excel-friendly UTF-8 BOM
    const blob = new Blob([bom + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = options.filename || `wayly-statements-${isoDay()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
