import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";

/**
 * PlanComplianceGuard
 *
 * Solo covers one participant only. If an account is found sitting on Solo with
 * more than one participant, that state is not allowed to persist. This guard
 * checks on every authenticated page load (so it fires on login too) and, when
 * it finds the violation, blocks the app with a resolution prompt: switch to
 * Family, or go and remove the additional participant. Copy uses a single $,
 * no dashes, and the exact fortnightly pricing.
 */
export default function PlanComplianceGuard() {
    const navigate = useNavigate();
    const [state, setState] = useState(null); // {violation, active_participants}
    const [working, setWorking] = useState(false);

    const check = useCallback(async () => {
        try {
            const { data } = await api.get("/v2/plan-compliance");
            setState(data);
        } catch { setState(null); }
    }, []);

    useEffect(() => { check(); }, [check]);

    if (!state?.violation) return null;

    const switchToFamily = async () => {
        setWorking(true);
        try {
            await api.post("/v2/resolve-solo-to-family");
            toast.success("You are now on the Family plan at $49.50 per fortnight. Everyone is covered.");
            await check();
            // Nudge any billing views to refresh their subscription state.
            setTimeout(() => window.location.reload(), 400);
        } catch {
            toast.error("Could not switch your plan just now. Please try again.");
            setWorking(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-primary-k/60 backdrop-blur-sm p-4" data-testid="plan-compliance-guard">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-kindred p-6 space-y-4">
                <h2 className="text-lg font-heading text-primary-k">Let us tidy up your plan</h2>
                <p className="text-sm text-primary-k">
                    Your account is on Solo but has {state.active_participants} participants. Solo covers one participant only.
                </p>
                <p className="text-sm text-muted-k">
                    Staying on Solo with more than one person would cost $49.00 per fortnight (Solo $24.50 plus an additional participant $24.50). The Family plan at $49.50 per fortnight covers everyone and is the better choice.
                </p>
                <p className="text-sm text-muted-k">
                    To continue, switch to Family, or remove the additional participant so Solo covers just one person.
                </p>
                <div className="flex flex-col gap-2 pt-1">
                    <button
                        onClick={switchToFamily}
                        disabled={working}
                        className="bg-gold text-white font-semibold rounded-md px-4 py-2.5 text-sm disabled:opacity-60"
                        data-testid="compliance-switch-family"
                    >
                        {working ? "Switching…" : "Switch to Family ($49.50 per fortnight)"}
                    </button>
                    <button
                        onClick={() => navigate("/app/participants")}
                        className="rounded-md border border-kindred px-4 py-2.5 text-sm text-primary-k hover:bg-surface-2"
                        data-testid="compliance-manage-participants"
                    >
                        Remove a participant instead
                    </button>
                </div>
            </div>
        </div>
    );
}
