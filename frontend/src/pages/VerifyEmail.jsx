import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, AlertCircle, Clock, Loader2, Mail } from "lucide-react";
import WaylyLogo from "@/components/WaylyLogo";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";

/**
 * /verify-email landing page.
 *
 * Primary flow: backend GET /api/auth/verify-email?token=… verifies the
 * token and 302-redirects here with `?status=success|expired|invalid|already_verified`.
 * That is the path every current outgoing email uses.
 *
 * Fallback (defence-in-depth): if we ever land here with a raw `?token=` in
 * the URL (older email in a customer's inbox, or a copy-pasted link) we
 * self-redeem by calling the backend endpoint and rewriting the URL. That
 * way even legacy links keep working after the fix, no "Link not valid"
 * dead-end for tokens the DB still recognises.
 */
const STATUS_META = {
    verifying: {
        title: "Verifying your email…",
        body: "Hang tight, we're finishing the last step.",
        icon: Loader2,
        tone: "sage",
    },
    success: {
        title: "Email verified",
        body: "Thank you, your email has been verified. You can now use Wayly without interruption.",
        icon: CheckCircle2,
        tone: "sage",
    },
    already_verified: {
        title: "Already verified",
        body: "This email has already been verified. You are all set.",
        icon: CheckCircle2,
        tone: "sage",
    },
    expired: {
        title: "Link expired",
        body: "This verification link has expired. Request a new one below.",
        icon: Clock,
        tone: "terracotta",
    },
    invalid: {
        title: "Link not valid",
        body: "We couldn't recognise this verification link. It may have already been used or replaced by a newer one.",
        icon: AlertCircle,
        tone: "terracotta",
    },
};

export default function VerifyEmail() {
    const loc = useLocation();
    const nav = useNavigate();
    const params = new URLSearchParams(loc.search);
    const statusFromUrl = params.get("status");
    const tokenFromUrl = params.get("token");
    // Belt-and-braces: if we land here with a raw `?token=` (i.e. a legacy
    // email link that didn't route through the backend consumer), redeem
    // the token against the API here and rewrite the URL with `?status=`.
    const [selfConsumeState, setSelfConsumeState] = useState(
        tokenFromUrl && !statusFromUrl ? "verifying" : null,
    );
    useEffect(() => {
        if (!tokenFromUrl || statusFromUrl) return;
        (async () => {
            try {
                // The backend endpoint is a redirect handler, use fetch with
                // `redirect: manual` so we can read the Location it hands
                // back rather than following into the SPA route again.
                const url = `/api/auth/verify-email?token=${encodeURIComponent(tokenFromUrl)}`;
                await fetch(url, { method: "GET", redirect: "follow" });
                // After follow the browser (or fetch) lands on /verify-email?status=…,
                // but because we called via fetch we don't actually change the page.
                // Instead, hit the same route ourselves with a HEAD-style trick:
                const probe = await fetch(url, { method: "GET", redirect: "manual" });
                const loc = probe.headers.get("location") || "";
                const m = /[?&]status=([a-z_]+)/i.exec(loc);
                const next = m ? m[1] : "invalid";
                nav(`/verify-email?status=${encodeURIComponent(next)}`, { replace: true });
            } catch {
                nav(`/verify-email?status=invalid`, { replace: true });
            } finally {
                setSelfConsumeState("done");
            }
        })();
    }, [tokenFromUrl, statusFromUrl, nav]);

    const status = statusFromUrl || (selfConsumeState === "verifying" ? "verifying" : "invalid");
    const meta = STATUS_META[status] || STATUS_META.invalid;
    const Icon = meta.icon;
    const [resendEmail, setResendEmail] = useState("");
    const [sending, setSending] = useState(false);

    const sendNew = async (e) => {
        e?.preventDefault?.();
        if (!resendEmail.trim()) return;
        setSending(true);
        try {
            await api.post("/auth/resend-verification-email", { email: resendEmail.trim() });
            toast.success("If that email is registered, a new verification link is on the way.");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not send verification email"));
        } finally {
            setSending(false);
        }
    };

    const toneClasses = {
        sage: "bg-sage/15 border-sage/40 text-sage",
        terracotta: "bg-terracotta/10 border-terracotta/40 text-terracotta",
    }[meta.tone];

    return (
        <div className="min-h-screen bg-kindred flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-md bg-surface border border-kindred rounded-2xl p-6 sm:p-8" data-testid="verify-email-page">
                <div className="flex items-center gap-2 mb-6">
                    <WaylyLogo size={32} className="rounded-md" />
                    <span className="font-heading text-lg text-primary-k">Wayly</span>
                </div>

                <div className={`inline-flex items-center justify-center h-12 w-12 rounded-xl border ${toneClasses} mb-4`}>
                    <Icon className="h-6 w-6" />
                </div>

                <h1 className="font-heading text-2xl text-primary-k tracking-tight" data-testid={`verify-status-${status}`}>
                    {meta.title}
                </h1>
                <p className="mt-2 text-sm text-muted-k leading-relaxed">{meta.body}</p>

                {(status === "expired" || status === "invalid") && (
                    <form onSubmit={sendNew} className="mt-6 space-y-3">
                        <label className="block">
                            <span className="text-xs text-muted-k">Your email address</span>
                            <input
                                type="email"
                                value={resendEmail}
                                onChange={(e) => setResendEmail(e.target.value)}
                                required
                                placeholder="you@example.com"
                                data-testid="verify-resend-email-input"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={sending}
                            data-testid="verify-resend-submit"
                            className="w-full bg-primary-k text-white rounded-md py-2.5 text-sm hover:bg-[#091D33] inline-flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                            {sending ? "Sending…" : "Send a new verification link"}
                        </button>
                    </form>
                )}

                {(status === "success" || status === "already_verified") && (
                    <Link
                        to="/app"
                        data-testid="verify-go-dashboard"
                        className="mt-6 inline-flex items-center justify-center w-full bg-primary-k text-white rounded-md py-2.5 text-sm hover:bg-[#091D33]"
                    >
                        Go to dashboard
                    </Link>
                )}
            </div>
        </div>
    );
}


