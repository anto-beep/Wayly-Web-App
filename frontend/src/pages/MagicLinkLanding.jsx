import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import WaylyLogo from "@/components/WaylyLogo";
import WaylyLoader from "@/components/WaylyLoader";
import { CheckCircle2, MailWarning, ShieldCheck } from "lucide-react";
import SeoHead from "@/seo/SeoHead";

/**
 * CONV-1 F4, magic-link landing. Reads ?token=…, exchanges it for a session
 * via AuthContext.completeMagicLink, then routes into the app. Handles the
 * expired/invalid token and the 2FA-required edge case gracefully.
 */
export default function MagicLinkLanding() {
    const { completeMagicLink } = useAuth();
    const [params] = useSearchParams();
    const nav = useNavigate();
    const token = params.get("token") || "";
    const [state, setState] = useState("verifying"); // verifying | success | error | mfa
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return;
        ran.current = true;
        (async () => {
            if (!token) {
                setState("error");
                return;
            }
            try {
                const result = await completeMagicLink(token);
                if (result?.requires_mfa) {
                    setState("mfa");
                    return;
                }
                setState("success");
                setTimeout(() => nav("/app", { replace: true }), 700);
            } catch (_) {
                setState("error");
            }
        })();
    }, [token, completeMagicLink, nav]);

    return (
        <div className="min-h-screen bg-kindred auth-shell flex items-center justify-center px-6 py-10">
            <SeoHead title="Signing you in | Wayly" noindex />
            <div className="w-full max-w-md">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <WaylyLogo size={32} className="rounded-md" />
                    <span className="font-heading text-lg text-primary-k">Wayly</span>
                </Link>
                <div className="bg-surface border border-kindred rounded-2xl p-8 auth-card" data-testid="magic-link-landing">
                    {state === "verifying" && (
                        <div className="flex flex-col items-center text-center" data-testid="magic-link-verifying">
                            <WaylyLoader size={90} label="Signing you in…" testId="magic-link-loader" />
                        </div>
                    )}

                    {state === "success" && (
                        <div className="flex flex-col items-center text-center" data-testid="magic-link-success">
                            <div className="h-12 w-12 rounded-2xl bg-sage/15 flex items-center justify-center mb-4">
                                <CheckCircle2 className="h-6 w-6 text-sage" />
                            </div>
                            <h1 className="font-heading text-2xl text-primary-k tracking-tight">You&apos;re in</h1>
                            <p className="mt-2 text-sm text-muted-k">Taking you to your dashboard…</p>
                        </div>
                    )}

                    {state === "mfa" && (
                        <div className="flex flex-col items-center text-center" data-testid="magic-link-mfa">
                            <div className="h-12 w-12 rounded-2xl bg-primary-k/10 flex items-center justify-center mb-4">
                                <ShieldCheck className="h-6 w-6 text-primary-k" />
                            </div>
                            <h1 className="font-heading text-2xl text-primary-k tracking-tight">One more step</h1>
                            <p className="mt-2 text-sm text-muted-k leading-relaxed">
                                This account uses two-factor authentication. For your security, please sign in with your
                                password so we can ask for your authenticator code.
                            </p>
                            <Link
                                to="/login"
                                data-testid="magic-link-mfa-login"
                                className="mt-6 w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-[#091D33] transition-colors text-center"
                            >
                                Go to sign in
                            </Link>
                        </div>
                    )}

                    {state === "error" && (
                        <div className="flex flex-col items-center text-center" data-testid="magic-link-error">
                            <div className="h-12 w-12 rounded-2xl bg-terracotta/10 flex items-center justify-center mb-4">
                                <MailWarning className="h-6 w-6 text-terracotta" />
                            </div>
                            <h1 className="font-heading text-2xl text-primary-k tracking-tight">Link expired</h1>
                            <p className="mt-2 text-sm text-muted-k leading-relaxed">
                                This sign-in link is invalid or has already been used. Sign-in links last 15 minutes and
                                work once, request a fresh one and we&apos;ll email it straight away.
                            </p>
                            <Link
                                to="/login"
                                data-testid="magic-link-error-login"
                                className="mt-6 w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-[#091D33] transition-colors text-center"
                            >
                                Back to sign in
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
