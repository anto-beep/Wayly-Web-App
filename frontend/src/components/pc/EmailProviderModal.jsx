import React, { useEffect, useState } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { track } from "@/lib/analytics";
import { Loader2, Mail, Copy, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * WS8, Email the provider modal.
 *
 * On open, POSTs /api/ppc/email-draft with the current result context.
 * Shows subject + body in editable textareas. Copy-to-clipboard action +
 * mailto: launcher.
 */
export default function EmailProviderModal({ open, onOpenChange, result, provider }) {
    const [draft, setDraft] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [includeIncrease, setIncludeIncrease] = useState(false);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!open || !result) return;
        setLoading(true);
        setError(null);
        api.post("/ppc/email-draft", {
            service: result.service,
            rate: result.charged,
            unit: result.unit,
            provider: provider || null,
            lower: result.lower,
            upper: result.upper,
            source_date: result.source_date,
            include_increase_paragraph: includeIncrease,
        }).then((r) => {
            setDraft(r.data);
            setSubject(r.data?.subject || "");
            setBody(r.data?.body || "");
            try { track.ppc.emailDrafted({ service: result.service, include_increase: includeIncrease }); } catch (_) { /* noop */ }
        }).catch((err) => {
            setError(extractErrorMessage(err, "Could not draft email."));
        }).finally(() => setLoading(false));
    }, [open, result, provider, includeIncrease]);

    const copyBoth = async () => {
        try {
            await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (_) { /* noop */ }
    };

    const openInMail = () => {
        const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent data-testid="pc-email-modal" className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Email the provider</DialogTitle>
                </DialogHeader>
                {loading && (
                    <div className="flex items-center gap-2 text-sm text-muted-k py-6">
                        <Loader2 className="h-4 w-4 animate-spin" /> Drafting…
                    </div>
                )}
                {error && <div className="text-sm text-terracotta">{error}</div>}
                {draft && !loading && (
                    <div className="space-y-3">
                        {(draft.increase_count || 0) > 2 ? (
                            <label className="flex items-center gap-2 text-sm text-primary-k">
                                <input
                                    type="checkbox"
                                    checked={includeIncrease}
                                    onChange={(e) => setIncludeIncrease(e.target.checked)}
                                    className="h-4 w-4 rounded border-kindred"
                                    data-testid="pc-email-include-increase"
                                />
                                <span>
                                    Add the ACQSC / rate-increase paragraph
                                    <span className="ml-1 text-xs text-muted-k tabular-nums">
                                        ({draft.increase_count} increases in 12 months)
                                    </span>
                                </span>
                            </label>
                        ) : (
                            <div
                                className="text-xs text-muted-k italic bg-surface-2 border border-kindred rounded-md px-3 py-2"
                                data-testid="pc-email-include-increase-hidden"
                            >
                                {"Once you've saved three or more rate increases for this provider in 12 months, an optional ACQSC / rate-increase paragraph will appear here."}
                            </div>
                        )}
                        <label className="block">
                            <span className="text-xs uppercase tracking-wider text-muted-k">Subject</span>
                            <input
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2 text-sm"
                                data-testid="pc-email-subject"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs uppercase tracking-wider text-muted-k">Body</span>
                            <textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                rows={14}
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2 text-sm font-body leading-relaxed"
                                data-testid="pc-email-body"
                            />
                        </label>
                        {draft.disclaimer && (
                            <p className="text-xs text-muted-k italic leading-snug">{draft.disclaimer}</p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-2">
                            <button
                                type="button"
                                onClick={copyBoth}
                                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-primary-k text-primary-k text-sm hover:bg-primary-k hover:text-white"
                                data-testid="pc-email-copy"
                            >
                                <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy to clipboard"}
                            </button>
                            <button
                                type="button"
                                onClick={openInMail}
                                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-primary-k text-white text-sm hover:bg-[#091D33]"
                                data-testid="pc-email-launch"
                            >
                                <Mail className="h-4 w-4" /> Open in mail app <ExternalLink className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
