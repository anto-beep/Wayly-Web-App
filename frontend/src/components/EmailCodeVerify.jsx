import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";

/**
 * Reusable 6-digit email verification code entry.
 *
 * Props:
 * - email: the address being verified (shown to the user, sent to the API).
 * - authed: true when a signed-in user is verifying (uses the authed send
 *   endpoint); false for the locked-out-at-login flow (public resend by email).
 * - onVerified: called after a successful verification.
 * - autoSend: send a code on mount (default true). Handles the 5-min cooldown
 *   gracefully (e.g. a code was already emailed at signup).
 */
export default function EmailCodeVerify({ email, authed = true, onVerified, autoSend = true }) {
    const [digits, setDigits] = useState(["", "", "", "", "", ""]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [debugCode, setDebugCode] = useState(null);
    const [notice, setNotice] = useState("");
    const inputs = useRef([]);
    const sentGuard = useRef(false);

    const code = digits.join("");

    const send = async (silent) => {
        setError("");
        try {
            const { data } = authed
                ? await api.post("/auth/send-verification-email")
                : await api.post("/auth/resend-verification-email", { email });
            if (data?.resend_available_in) setCooldown(data.resend_available_in);
            if (data?.debug_code) setDebugCode(data.debug_code);
            if (!silent) setNotice(`We sent a fresh code to ${email}.`);
        } catch (err) {
            const status = err?.response?.status;
            if (status === 429) {
                const m = /(\d+)\s*seconds/.exec(err?.response?.data?.detail || "");
                if (m) setCooldown(Number(m[1]));
                if (!silent) setNotice(`A code was already sent to ${email}. Check your inbox.`);
            } else if (!silent) {
                setError(extractErrorMessage(err, "Could not send a code."));
            }
        }
    };

    useEffect(() => {
        (async () => {
            if (authed) {
                try {
                    const { data } = await api.get("/auth/verification-status");
                    if (data?.email_verified) { onVerified?.(); return; }
                    if (typeof data?.resend_available_in === "number") setCooldown(data.resend_available_in);
                    if (data?.debug_code) setDebugCode(data.debug_code);
                } catch { /* ignore */ }
            }
            if (autoSend && !sentGuard.current) { sentGuard.current = true; await send(true); }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
        return () => clearInterval(t);
    }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

    const verify = async (full) => {
        const value = full ?? code;
        if (value.length < 6) return;
        setBusy(true);
        setError("");
        try {
            await api.post("/auth/verify-code", { email, code: value });
            onVerified?.();
        } catch (err) {
            setDigits(["", "", "", "", "", ""]);
            inputs.current[0]?.focus();
            setError(extractErrorMessage(err, "That code didn't work. Please try again."));
        } finally {
            setBusy(false);
        }
    };

    const setAt = (i, v) => {
        const c = String(v).replace(/[^0-9]/g, "");
        const d = [...digits];
        if (c.length > 1) {
            // paste of a full/partial code
            const chars = c.slice(0, 6).split("");
            for (let k = 0; k < 6; k++) d[k] = chars[k] || "";
            setDigits(d);
            const full = d.join("");
            if (full.length === 6) verify(full);
            else inputs.current[Math.min(chars.length, 5)]?.focus();
            return;
        }
        d[i] = c;
        setDigits(d);
        if (c && i < 5) inputs.current[i + 1]?.focus();
        const full = d.join("");
        if (full.length === 6) verify(full);
    };

    const onKey = (i, e) => {
        if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    };

    const mm = Math.floor(cooldown / 60);
    const ss = String(cooldown % 60).padStart(2, "0");

    return (
        <div data-testid="email-code-verify">
            <div className="flex gap-2 justify-between">
                {digits.map((dv, i) => (
                    <input
                        key={i}
                        ref={(el) => (inputs.current[i] = el)}
                        type="text"
                        inputMode="numeric"
                        autoComplete={i === 0 ? "one-time-code" : "off"}
                        maxLength={6}
                        value={dv}
                        autoFocus={i === 0}
                        disabled={busy}
                        onChange={(e) => setAt(i, e.target.value)}
                        onKeyDown={(e) => onKey(i, e)}
                        data-testid={`code-digit-${i}`}
                        className="w-full h-14 max-w-[54px] text-center text-2xl font-heading rounded-md border-2 border-kindred bg-surface text-primary-k focus:outline-none focus:border-primary-k"
                    />
                ))}
            </div>

            {error ? (
                <p data-testid="code-error" className="mt-3 text-sm text-terracotta text-center">{error}</p>
            ) : notice ? (
                <p data-testid="code-notice" className="mt-3 text-sm text-muted-k text-center">{notice}</p>
            ) : null}

            {debugCode ? (
                <p data-testid="code-debug" className="mt-2 text-xs text-gold text-center">Preview code: {debugCode}</p>
            ) : null}

            <button
                type="button"
                onClick={() => verify()}
                disabled={busy || code.length < 6}
                data-testid="code-verify-submit"
                className="mt-5 w-full bg-primary-k text-white rounded-md py-2.5 text-sm inline-flex items-center justify-center gap-2 hover:bg-primary-k/90 disabled:opacity-50"
            >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {busy ? "Verifying…" : "Verify"}
            </button>

            <div className="mt-3 text-center">
                <button
                    type="button"
                    onClick={() => send(false)}
                    disabled={cooldown > 0}
                    data-testid="code-resend"
                    className="text-sm text-primary-k hover:underline disabled:text-muted-k disabled:no-underline"
                >
                    {cooldown > 0 ? `Resend code in ${mm}:${ss}` : "Resend code"}
                </button>
            </div>
        </div>
    );
}
