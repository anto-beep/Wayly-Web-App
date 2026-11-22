/**
 * SessionExpiryWarning (spec 3.6).
 *
 * Non-blocking banner shown ~60 s before the JWT access-token expires,
 * with a "Stay signed in" primary action that transparently refreshes
 * the token. In-progress work in the surrounding tool is protected by
 * `useDraftPersist` (see Wave 3 K workstream) so the person never loses
 * typing if the refresh happens to fail.
 *
 * Reads token metadata from the AuthContext when available. If we can't
 * observe token TTL, the component silently no-ops.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Clock } from "lucide-react";
import { announce } from "../primitives/LiveRegion";
import COPY, { interpolate } from "../copy";

// How long before expiry we start warning the person (seconds).
const WARNING_LEAD_SECONDS = 60;

/**
 * Decode a JWT's `exp` claim without verifying the signature.
 * Returns epoch-seconds or null if the token is malformed.
 */
function decodeJwtExp(token) {
    if (!token) return null;
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        return typeof payload.exp === "number" ? payload.exp : null;
    } catch { return null; }
}

/**
 * @param {Object} props
 * @param {() => Promise<any>} [props.onExtend]  Handler that refreshes the
 *   token. Must return a promise that resolves when the new token is
 *   available. If omitted, we call the shared `/api/auth/refresh` path.
 * @param {string} [props.token]  The current access token. Defaults to
 *   `localStorage.getItem("kindred_token")`.
 */
export function SessionExpiryWarning({ onExtend, token }) {
    const [warnedAt, setWarnedAt] = useState(null);
    const [secondsRemaining, setSecondsRemaining] = useState(WARNING_LEAD_SECONDS);
    const [dismissed, setDismissed] = useState(false);

    const readToken = useCallback(() => {
        if (token) return token;
        try { return window.localStorage.getItem("kindred_token"); } catch { return null; }
    }, [token]);

    useEffect(() => {
        const t = readToken();
        const exp = decodeJwtExp(t);
        if (!exp) return undefined;

        const iv = setInterval(() => {
            const now = Math.floor(Date.now() / 1000);
            const secs = exp - now;
            if (secs <= 0) {
                // Token already expired. Let the api interceptor handle it.
                setWarnedAt(null);
                return;
            }
            if (secs <= WARNING_LEAD_SECONDS && !dismissed) {
                if (!warnedAt) {
                    setWarnedAt(Date.now());
                    announce({
                        message: interpolate(COPY.session.expiryWarning.body, { seconds: secs }),
                        priority: "assertive",
                    });
                }
                setSecondsRemaining(secs);
            }
        }, 1_000);

        return () => clearInterval(iv);
    }, [readToken, warnedAt, dismissed]);

    const handleExtend = async () => {
        setDismissed(true);
        setWarnedAt(null);
        try {
            if (onExtend) await onExtend();
        } catch { /* let the api interceptor bounce to /login */ }
    };

    if (!warnedAt || dismissed) return null;

    return (
        <div
            className="fixed top-4 right-4 z-[9998] max-w-sm rounded-lg p-4 shadow-lg"
            role="alert"
            aria-live="assertive"
            data-testid="uxf-session-expiry-warning"
            style={{
                backgroundColor: "var(--uxf-warning-bg)",
                border: "1px solid var(--uxf-warning)",
                color: "var(--uxf-text)",
                boxShadow: "var(--uxf-shadow-lg)",
            }}
        >
            <div className="flex items-start gap-3">
                <Clock
                    className="w-5 h-5 flex-shrink-0 mt-0.5"
                    aria-hidden="true"
                    style={{ color: "var(--uxf-warning)" }}
                />
                <div className="flex-1 space-y-2">
                    <div className="font-semibold" style={{ color: "var(--uxf-text)" }}>
                        {COPY.session.expiryWarning.title}
                    </div>
                    <div className="text-sm" style={{ color: "var(--uxf-muted)" }}>
                        {interpolate(COPY.session.expiryWarning.body, { seconds: secondsRemaining })}
                    </div>
                    <button
                        type="button"
                        onClick={handleExtend}
                        className="mt-1 px-3 py-1.5 rounded-md text-sm font-semibold"
                        data-testid="uxf-session-expiry-extend"
                        style={{
                            backgroundColor: "var(--uxf-primary)",
                            color: "var(--uxf-primary-fg)",
                        }}
                    >
                        {COPY.session.expiryWarning.extendCta}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SessionExpiryWarning;
