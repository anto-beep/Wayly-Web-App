/**
 * SD-3 v1 · Statement Pair Review page.
 *
 * Route: /app/participants/:id/statement-pairs/:pid
 *
 * Shows every duplicate candidate detected between two statements, lets the
 * caregiver confirm/dismiss each one, then one-tap Draft Letter which lands
 * them in the LF-1 correspondence detail page ready to send.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { formatDate } from "@/lib/formatDate";
import { ChevronLeft, CheckCircle2, X as XIcon, HelpCircle, Mail, ExternalLink } from "lucide-react";

const CONF_TINT = {
    high: "bg-red-50 text-red-700 border-red-100",
    medium: "bg-amber-50 text-amber-700 border-amber-100",
    low: "bg-primary-k/5 text-primary-k border-primary-k/10",
};

const DECISION_LABELS = {
    confirmed_duplicate: "Confirmed duplicate",
    not_duplicate: "Not a duplicate",
    uncertain: "Marked uncertain",
    unconfirmed: "Not reviewed",
};

export default function StatementPairReview() {
    const { id: participantId, pid: pairId } = useParams();
    const navigate = useNavigate();
    const [pair, setPair] = useState(null);
    const [error, setError] = useState(null);
    const [savingId, setSavingId] = useState(null);
    const [flash, setFlash] = useState("");

    const load = useCallback(async () => {
        setError(null);
        try {
            const r = await api.get(`/sd3/pairs/${pairId}`);
            setPair(r.data);
        } catch (e) {
            setError(e?.response?.status === 404 ? "not_found" : (e?.response?.data?.detail || e?.message || "error"));
        }
    }, [pairId]);

    useEffect(() => { setPair(null); load(); }, [load]);

    async function setDecision(candidateId, decision) {
        setSavingId(candidateId);
        try {
            await api.patch(`/sd3/candidates/${candidateId}`, { decision });
            await load();
        } finally { setSavingId(null); }
    }

    async function draftLetter(candidateId) {
        setSavingId(candidateId);
        try {
            const r = await api.post(`/sd3/candidates/${candidateId}/draft-letter`);
            const entryId = r.data?.lf1_entry_id;
            if (entryId) {
                setFlash(r.data.already_existed ? "Existing draft opened." : "Draft created, opening…");
                setTimeout(() => navigate(`/tools/letters-and-follow-ups/${entryId}`), 400);
            }
        } catch (e) {
            setFlash(e?.response?.data?.detail || "Failed to draft letter");
        } finally { setSavingId(null); }
    }

    if (error === "not_found") {
        return (
            <div className="max-w-3xl mx-auto p-8 text-center" data-testid="sd3-pair-not-found">
                <p className="text-sm text-primary-k/60">This statement pair does not exist or you do not have access.</p>
                <Link to={`/app/participants/${participantId}`} className="mt-3 inline-block text-primary-k underline">Back to profile</Link>
            </div>
        );
    }
    if (error) return <div className="max-w-3xl mx-auto p-8 text-center text-sm text-red-600" data-testid="sd3-pair-error">{String(error)}</div>;
    if (!pair) return <div className="max-w-3xl mx-auto p-6"><Skeleton className="h-40" /></div>;

    const confirmedCount = (pair.candidates || []).filter((c) => c.user_decision === "confirmed_duplicate").length;

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-4" data-testid="sd3-pair-review-page">
            <Link
                to={`/app/participants/${participantId}`}
                className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k"
                data-testid="sd3-back-to-profile"
            >
                <ChevronLeft className="w-4 h-4" /> Back to profile
            </Link>

            <header className="rounded-2xl border border-primary-k/10 bg-white p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-primary-k/50">Statement pair review</p>
                        <h1 className="text-xl font-heading text-primary-k mt-1" data-testid="sd3-pair-title">
                            {pair.duplicate_candidate_count} candidate duplicate{pair.duplicate_candidate_count !== 1 ? "s" : ""}
                        </h1>
                        <p className="text-xs text-primary-k/50 mt-1">
                            Pair created {formatDate(pair.created_at)} · {pair.pair_type?.replace(/_/g, " ")}
                        </p>
                    </div>
                    {pair.case_id && (
                        <Link
                            to={`/app/participants/${participantId}/cases/${pair.case_id}`}
                            data-testid="sd3-open-case-link"
                            className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-primary-k/20 text-primary-k hover:bg-primary-k/[0.03]"
                        >
                            Open case <ExternalLink className="w-3 h-3" />
                        </Link>
                    )}
                </div>
                {flash && <div data-testid="sd3-pair-flash" className="mt-3 text-xs text-primary-k bg-primary-k/[0.04] border border-primary-k/10 rounded-lg px-3 py-2">{flash}</div>}
                {confirmedCount > 0 && (
                    <div className="mt-3 text-sm text-primary-k/70">
                        <strong>{confirmedCount}</strong> confirmed, you can draft a letter to your provider for any confirmed duplicate below.
                    </div>
                )}
            </header>

            {(pair.candidates || []).length === 0 ? (
                <div data-testid="sd3-pair-empty" className="rounded-2xl border border-dashed border-primary-k/20 bg-white/40 p-6 text-center">
                    <p className="text-sm text-primary-k/60">No candidates detected. That&apos;s a good thing, no obvious duplicates across these two statements.</p>
                </div>
            ) : (
                <ul className="space-y-3" data-testid="sd3-candidates-list">
                    {(pair.candidates || []).map((c) => (
                        <li
                            key={c.id}
                            data-testid={`sd3-candidate-${c.id}`}
                            className={`rounded-2xl border p-4 bg-white transition ${c.user_decision === "confirmed_duplicate" ? "border-red-200 bg-red-50/30" : c.user_decision === "not_duplicate" ? "border-primary-k/5 opacity-70" : "border-primary-k/10"}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${CONF_TINT[c.confidence] || CONF_TINT.medium}`}>
                                            {c.confidence} confidence
                                        </span>
                                        <span className="text-[10px] uppercase tracking-wide text-primary-k/50">
                                            {c.match_type?.replace(/_/g, " ")} · {c.source || "heuristic"}
                                        </span>
                                        {c.user_decision !== "unconfirmed" && (
                                            <span className="text-[10px] uppercase tracking-wide text-primary-k/70 border border-primary-k/15 rounded-full px-2 py-0.5">
                                                {DECISION_LABELS[c.user_decision] || c.user_decision}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-primary-k mt-2" data-testid={`sd3-candidate-summary-${c.id}`}>
                                        {c.suggested_summary_tokens?.caregiver || c.reason || "Possible duplicate billing."}
                                    </p>
                                    {c.reason && c.reason !== c.suggested_summary_tokens?.caregiver && (
                                        <p className="text-xs text-primary-k/60 mt-1"><strong>Why:</strong> {c.reason}</p>
                                    )}
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    data-testid={`sd3-confirm-${c.id}`}
                                    disabled={savingId === c.id}
                                    onClick={() => setDecision(c.id, "confirmed_duplicate")}
                                    className={`text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-medium ${c.user_decision === "confirmed_duplicate" ? "bg-red-600 text-white" : "border border-red-200 text-red-700 hover:bg-red-50"}`}
                                >
                                    <CheckCircle2 className="w-3 h-3" /> Confirm duplicate
                                </button>
                                <button
                                    data-testid={`sd3-dismiss-${c.id}`}
                                    disabled={savingId === c.id}
                                    onClick={() => setDecision(c.id, "not_duplicate")}
                                    className={`text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full ${c.user_decision === "not_duplicate" ? "bg-primary-k text-white" : "border border-primary-k/20 text-primary-k"}`}
                                >
                                    <XIcon className="w-3 h-3" /> Not a duplicate
                                </button>
                                <button
                                    data-testid={`sd3-uncertain-${c.id}`}
                                    disabled={savingId === c.id}
                                    onClick={() => setDecision(c.id, "uncertain")}
                                    className={`text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full ${c.user_decision === "uncertain" ? "bg-amber-500 text-white" : "border border-amber-200 text-amber-700"}`}
                                >
                                    <HelpCircle className="w-3 h-3" /> Uncertain
                                </button>
                                {c.user_decision === "confirmed_duplicate" && (
                                    <button
                                        data-testid={`sd3-draft-letter-${c.id}`}
                                        disabled={savingId === c.id}
                                        onClick={() => draftLetter(c.id)}
                                        className="ml-auto text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary-k text-white"
                                    >
                                        <Mail className="w-3 h-3" /> {c.lf1_entry_id ? "Open letter" : "Draft letter"}
                                    </button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
