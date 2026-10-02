import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api, extractErrorMessage } from "@/lib/api";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import WaylyLogo from "@/components/WaylyLogo";
import WaylyLoader from "@/components/WaylyLoader";
import { Eye, EyeOff, MailWarning, Loader2, CheckCircle2 } from "lucide-react";
import EmailCodeVerify from "@/components/EmailCodeVerify";

import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";

function formatLockout(detail) {
    const secs = Number(detail?.retry_after_seconds) || 0;
    const mins = Math.max(1, Math.ceil(secs / 60));
    let whenStr = "";
    try {
        if (detail?.locked_until) {
            const d = new Date(detail.locked_until);
            const t = new Intl.DateTimeFormat(undefined, {
                hour: "numeric", minute: "2-digit", timeZoneName: "short",
            }).format(d);
            whenStr = ` (around ${t})`;
        }
    } catch { /* fall back to the server message */ }
    if (!whenStr && detail?.message) return detail.message;
    return `Too many failed sign-in attempts, so this account is locked for a short while. Try again in about ${mins} minute${mins !== 1 ? "s" : ""}${whenStr} or reset your password.`;
}

// Map a login failure to a clear, specific message. Returns null when the
// global api.js interceptor already surfaces it (429 rate limit).
function loginErrorMessage(err) {
    if (!err?.response) {
        return "We couldn't reach Wayly. Check your internet connection and try again.";
    }
    const status = err.response.status;
    const detail = err.response.data?.detail;
    if (detail && typeof detail === "object" && detail.code === "account_locked") {
        return formatLockout(detail);
    }
    if (status === 401) {
        return "That email or password doesn't match. Please double-check and try again.";
    }
    if (status === 429) return null; // handled by the global rate-limit toast
    if (status >= 500) {
        return "Something went wrong on our end. Please try again in a moment.";
    }
    return extractErrorMessage(err, "Could not sign in. Please try again.");
}

