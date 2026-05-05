import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2, HeartHandshake } from "lucide-react";

/**
 * Handles the redirect from Emergent OAuth:
 *   /…/auth/callback#session_id=xxxxxx
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS,
 * THIS BREAKS THE AUTH.
 */
export default function AuthCallback() {
    const { completeGoogleAuth } = useAuth();
    const nav = useNavigate();
    const hasProcessed = useRef(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (hasProcessed.current) return;
        hasProcessed.current = true;

        const hash = window.location.hash || "";
        const m = hash.match(/session_id=([^&]+)/);
        if (!m) {
            setError("No session_id in URL.");
            return;
        }
        const sessionId = decodeURIComponent(m[1]);

        completeGoogleAuth(sessionId)
            .then((user) => {
                // Clear the hash so refresh doesn't replay
                window.history.replaceState(null, "", window.location.pathname);
                // Resolve destination from user shape
                let target = "/onboarding";
                if (user?.role === "participant") target = "/participant";
                else if (user?.plan === "free") target = "/app";
                // Use window.location.replace rather than React Router nav() —
                // the destination's auth guard reads `user` from context, and
                // nav() can fire before React commits the setUser update,
                // causing the guard to bounce back here. A hard replace
                // guarantees the destination boots with the persisted token
                // already in localStorage and the AuthProvider re-bootstraps
                // cleanly. See user-reported bug: "endless Signing you in".
                window.location.replace(target);
            })
            .catch((e) => {
                setError(e?.response?.data?.detail || e?.message || "Could not complete sign-in.");
            });
    }, [completeGoogleAuth, nav]);

    return (
        <div className="min-h-screen bg-kindred flex items-center justify-center px-6">
            <div className="text-center">
                <div className="h-10 w-10 rounded-full bg-primary-k flex items-center justify-center mx-auto">
                    <HeartHandshake className="h-5 w-5 text-white" />
                </div>
                {error ? (
                    <>
                        <h2 className="font-heading text-2xl text-primary-k mt-4">Sign-in didn't complete</h2>
                        <p className="mt-2 text-sm text-muted-k">{error}</p>
                        <button
                            onClick={() => nav("/login")}
                            className="mt-6 bg-primary-k text-white rounded-full px-6 py-2.5 text-sm hover:bg-[#16294a]"
                        >
                            Back to sign in
                        </button>
                    </>
                ) : (
                    <>
                        <h2 className="font-heading text-2xl text-primary-k mt-4">Signing you in…</h2>
                        <Loader2 className="h-5 w-5 text-muted-k animate-spin mx-auto mt-4" />
                    </>
                )}
            </div>
        </div>
    );
}