/**
 * Dashboard banner, visible whenever the signed-in user has
 * email_verified === false. Polls `/auth/verification-status` once on mount.
 */
export function EmailVerificationBanner() {
    const [status, setStatus] = useState(null);
    const [sending, setSending] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get("/auth/verification-status");
                if (!cancelled) setStatus(data);
            } catch { /* unauthenticated */ }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!status || status.email_verified || dismissed) return null;

    const resend = async () => {
        setSending(true);
        try {
            await api.post("/auth/send-verification-email");
            toast.success("Verification email sent. Check your inbox.");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not send email"));
        } finally {
            setSending(false);
        }
    };

    const isCritical = status.days_remaining <= 1;
    const tone = isCritical
        ? "border-terracotta/40 bg-terracotta/10"
        : "border-gold/40 bg-gold/10";

    return (
        <div
            data-testid="email-verification-banner"
            className={`rounded-xl border ${tone} px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3`}
        >
            <div className="flex items-start gap-3 flex-1 min-w-0">
                <Mail className="h-5 w-5 text-primary-k flex-none mt-0.5" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm text-primary-k">
                        Please verify your email, we sent a link to <strong>{status.email}</strong>.
                    </div>
                    <div className="text-xs text-muted-k mt-0.5">
                        {status.days_remaining > 0
                            ? `${status.days_remaining} day${status.days_remaining === 1 ? "" : "s"} remaining before login is locked.`
                            : "Today is your last day, login will lock at midnight."}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-2 flex-none">
                <button
                    type="button"
                    onClick={resend}
                    disabled={sending}
                    data-testid="email-verification-resend"
                    className="flex-1 sm:flex-none bg-primary-k text-white rounded-md px-3 py-2 text-xs hover:bg-[#091D33] inline-flex items-center justify-center gap-1 disabled:opacity-50"
                >
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    {sending ? "Sending…" : "Resend email"}
                </button>
                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    aria-label="Dismiss"
                    className="flex-none text-muted-k hover:text-primary-k text-xs px-2 py-2"
                >
                    Hide
                </button>
            </div>
        </div>
    );
}