export default function Login() {
    const { login, verifyMfa } = useAuth();
    const nav = useNavigate();
    // Prefill saved email when "Remember me" was ticked on a previous visit.
    const [email, setEmail] = useState(() => {
        try {
            return localStorage.getItem("wayly:remembered-email") || "";
        } catch { return ""; }
    });
    const [rememberMe, setRememberMe] = useState(() => {
        try {
            return !!localStorage.getItem("wayly:remembered-email");
        } catch { return false; }
    });
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // 2FA challenge state, populated when /auth/login returns requires_mfa.
    const [mfaToken, setMfaToken] = useState(null);
    const [mfaCode, setMfaCode] = useState("");
    // Verification-required state (403 email_verification_required)
    const [verificationRequired, setVerificationRequired] = useState(null);
    // { email, message }, shows an inline banner with a resend button.
    const [resending, setResending] = useState(false);
    const [resentAt, setResentAt] = useState(null);

    const routeAfterLogin = (u) => {
        if (u.plan === "adviser") nav("/adviser");
        else nav("/app");
    };

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setVerificationRequired(null);
        setResentAt(null);
        try {
            const result = await login(email, password);
            // Persist / clear the remembered email as instructed by the toggle.
            try {
                if (rememberMe) localStorage.setItem("wayly:remembered-email", email);
                else localStorage.removeItem("wayly:remembered-email");
            } catch { /* ignore quota / private-mode failures */ }
            if (result?.requires_mfa) {
                setMfaToken(result.temp_token);
                toast.success("Enter the 6-digit code from your authenticator app.");
                return;
            }
            toast.success(`Welcome back, ${result.name}`);
            routeAfterLogin(result);
        } catch (err) {
            // Special handling for the "email verification required" 403, render
            // an inline block with a working "Resend verification email" button
            // instead of a toast that dies after 4 seconds.
            const detail = err?.response?.data?.detail;
            if (detail && typeof detail === "object" && detail.code === "email_verification_required") {
                setVerificationRequired({
                    email: detail.email || email,
                    message: detail.message || "Your email hasn't been verified yet.",
                });
            } else {
                const m = loginErrorMessage(err);
                if (m) toast.error(m, { duration: 7000 });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const resendVerification = async () => {
        if (!verificationRequired?.email) return;
        setResending(true);
        try {
            await api.post("/auth/resend-verification-email", { email: verificationRequired.email });
            setResentAt(new Date().toISOString());
            toast.success("Verification email sent. Check your inbox.");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not resend verification email."));
        } finally {
            setResending(false);
        }
    };

    const onVerifiedRetryLogin = async () => {
        // Code accepted, the account is now verified, complete sign-in with the
        // password still held in state.
        setVerificationRequired(null);
        setSubmitting(true);
        try {
            const result = await login(email, password);
            if (result?.requires_mfa) {
                setMfaToken(result.temp_token);
                return;
            }
            toast.success(`Welcome back, ${result.name}`);
            routeAfterLogin(result);
        } catch (err) {
            const m = loginErrorMessage(err);
            if (m) toast.error(m, { duration: 7000 });
        } finally {
            setSubmitting(false);
        }
    };

    const submitMfa = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const u = await verifyMfa(mfaToken, mfaCode.trim());
            toast.success(`Welcome back, ${u.name}`);
            routeAfterLogin(u);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Invalid code"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-kindred auth-shell wayly-aurora relative overflow-hidden flex items-center justify-center px-6">
            <SeoHead {...SEO.login} noindex />
            {submitting && (
                <div className="fixed inset-0 z-[60] wayly-aurora flex items-center justify-center wayly-fade-in" data-testid="login-signing-overlay">
                    <WaylyLoader size={110} label="Signing you in…" testId="login-loader" />
                </div>
            )}
            {/* Soft, slow-drifting orbs — calm ambient depth behind the card. */}
            <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full bg-[var(--wayly-teal-600)]/10 blur-3xl wayly-breathe" />
            <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-[var(--wayly-sage-400)]/10 blur-3xl wayly-float-slow" />
            <div className="w-full max-w-md relative wayly-fade-up">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <WaylyLogo size={32} className="rounded-md" />
                    <span className="font-heading text-lg text-primary-k">Wayly</span>
                </Link>
                <div className="bg-surface border border-kindred rounded-2xl p-8 auth-card wayly-fade-up wayly-stagger-2">
                    {!mfaToken ? (
                        <>
                            <span className="overline">Sign in</span>
                            <h1 className="font-heading text-3xl text-primary-k mt-2 tracking-tight">Welcome back</h1>

                            <div className="mt-6 auth-google">
                                <GoogleSignInButton testid="login-google" />
                            </div>

                            <div className="mt-5 mb-5 flex items-center gap-3 text-xs text-muted-k">
                                <span className="flex-1 h-px bg-kindred"></span>
                                <span>or with email</span>
                                <span className="flex-1 h-px bg-kindred"></span>
                            </div>

                            {verificationRequired && (
                                <div
                                    className="mb-4 rounded-xl border border-terracotta/40 bg-terracotta/5 p-4"
                                    role="alert"
                                    data-testid="login-verification-required"
                                >
                                    <div className="flex items-start gap-3">
                                        <MailWarning className="h-5 w-5 text-terracotta shrink-0 mt-0.5" aria-hidden="true" />
                                        <div className="flex-1 text-sm text-primary-k">
                                            <p className="font-semibold text-terracotta">Verify your email to sign in</p>
                                            <p className="mt-1 text-primary-k/85 leading-relaxed">
                                                {verificationRequired.message} Enter the 6-digit code we sent to{" "}
                                                <span className="font-semibold">{verificationRequired.email}</span>.
                                            </p>
                                            <div className="mt-3">
                                                <EmailCodeVerify
                                                    email={verificationRequired.email}
                                                    authed={false}
                                                    onVerified={onVerifiedRetryLogin}
                                                />
                                            </div>
                                            <p className="mt-3 text-xs text-muted-k">
                                                Wrong address?{" "}
                                                <button
                                                    type="button"
                                                    onClick={() => setVerificationRequired(null)}
                                                    className="underline hover:no-underline"
                                                    data-testid="login-verification-dismiss"
                                                >
                                                    Try a different email
                                                </button>
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <form onSubmit={submit} className="space-y-4">
                                <label className="block">
                                    <span className="text-sm text-muted-k">Email</span>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        data-testid="login-email-input"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm text-muted-k">Password</span>
                                    <div className="relative mt-1">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            data-testid="login-password-input"
                                            className="w-full rounded-md border border-kindred bg-surface px-3 py-2.5 pr-11 text-base focus:outline-none focus:ring-2 ring-primary-k"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((s) => !s)}
                                            data-testid="login-password-toggle"
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                            aria-pressed={showPassword}
                                            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-k hover:text-primary-k focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k rounded-r-md"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    <Link to="/forgot" data-testid="login-forgot-link" className="mt-1 inline-block text-xs text-primary-k hover:underline">
                                        Forgot password?
                                    </Link>
                                </label>
                                <label className="flex items-center gap-2 select-none cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        data-testid="login-remember-me"
                                        className="h-4 w-4 rounded border-kindred text-primary-k focus:ring-primary-k"
                                    />
                                    <span className="text-sm text-muted-k">Remember my email on this device</span>
                                </label>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    data-testid="login-submit-button"
                                    className="w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-primary-k/90 transition-colors disabled:opacity-60"
                                >
                                    {submitting ? "Signing in…" : "Sign in"}
                                </button>
                            </form>
                            <p className="mt-6 text-sm text-muted-k">
                                No account?{" "}
                                <Link to="/signup" data-testid="signup-link" className="text-primary-k underline">
                                    Create one
                                </Link>
                            </p>
                        </>
                    ) : (
                        <>
                            <span className="overline">Two-factor authentication</span>
                            <h1 className="font-heading text-3xl text-primary-k mt-2 tracking-tight">Enter your code</h1>
                            <p className="text-sm text-muted-k mt-2">Open your authenticator app (Google Authenticator, 1Password, Authy) and enter the 6-digit code. You can also paste an 8-character backup code.</p>
                            <form onSubmit={submitMfa} className="space-y-4 mt-6">
                                <label className="block">
                                    <span className="text-sm text-muted-k">Code</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        value={mfaCode}
                                        onChange={(e) => setMfaCode(e.target.value)}
                                        required
                                        autoFocus
                                        data-testid="login-mfa-code-input"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 text-lg tracking-widest font-mono focus:outline-none focus:ring-2 ring-primary-k"
                                        placeholder="123456"
                                    />
                                </label>
                                <button
                                    type="submit"
                                    disabled={submitting || mfaCode.length < 6}
                                    data-testid="login-mfa-submit-button"
                                    className="w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-primary-k/90 transition-colors disabled:opacity-60"
                                >
                                    {submitting ? "Verifying…" : "Verify and sign in"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setMfaToken(null); setMfaCode(""); }}
                                    data-testid="login-mfa-cancel-button"
                                    className="w-full text-sm text-muted-k hover:text-primary-k transition-colors"
                                >
                                    Use a different account
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
