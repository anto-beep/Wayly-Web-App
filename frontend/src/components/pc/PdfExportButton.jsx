import React, { useState } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { track } from "@/lib/analytics";
import { Loader2, Download } from "lucide-react";

/**
 * WS8, One-page PDF export button. POSTs the current result to
 * /api/ppc/pdf-export and triggers a browser download of the returned
 * application/pdf blob.
 */
export default function PdfExportButton({ result, provider, ceState }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const download = async () => {
        setBusy(true);
        setError(null);
        try {
            const notes = [
                result.personal_care_transitional_note,
                result.after_hours_note,
                result.nursing_consumables_note,
            ].filter(Boolean);

            const body = {
                service: result.service,
                provider: provider || null,
                charged: result.charged,
                unit: result.unit,
                position: result.position,
                plain_language: result.plain_language,
                distance_summary: result.distance_summary,
                lower: result.lower,
                upper: result.upper,
                median: result.median,
                stream: result.stream,
                your_share_amount: result?.your_share?.amount ?? null,
                your_share_explanation: result?.your_share?.explanation ?? null,
                source_date: result.source_date,
                doh_caveat: result.doh_caveat,
                notes,
            };
            const res = await api.post("/ppc/pdf-export", body, { responseType: "blob" });
            const blob = new Blob([res.data], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const svc = (result.service || "check").toLowerCase().replace(/\s+/g, "-");
            a.download = `wayly-price-check-${svc}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            try { track.ppc.pdfExported({ service: result.service, position: result.position }); } catch (_) { /* noop */ }
        } catch (err) {
            setError(extractErrorMessage(err, "Could not download PDF."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={download}
                disabled={busy}
                data-testid="pc-pdf-export"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary-k text-primary-k text-sm hover:bg-primary-k hover:text-white transition-colors disabled:opacity-60"
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {busy ? "Rendering…" : "Download PDF"}
            </button>
            {error && <span className="ml-3 text-sm text-terracotta">{error}</span>}
        </>
    );
}
