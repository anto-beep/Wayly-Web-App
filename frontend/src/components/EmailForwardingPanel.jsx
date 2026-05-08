import React, { useEffect, useState } from "react";
import { Mail, Copy, Check, Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

/**
 * EmailForwardingPanel
 * Shows the user's unique forwarding address + setup instructions for the
 * "Forward by email" tab on the Statement Decoder. For unauthenticated users
 * it explains the feature and invites sign-up.
 */
export default function EmailForwardingPanel({ onSwitchToFile }) {
    const { user } = useAuth();
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        setLoading(true);
        api.get("/inbound/my-address")
            .then(({ data }) => { if (!cancelled) setInfo(data); })
            .catch((err) => { if (!cancelled) setError(err?.response?.data?.detail || "Could not load your forwarding address."); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [user]);

    const copy = async () => {
        if (!info?.address) return;
        try {
            await navigator.clipboard.writeText(info.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // Fallback for older browsers
            const ta = document.createElement("textarea");
            ta.value = info.address; document.body.appendChild(ta); ta.select();
            try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
            ta.remove();
        }
    };

    if (!user) {
        return (
            <div className="mt-4 rounded-xl border-2 border-dashed border-kindred bg-surface-2 p-8" data-testid="decoder-email-tab-anon">
                <Mail className="h-10 w-10 text-muted-k mx-auto" />
                <div className="font-heading text-xl text-primary-k mt-3 text-center">Forward statements straight to Kindred</div>
                <p className="text-sm text-muted-k mt-2 max-w-md mx-auto text-center">
                    Sign in to get your unique forwarding address. Set up an auto-forward rule once, and every monthly
                    statement arrives in your dashboard automatically — no uploads, no copying.
                </p>
                <div className="flex gap-2 justify-center mt-4">
                    <a href="/signup" className="inline-flex items-center gap-1 bg-primary-k text-white text-sm px-4 py-2 rounded-md hover:bg-[#16294a]" data-testid="email-tab-signup">
                        Start free trial <ArrowRight className="h-3.5 w-3.5" />
                    </a>
                    {onSwitchToFile && (
                        <button type="button" onClick={onSwitchToFile} className="text-sm text-primary-k underline px-2 py-2">
                            Or upload a file now
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="mt-4 rounded-xl border border-kindred/40 bg-surface-2 p-8 text-center" data-testid="decoder-email-tab-loading">
                <Loader2 className="h-6 w-6 animate-spin text-muted-k mx-auto" />
                <p className="text-sm text-muted-k mt-2">Loading your forwarding address…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mt-4 rounded-xl border border-terracotta/50 bg-terracotta/10 p-5 text-sm text-terracotta" data-testid="decoder-email-tab-error">
                <div className="inline-flex items-center gap-2 font-medium"><AlertCircle className="h-4 w-4" /> Couldn't load forwarding address</div>
                <p className="mt-1">{typeof error === "string" ? error : "Please refresh and try again."}</p>
            </div>
        );
    }

    return (
        <div className="mt-4 space-y-4" data-testid="decoder-email-tab">
            {/* Address card */}
            <div className="rounded-xl border border-kindred/40 bg-surface-2 p-5">
                <div className="flex items-center gap-2 text-sm text-muted-k">
                    <Mail className="h-4 w-4" /> Your private forwarding address
                </div>
                <div className="mt-2 flex items-stretch gap-2">
                    <code
                        className="flex-1 bg-surface border border-kindred/60 rounded-md px-3 py-2 text-sm text-primary-k font-mono break-all"
                        data-testid="email-forwarding-address"
                    >
                        {info?.address}
                    </code>
                    <button
                        type="button"
                        onClick={copy}
                        data-testid="email-forwarding-copy"
                        className="inline-flex items-center gap-1.5 px-3 text-sm rounded-md bg-primary-k text-white hover:bg-[#16294a]"
                    >
                        {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
                    </button>
                </div>
                <p className="text-xs text-muted-k mt-2">
                    Don't share this address publicly. Only your statement provider should email it.
                </p>
            </div>

            {/* How-to */}
            <div className="rounded-xl border border-kindred/40 bg-surface p-5">
                <div className="font-heading text-base text-primary-k">How it works</div>
                <ol className="mt-3 space-y-3 text-sm text-primary-k">
                    <li className="flex gap-3">
                        <span className="flex-none w-6 h-6 rounded-full bg-primary-k text-white text-xs font-medium inline-flex items-center justify-center">1</span>
                        <div>
                            <div className="font-medium">Forward your latest statement email</div>
                            <p className="text-muted-k text-xs mt-0.5">From any inbox, forward the statement (with the original PDF/Word attachment) to the address above. We'll decode it within ~30 seconds.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-none w-6 h-6 rounded-full bg-primary-k text-white text-xs font-medium inline-flex items-center justify-center">2</span>
                        <div>
                            <div className="font-medium">Set an auto-forward rule (optional)</div>
                            <p className="text-muted-k text-xs mt-0.5">In Gmail: <em>Settings → Forwarding and POP/IMAP → Add a forwarding address</em> + create a filter that matches your provider's "from" address. Outlook: <em>Settings → Mail → Rules → Add new rule</em>.</p>
                        </div>
                    </li>
                    <li className="flex gap-3">
                        <span className="flex-none w-6 h-6 rounded-full bg-primary-k text-white text-xs font-medium inline-flex items-center justify-center">3</span>
                        <div>
                            <div className="font-medium">Get a confirmation email</div>
                            <p className="text-muted-k text-xs mt-0.5">We'll reply to confirm receipt and link straight to the decoded statement on your dashboard.</p>
                        </div>
                    </li>
                </ol>
            </div>

            {/* Recent inbound */}
            {info?.recent_inbound && info.recent_inbound.length > 0 && (
                <div className="rounded-xl border border-kindred/40 bg-surface p-5" data-testid="email-forwarding-recent">
                    <div className="font-heading text-base text-primary-k">Recently forwarded</div>
                    <ul className="mt-2 divide-y divide-kindred/30">
                        {info.recent_inbound.map((s) => (
                            <li key={s.id} className="py-2 flex items-center justify-between text-sm">
                                <div>
                                    <div className="text-primary-k">{s.filename || s.period_label || "Statement"}</div>
                                    <div className="text-xs text-muted-k">
                                        {s.received_from && <span>from {s.received_from} · </span>}
                                        {new Date(s.uploaded_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                                    </div>
                                </div>
                                <a href={`/app/statements/${s.id}`} className="text-xs text-primary-k underline">View</a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <p className="text-xs text-muted-k text-center">
                Decoding via email is in <strong>preview</strong>. While our inbound mail server is being finalised
                during launch week, please drop us a note if you'd like early access turned on for your address.
            </p>
        </div>
    );
}
