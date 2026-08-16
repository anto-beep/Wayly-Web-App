/**
 * OJ-1 v1.1, Static Envelope Tile. Shown on the caregiver dashboard once
 * the user's onboarding journey is completed. Acts as a placeholder for
 * the QP-1 quarterly pacing tool that will replace it in a later release.
 *
 * Behaviour:
 *   - Fetches /api/journeys/current on mount. If status === "completed",
 *     renders the tile. Otherwise renders nothing.
 *   - Links to /ai-tools/statement-decoder with the journey id in the
 *     querystring so the decoder can carry forward context.
 *   - The user can dismiss the tile locally (localStorage flag) without
 *     touching backend state.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { ArrowRight, Mail, X, Sparkles } from "lucide-react";

const DISMISS_KEY = "wayly:oj1:envelope:dismissed";

export default function OnboardingEnvelopeTile() {
    const [journey, setJourney] = useState(null);
    const [qpActive, setQpActive] = useState(false);
    const { items: participants, activeId } = useParticipants();
    const active = (participants || []).find((p) => p.id === activeId) || (participants || [])[0];
    const participantId = active?.id;
    const [dismissed, setDismissed] = useState(() => {
        try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
    });

    // If QP-1 already has data for this participant, the QP-1 tile is showing
    //, hide the envelope preview so the dashboard has one clear next step.
    useEffect(() => {
        if (!participantId) return;
        let alive = true;
        (async () => {
            try {
                const s = await api.get(`/qp1/schedules?participant_id=${participantId}`).catch(() => null);
                if (!alive) return;
                if ((s?.data?.schedules || []).length > 0) { setQpActive(true); return; }
                const l = await api.get(`/qp1/ledger?participant_id=${participantId}`).catch(() => null);
                if (!alive) return;
                if ((l?.data?.entries || []).length > 0) setQpActive(true);
            } catch { /* silent */ }
        })();
        return () => { alive = false; };
    }, [participantId]);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                // /api/journeys/current returns the in-progress journey. When
                // there isn't one, we look at the most recent completed journey
                // via a follow-up: the router-friendly approach is to POST
                // /journeys which is idempotent, completed journeys aren't
                // resurrected there, so we need a distinct "any" check. Do a
                // best-effort GET first.
                const cur = await api.get("/journeys/current").catch(() => null);
                if (!alive) return;
                if (cur?.data?.journey?.status === "completed") {
                    setJourney(cur.data.journey);
                    return;
                }
                // Not in-progress → check for a completed one by asking for any
                // journey record. We piggy-back on the same route: pass
                // ?include_completed=1 (server ignores unknown params). If the
                // server hasn't been updated, we fall through quietly.
                const anyRes = await api.get("/journeys/current?include_completed=1").catch(() => null);
                if (!alive) return;
                if (anyRes?.data?.journey?.status === "completed") {
                    setJourney(anyRes.data.journey);
                }
            } catch { /* silent */ }
        })();
        return () => { alive = false; };
    }, []);

    if (dismissed || !journey || qpActive) return null;

    return (
        <aside
            className="rounded-2xl border border-gold/40 bg-gold/5 p-5 sm:p-6 flex items-start gap-4"
            data-testid="oj1-envelope-tile"
        >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gold/20 text-gold shrink-0">
                <Mail className="h-5 w-5" aria-hidden />
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-heading text-lg text-primary-k">Your envelope, coming soon</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold/20 text-gold text-[10px] uppercase tracking-wider px-2 py-0.5">
                        <Sparkles className="h-3 w-3" /> Preview
                    </span>
                </div>
                <p className="mt-2 text-sm text-primary-k/85 leading-relaxed">
                    You&apos;ve finished the walk-through. The quarterly pacing view is on its way. In the meantime,
                    open the Statement Decoder with the details you just captured.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link
                        to={`/ai-tools/statement-decoder?journey=${journey.id}`}
                        className="inline-flex items-center gap-1 text-sm text-primary-k underline hover:no-underline"
                        data-testid="oj1-envelope-cta"
                    >
                        Open Statement Decoder <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>
            <button
                type="button"
                onClick={() => {
                    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* noop */ }
                    setDismissed(true);
                }}
                className="shrink-0 text-muted-k hover:text-primary-k"
                aria-label="Dismiss the onboarding envelope tile"
                data-testid="oj1-envelope-dismiss"
            >
                <X className="h-4 w-4" />
            </button>
        </aside>
    );
}
