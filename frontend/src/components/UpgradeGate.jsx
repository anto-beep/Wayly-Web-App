import React from "react";
import { Link } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";

/**
 * UpgradeGate — soft paywall card shown above Solo+ tools when the visitor
 * isn't signed in. Public‑safe (no auth required to render).
 */
export default function UpgradeGate({ toolName }) {
    return (
        <div
            className="rounded-2xl border border-gold bg-gradient-to-br from-surface to-surface-2 p-6 sm:p-7 mb-6 flex flex-col sm:flex-row gap-5 sm:items-center"
            data-testid="upgrade-gate"
        >
            <div className="h-12 w-12 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                <Lock className="h-5 w-5 text-primary-k" />
            </div>
            <div className="flex-1">
                <div className="overline">Solo plan or above</div>
                <h3 className="font-heading text-xl text-primary-k mt-1">
                    {toolName} is part of the paid plan.
                </h3>
                <p className="mt-2 text-sm text-muted-k leading-relaxed">
                    Start a 14‑day free trial — no card needed. Or sign in if you already have a Kindred account.
                </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                <Link
                    to="/signup"
                    data-testid="upgrade-gate-trial"
                    className="inline-flex items-center justify-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-[#16294a]"
                >
                    Start free trial <ArrowRight className="h-3.5 w-3.5" />
                </Link>
                <Link
                    to="/login"
                    data-testid="upgrade-gate-signin"
                    className="inline-flex items-center justify-center gap-2 border border-kindred rounded-full px-5 py-2.5 text-sm text-primary-k hover:bg-surface-2"
                >
                    Sign in
                </Link>
            </div>
        </div>
    );
}
