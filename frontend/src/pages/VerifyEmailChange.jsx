import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import WaylyLogo from "@/components/WaylyLogo";

const MESSAGES = {
    success: {
        icon: CheckCircle2,
        tone: "sage",
        title: "Email updated.",
        body: "Your Wayly account is now signed in as the new email address. You can close this tab and go back to the app.",
    },
    expired: {
        icon: AlertTriangle,
        tone: "warn",
        title: "This link has expired.",
        body: "The confirmation link is good for 24 hours. Head back to Settings → Profile → Change email and start a new request.",
    },
    invalid: {
        icon: XCircle,
        tone: "danger",
        title: "This link is not valid.",
        body: "It may have already been used, or been replaced by a newer request. Try again from Settings → Profile → Change email.",
    },
    email_taken: {
        icon: XCircle,
        tone: "danger",
        title: "That email is already in use.",
        body: "Someone else registered with that email while you were confirming. Try again with a different address.",
    },
    default: {
        icon: AlertTriangle,
        tone: "warn",
        title: "We couldn't confirm the change.",
        body: "The confirmation link was not recognised. Please try again from Settings → Profile → Change email.",
    },
};

const TONES = {
    sage: { bg: "bg-sage/10", border: "border-sage/40", fg: "text-sage" },
    warn: { bg: "bg-gold/10", border: "border-gold/40", fg: "text-gold" },
    danger: { bg: "bg-terracotta/10", border: "border-terracotta/40", fg: "text-terracotta" },
};

export default function VerifyEmailChange() {
    const [params] = useSearchParams();
    const status = (params.get("status") || "").toLowerCase();
    const cfg = MESSAGES[status] || MESSAGES.default;
    const Icon = cfg.icon;
    const tone = TONES[cfg.tone] || TONES.warn;

    return (
        <div className="min-h-screen bg-kindred flex flex-col" data-testid="verify-email-change-page">
            <header className="border-b border-kindred bg-white/80 backdrop-blur-xl">
                <div className="mx-auto max-w-3xl px-6 py-4 flex items-center gap-2">
                    <WaylyLogo size={32} className="rounded-md" />
                    <span className="font-heading text-lg text-primary-k">Wayly</span>
                </div>
            </header>
            <main className="mx-auto max-w-lg w-full px-6 py-16 flex-1">
                <div className={`rounded-2xl border ${tone.border} ${tone.bg} p-8 text-center`}>
                    <Icon className={`h-10 w-10 mx-auto ${tone.fg}`} aria-hidden="true" />
                    <h1 className="font-heading text-2xl sm:text-3xl text-primary-k mt-4" data-testid="verify-email-change-title">
                        {cfg.title}
                    </h1>
                    <p className="mt-3 text-sm text-primary-k/85 leading-relaxed" data-testid="verify-email-change-body">
                        {cfg.body}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3 justify-center">
                        <Link
                            to="/app"
                            className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-[#091D33]"
                            data-testid="verify-email-change-cta-app"
                        >
                            Go to Wayly
                        </Link>
                        <Link
                            to="/settings/profile"
                            className="inline-flex items-center gap-2 border border-primary-k text-primary-k rounded-full px-5 py-2.5 text-sm hover:bg-primary-k hover:text-white"
                            data-testid="verify-email-change-cta-settings"
                        >
                            Back to Settings
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
