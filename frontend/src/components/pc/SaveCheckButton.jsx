import React, { useState } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { track } from "@/lib/analytics";
import { Loader2, Save, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/**
 * WS8 save-result CTA + WS12 fuzzy-match confirmation modal.
 *
 * Two calls to /api/ppc/checks:
 *   1. First call posts the check. If backend detects a fuzzy provider
 *      match, it responds with saved=false + prompts[]. We open the modal.
 *   2. On modal confirm ("Yes, that's the same provider"), we POST again
 *      with merge_provider_id set.
 *
 * On successful save we call onSaved() so the parent can surface a rate-
 * increase chip / flash.
 */
export default function SaveCheckButton({ result, provider, snapshotId, ceState, onSaved, sourceStatementId }) {
    const [busy, setBusy] = useState(false);
    const [saved, setSaved] = useState(null); // {check_id, rate_increases_last_12mo}
    const [error, setError] = useState(null);
    const [modal, setModal] = useState(null); // {prompts}

    const buildBody = (mergeProviderId = null) => ({
        service: result.service,
        rate: result.charged,
        provider: provider || null,
        snapshot_id: snapshotId || result.source_snapshot_id || null,
        unit: result.unit,
        position: result.position,
        range_lower: result.lower,
        range_upper: result.upper,
        median: result.median,
        stream: result.stream,
        source_date: result.source_date,
        your_share: result?.your_share?.amount ?? null,
        pension_status: ceState?.pension_status || null,
        is_grandfathered: Boolean(ceState?.is_grandfathered),
        source_statement_id: sourceStatementId || null,
        is_after_hours: false,
        merge_provider_id: mergeProviderId,
    });

    const post = async (mergeProviderId = null) => {
        setBusy(true);
        setError(null);
        try {
            const { data } = await api.post("/ppc/checks", buildBody(mergeProviderId));
            if (data.saved === false && data.prompts?.length) {
                setModal({ prompts: data.prompts });
                return;
            }
            setSaved({
                check_id: data.check_id,
                rate_increases_last_12mo: data.rate_increases_last_12mo,
                provider_display_name: data.provider_display_name,
            });
            setModal(null);
            try {
                track.ppc.checkSaved({
                    service: result.service,
                    position: result.position,
                    rate_increases_last_12mo: data.rate_increases_last_12mo,
                });
            } catch (_) { /* noop */ }
            onSaved?.(data);
        } catch (err) {
            setError(extractErrorMessage(err, "Could not save."));
        } finally {
            setBusy(false);
        }
    };

    if (saved) return (
        <div
            className="inline-flex items-center gap-2 text-sm text-sage px-3 py-1.5 rounded-full bg-sage/10 border border-sage/25"
            data-testid="pc-saved-confirmation"
        >
            <CheckCircle2 className="h-4 w-4" />
            Saved.{saved.rate_increases_last_12mo > 2 && (
                <span data-testid="pc-rate-increase-chip" className="ml-1">
                    · {saved.rate_increases_last_12mo} increases in 12 months
                </span>
            )}
        </div>
    );

    return (
        <>
            <button
                type="button"
                onClick={() => post(null)}
                disabled={busy}
                data-testid="pc-save-check"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary-k text-primary-k text-sm hover:bg-primary-k hover:text-white transition-colors disabled:opacity-60"
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {busy ? "Saving…" : "Save this result"}
            </button>
            {error && <span className="ml-3 text-sm text-terracotta">{error}</span>}

            <FuzzyMatchModal
                modal={modal}
                onClose={() => setModal(null)}
                onKeepSeparate={() => post(null)}
                onMerge={(promptRow) => post(promptRow.suggested_last_check_id)}
                entered={provider}
                busy={busy}
            />
        </>
    );
}

function FuzzyMatchModal({ modal, onClose, onKeepSeparate, onMerge, entered, busy }) {
    if (!modal) return null;
    const prompt = modal.prompts?.[0];
    if (!prompt) return null;
    return (
        <Dialog open={Boolean(modal)} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent data-testid="pc-fuzzy-modal">
                <DialogHeader>
                    <DialogTitle>Is this the same provider?</DialogTitle>
                </DialogHeader>
                <div className="text-sm text-primary-k space-y-3">
                    <p>
                        {`You entered "${entered || prompt.entered_display_name || ""}". Looks similar to "${prompt.suggested_display_name || ""}" that you saved before. Should we treat them as the same provider so your history stays in one place?`}
                    </p>
                    <p className="text-xs text-muted-k">
                        {"Merging keeps prior and current rates in the same chronological log. If you keep them separate, they'll appear as two providers."}
                    </p>
                </div>
                <DialogFooter className="gap-2">
                    <button
                        type="button"
                        onClick={onKeepSeparate}
                        disabled={busy}
                        data-testid="pc-fuzzy-keep-separate"
                        className="px-3.5 py-2 rounded-full border border-kindred text-primary-k text-sm hover:bg-surface-2 disabled:opacity-60"
                    >
                        Keep as separate providers
                    </button>
                    <button
                        type="button"
                        onClick={() => onMerge(prompt)}
                        disabled={busy}
                        data-testid="pc-fuzzy-merge"
                        className="px-3.5 py-2 rounded-full bg-primary-k text-white text-sm hover:bg-[#091D33] disabled:opacity-60"
                    >
                        {busy ? "Merging…" : `Yes, merge with "${prompt.suggested_display_name || ""}"`}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
