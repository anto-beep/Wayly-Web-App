import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/api";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import WaylyLogo from "@/components/WaylyLogo";

import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
export default function Login() {
    const { login, verifyMfa } = useAuth();
    const nav = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    // 2FA challenge state — populated when /auth/login returns requires_mfa.
    const [mfaToken, setMfaToken] = useState(null);
    const [mfaCode, setMfaCode] = useState("");

    const routeAfterLogin = (u) => {
        if (u.plan === "adviser") nav("/adviser");
        else nav(u.role === "participant" ? "/participant" : "/app");
    };

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const result = await login(email, password);
            if (result?.requires_mfa) {
                setMfaToken(result.temp_token);
                toast.success("Enter the 6-digit code from your authenticator app.");
                return;
            }
            toast.success(`Welcome back, ${result.name}`);
            routeAfterLogin(result);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not sign in"));
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
        <div className="min-h-screen bg-kindred flex items-center justify-center px-6">
            <SeoHead {...SEO.login} noindex />
            <div className="w-full max-w-md">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <WaylyLogo size={32} className="rounded-md" />
                    <span className="font-heading text-lg text-primary-k">Wayly</span>
                </Link>
                <div className="bg-surface border border-kindred rounded-2xl p-8">
                    {!mfaToken ? (
                        <>
                            <span className="overline">Sign in</span>
                            <h1 className="font-heading text-3xl text-primary-k mt-2 tracking-tight">Welcome back</h1>

                            <div className="mt-6">
                                <GoogleSignInButton testid="login-google" />
                            </div>

                            <div className="mt-5 mb-5 flex items-center gap-3 text-xs text-muted-k">
                                <span className="flex-1 h-px bg-kindred"></span>
                                <span>or with email</span>
                                <span className="flex-1 h-px bg-kindred"></span>
                            </div>

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
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        data-testid="login-password-input"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                    <Link to="/forgot" data-testid="login-forgot-link" className="mt-1 inline-block text-xs text-primary-k hover:underline">
                                        Forgot password?
                                    </Link>
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
