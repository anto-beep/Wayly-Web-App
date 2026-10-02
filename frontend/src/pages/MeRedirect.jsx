/**
 * CORE-1 v1 · /app/me shortcut route.
 *
 * Resolves to the user's primary participant record and redirects to
 * /app/participants/:id. Per PERSONA-1, participant-self persona lands
 * directly on their own profile; caregivers land on the household's
 * primary participant.
 */
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import Skeleton from "@/components/Skeleton";

export default function MeRedirect() {
    const navigate = useNavigate();
    const { active, loading } = useParticipants();
    useEffect(() => {
        // Prefer the currently-active participant from the header switcher so
        // that clicking "Profile" always opens the person the user selected,
        // not the household primary. Fall back to the primary if no active
        // selection is available yet.
        if (active?.id) {
            navigate(`/app/participants/${active.id}`, { replace: true });
            return;
        }
        if (loading) return;
        api.get("/core/participants")
            .then((r) => {
                const list = r?.data?.participants || [];
                const primary = list.find((p) => p.is_primary) || list[0];
                if (primary?.id) {
                    navigate(`/app/participants/${primary.id}`, { replace: true });
                } else {
                    navigate("/onboarding", { replace: true });
                }
            })
            .catch(() => navigate("/app", { replace: true }));
    }, [navigate, active?.id, loading]);

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-4" data-testid="core1-me-loading">
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-40 w-full" />
        </div>
    );
}
