import React, { useState } from "react";
import { api } from "@/lib/api";
import { Mail, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

/**
 * EmailResultButton — small inline form that lets a public-tool user have
 * their result emailed to themselves (PDF-style HTML body via Resend).
 *
 * Props:
 *   tool      string (e.g. "Statement Decoder")
 *   headline  string (subject-line one-liner)
 *   bodyHtml  string (already-formatted HTML — caller serialises the result)
 */
export default function EmailResultButton({ tool, headline, bodyHtml }) {
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await api.post("/public/email-result", {
                email,
                tool,
                headline,
                body_html: bodyHtml,
            });
            setDone(true);
            toast.success("Sent. Check your inbox in a minute.");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not send. Try again.");
        } finally {
            setBusy(false);
        }
    };

    if (done) {
        return (
            <div className="bg-sage/10 border border-sage rounded-xl p-4 flex items-center gap-3 text-sm" data-testid="email-result-done">
                <Check className="h-4 w-4 text-sage" />
                <span className="text-primary-k">Sent to <span className="font-medium">{email}</span>.</span>
            </div>
        );
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-testid="email-result-open"
                className="inline-flex items-center gap-2 text-sm text-primary-k border border-kindred bg-surface rounded-full px-5 py-2.5 hover:bg-surface-2 transition-colors"
            >
                <Mail className="h-4 w-4" /> Email this to me
            </button>
        );
    }

    return (
        <form onSubmit={submit} className="bg-surface border border-kindred rounded-xl p-4 flex items-center gap-2 flex-wrap" data-testid="email-result-form">
            <Mail className="h-4 w-4 text-primary-k" />
            <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                data-testid="email-result-input"
                className="flex-1 min-w-[200px] rounded-md border border-kindred px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
            />
            <button
                type="submit"
                disabled={busy || !email}
                data-testid="email-result-submit"
                className="bg-primary-k text-white rounded-full px-5 py-2 text-sm hover:bg-[#16294a] disabled:opacity-60 inline-flex items-center gap-2"
            >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                Send
            </button>
            <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-muted-k underline"
            >
                Cancel
            </button>
        </form>
    );
}
