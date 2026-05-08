import React from "react";

/**
 * Single source of truth for the Emergent Google OAuth redirect.
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS,
 * THIS BREAKS THE AUTH.
 */
export default function GoogleSignInButton({ label = "Continue with Google", testid = "google-signin", planIntent = null }) {
    const onClick = () => {
        // Persist the user's plan intent so we can resume after the OAuth round-trip.
        if (planIntent && ["solo", "family"].includes(planIntent)) {
            try { localStorage.setItem("kindred_plan_intent", planIntent); } catch {}
        }
        // Derive the redirect URL dynamically — never hardcode.
        const redirectUrl = window.location.origin + "/auth/callback";
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    };
    return (
        <button
            type="button"
            onClick={onClick}
            data-testid={testid}
            className="w-full inline-flex items-center justify-center gap-3 border border-kindred bg-white rounded-md py-3 text-sm text-primary-k hover:bg-surface-2 transition-colors"
        >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.995 3.018v2.51h3.232c1.892-1.742 2.981-4.305 2.981-7.351z"/>
                <path fill="#34A853" d="M12 22c2.7 0 4.964-.895 6.619-2.422l-3.232-2.51c-.895.6-2.04.955-3.387.955-2.605 0-4.81-1.76-5.595-4.123H3.064v2.59A9.996 9.996 0 0 0 12 22z"/>
                <path fill="#FBBC05" d="M6.405 13.9A6 6 0 0 1 6.09 12c0-.659.114-1.3.314-1.9V7.51H3.064A9.996 9.996 0 0 0 2 12c0 1.614.386 3.14 1.064 4.49l3.341-2.59z"/>
                <path fill="#EA4335" d="M12 5.977c1.469 0 2.786.505 3.823 1.496l2.868-2.868C16.96 3.046 14.696 2 12 2 8.092 2 4.71 4.245 3.064 7.51l3.341 2.59C7.19 7.737 9.395 5.977 12 5.977z"/>
            </svg>
            {label}
        </button>
    );
}
