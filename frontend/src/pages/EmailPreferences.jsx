import React, { useEffect, useState } from "react";
import { useSearchParams, useLocation, Link } from "react-router-dom";
import { Loader2, Mail, CheckCircle2, AlertTriangle } from "lucide-react";

// Public, token-based email preference + unsubscribe page. No login required:
// the signed token in the URL identifies the account. Reached from the footer
// link in marketing emails (/email/preferences) and the List-Unsubscribe link
// (/email/unsubscribe). The backend GET is scanner-safe (never mutates).

const BACKEND = process.env.REACT_APP_BACKEND_URL;

export default function EmailPreferences() {
    const [params] = useSearchParams();
    const location = useLocation();
    const token = params.get("token") || "";
    const isUnsub = location.pathname.includes("unsubscribe");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [emailMasked, setEmailMasked] = useState("");
    const [optedIn, setOptedIn] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            if (!token) { setError("This link is missing its token."); setLoading(false); return; }
            try {
                const res = await fetch(`${BACKEND}/api/email/preferences?token=${encodeURIComponent(token)}`);
                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "This link is invalid or has expired.");
                const data = await res.json();
                if (!alive) return;
                setEmailMasked(data.email_masked || "");
                setOptedIn(!!data.marketing_opted_in);
            } catch (e) {
                if (alive) setError(e.message || "This link is invalid or has expired.");
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [token]);

    const save = async (nextOptedIn) => {
        setSaving(true);
        setError("");
        try {
            const res = await fetch(`${BACKEND}/api/email/preferences`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, marketing_opted_in: nextOptedIn }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Could not save your preference.");
            setOptedIn(nextOptedIn);
            setDone(true);
        } catch (e) {
            setError(e.message || "Could not save your preference.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-kindred flex items-center justify-center px-6 py-16">
            <div className="w-full max-w-lg bg-surface border border-kindred rounded-2xl p-8" data-testid="email-prefs-card">
                <div className="flex items-center gap-2 text-primary-k">
                    <Mail className="h-5 w-5" />
                    <span className="font-heading text-xl tracking-tight">Wayly email preferences</span>
                </div>

                {loading ? (
                    <div className="mt-8 flex items-center gap-2 text-muted-k" data-testid="email-prefs-loading">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                ) : error ? (
                    <div className="mt-6 flex items-start gap-2 rounded-xl border border-[#e8c6b0] bg-[#fbf2eb] p-4 text-sm text-terracotta" data-testid="email-prefs-error">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-none" /><span>{error}</span>
                    </div>
                ) : (
                    <>
                        <p className="mt-4 text-sm text-muted-k leading-relaxed">
                            Managing marketing emails for <strong className="text-primary-k" data-testid="email-prefs-email">{emailMasked}</strong>.
                            This does not affect account, security or billing emails.
                        </p>

                        {done && (
                            <div className="mt-5 flex items-center gap-2 rounded-xl border border-sage/40 bg-sage/10 p-3 text-sm text-primary-k" data-testid="email-prefs-saved">
                                <CheckCircle2 className="h-4 w-4 text-sage" />
                                {optedIn ? "You're subscribed to Wayly updates." : "You've been unsubscribed from marketing emails."}
                            </div>
                        )}

                        <div className="mt-6 flex items-center justify-between rounded-xl border border-kindred bg-surface-2 p-4">
                            <div className="pr-4">
                                <div className="text-sm font-semibold text-primary-k">Helpful guides, product updates &amp; news</div>
                                <div className="text-xs text-muted-k mt-0.5">Occasional marketing emails from Wayly. Unsubscribe any time.</div>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={optedIn}
                                disabled={saving}
                                onClick={() => save(!optedIn)}
                                data-testid="email-prefs-toggle"
                                className={`relative inline-flex h-7 w-12 flex-none items-center rounded-full transition-colors ${optedIn ? "bg-primary-k" : "bg-kindred"} disabled:opacity-60`}
                            >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${optedIn ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
                        </div>

                        {(isUnsub && optedIn) && (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => save(false)}
                                data-testid="email-prefs-unsubscribe"
                                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#A5512B] text-white py-3 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                            >
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Unsubscribe from marketing emails
                            </button>
                        )}

                        <p className="mt-6 text-xs text-muted-k">
                            <Link to="/" className="text-primary-k underline">Back to Wayly</Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
