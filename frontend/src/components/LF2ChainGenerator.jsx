/**
 * LF2ChainGenerator, reusable button that generates an LF-2 letter chain.
 *
 * Used by HardshipWalkthrough, PSW-1 decision walkthrough, and any other
 * guided journey that needs to hand off to a batch of pre-filled letters.
 * Falls back to a hard-coded chain key + participant if props are provided;
 * otherwise resolves the primary participant via /core/participants.
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { toast } from "sonner";
import { Send, CheckCircle2 } from "lucide-react";

export default function LF2ChainGenerator({
    chainKey,
    participantIdParam = null,
    contextExtras = {},
    sourceTool = null,
    sourceCaseId = null,
    label = "Generate Letter Chain",
    successLabel = "Chain created. Letters are ready to review and send.",
    "data-testid": testId,
}) {
    // If the caller explicitly passes a participant id, honour it. Otherwise
    // follow the reactive active-participant from context.
    const { active } = useParticipants();
    const pid = participantIdParam || active?.id || null;
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    // Reset the result if the participant changes so we don't leak the
    // previous participant's chain into the new session.
    useEffect(() => { setResult(null); }, [pid]);

    const generate = async () => {
        if (!pid) { toast.error("No participant found"); return; }
        setBusy(true);
        try {
            const { data } = await api.post("/lf2/generate-chain", {
                chain_key: chainKey,
                participant_id: pid,
                context: contextExtras || {},
                source_tool: sourceTool,
                source_case_id: sourceCaseId,
            });
            setResult(data);
            toast.success(successLabel);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not generate the letter chain");
        } finally { setBusy(false); }
    };

    if (result?.chain) {
        return (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-2" data-testid={testId || "lf2-chain-result"}>
                <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700"/>
                    <p className="text-sm text-emerald-800 font-medium">{result.chain.title}</p>
                </div>
                <p className="text-xs text-emerald-700">{result.drafts.length} letter{result.drafts.length !== 1 ? "s" : ""} drafted. Review, add recipient email, and send from Letters &amp; Follow-ups.</p>
                <ul className="text-xs text-emerald-900 space-y-1">
                    {result.drafts.map((d, i) => (
                        <li key={d.id} data-testid={`lf2-chain-draft-${i}`}>
                            {i + 1}. {d.subject} <span className="text-emerald-700/70">({d.recipient_type})</span>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    return (
        <button
            onClick={generate}
            disabled={busy || !pid}
            data-testid={testId || `lf2-chain-generate-${chainKey}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-k text-white text-sm disabled:opacity-40"
        >
            <Send className="w-4 h-4"/> {busy ? "Generating," : label}
        </button>
    );
}
