import React from "react";
import { GoogleLogin } from "@react-oauth/google";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

/**
 * Wayly's own Google OAuth sign-in button (Google Identity Services).
 * GoogleLogin returns a Google ID token (`credential`) IN-PAGE, which we POST
 * to POST /api/auth/google for server-side verification + Wayly JWT minting.
 * The <PublicAuthOnly> route wrapper redirects once `user` is set in context.
 *
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS,
 * THIS BREAKS THE AUTH.
 */
export default function GoogleSignInButton({ testid = "google-signin", planIntent = null, onBeforeClick = null, text = "continue_with" }) {
    const { completeGoogleAuth } = useAuth();

    const onSuccess = async (cred) => {
        const credential = cred?.credential;
        if (!credential) {
            toast.error("Could not complete Google sign-in.");
            return;
        }
        // Persist pre-auth intent so onboarding can resume (second participant, plan).
        if (typeof onBeforeClick === "function") {
            try { onBeforeClick(); } catch { /* non-fatal */ }
        }
        if (planIntent && ["solo", "family"].includes(planIntent)) {
            try { localStorage.setItem("wayly_plan_intent", planIntent); } catch { /* ignore */ }
        }
        try {
            const user = await completeGoogleAuth(credential);
            // If the user picked a paid plan pre-signup, start their trial (best-effort).
            if (planIntent && ["solo", "family"].includes(planIntent) && (user?.plan || "free") === "free") {
                try {
                    const { api } = await import("@/lib/api");
                    await api.post("/billing/start-trial", { plan: planIntent });
                } catch { /* trial may already be used, fall through to onboarding */ }
            }
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not complete Google sign-in.");
        }
    };

    return (
        <div data-testid={testid} className="w-full flex justify-center [&>div]:w-full">
            <GoogleLogin
                onSuccess={onSuccess}
                onError={() => toast.error("Google sign-in was cancelled or failed.")}
                text={text}
                width="360"
                shape="rectangular"
                logo_alignment="center"
            />
        </div>
    );
}
