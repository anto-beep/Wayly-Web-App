import React, { useState } from "react";
import { Send, Loader2, X, Plus, Mail, Check } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";

/**
 * ShareDashboardButton
 * Single button + modal that emails the current quarter dashboard to all
 * household members (and optional extra recipients) using the new
 * /api/dashboard/share endpoint.
 */
export default function ShareDashboardButton({ className = "" }) {
    const [open, setOpen] = useState(false);
    const [extras, setExtras] = useState([""]);
    const [note, setNote] = useState("");
    const [sending, setSending] = useState(false);

    const updateRow = (i, v) => setExtras((arr) => arr.map((x, idx) => (idx === i ? v : x)));
    const addRow = () => setExtras((arr) => arr.length < 10 ? [...arr, ""] : arr);
    const removeRow = (i) => setExtras((arr) => arr.filter((_, idx) => idx !== i));

    const submit = async () => {
        const valid = extras.map((s) => s.trim()).filter((s) => s.includes("@"));
        setSending(true);
        try {
            const { data } = await api.post("/dashboard/share", {
                extra_emails: valid,
                note: note.trim() || undefined,
            });
            const count = data?.count || 0;
            const failures = (data?.failures || []).length;
            if (count > 0) {
                toast.success(failures
                    ? `Sent to ${count} — ${failures} failed`
                    : `Dashboard shared with ${count} recipient${count === 1 ? "" : "s"}`);
            } else {
                toast.error("Couldn't send to any recipients. Check that you've invited family members or added an email.");
            }
            setOpen(false);
            setExtras([""]);
            setNote("");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not share dashboard"));
        } finally {
            setSending(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-testid="share-dashboard-button"
                className={`inline-flex items-center gap-1.5 rounded-md border border-kindred bg-surface px-3 py-1.5 text-sm text-primary-k hover:bg-surface-2 transition-colors ${className}`}
            >
                <Send className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Share with family</span>
                <span className="sm:hidden">Share</span>
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="share-dashboard-title"
                    data-testid="share-dashboard-modal"
                    className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
                    onClick={() => !sending && setOpen(false)}
                >
                    <div
                        className="relative w-full max-w-lg bg-surface border border-kindred rounded-2xl shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="bg-primary-k text-white px-5 py-4 flex items-start justify-between gap-3">
                            <div>
                                <div className="inline-flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-gold" />
                                    <h2 id="share-dashboard-title" className="font-heading text-lg">Share dashboard with family</h2>
                                </div>
                                <p className="text-xs text-white/70 mt-1">A clean snapshot of this quarter's budget + top anomalies — emailed to your family.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => !sending && setOpen(false)}
                                aria-label="Close"
                                className="rounded-md p-1 hover:bg-white/10"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="rounded-lg bg-surface-2 border border-kindred/40 p-3 text-sm text-primary-k">
                                <div className="flex items-center gap-1.5 text-xs text-muted-k">
                                    <Check className="h-3.5 w-3.5 text-sage" />
                                    <span>All active family members and pending invites are included automatically.</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs uppercase tracking-wider text-muted-k">Add other recipients (optional)</label>
                                <div className="mt-2 space-y-2">
                                    {extras.map((em, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <input
                                                type="email"
                                                value={em}
                                                onChange={(e) => updateRow(i, e.target.value)}
                                                placeholder="aunt.elizabeth@example.com"
                                                data-testid={`share-extra-${i}`}
                                                className="flex-1 rounded-md border border-kindred px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                            />
                                            {extras.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeRow(i)}
                                                    aria-label="Remove"
                                                    className="h-9 w-9 inline-flex items-center justify-center text-muted-k hover:text-terracotta"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    {extras.length < 10 && (
                                        <button
                                            type="button"
                                            onClick={addRow}
                                            data-testid="share-extra-add"
                                            className="text-xs text-primary-k underline inline-flex items-center gap-1"
                                        >
                                            <Plus className="h-3 w-3" /> Add another
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs uppercase tracking-wider text-muted-k">Personal note (optional)</label>
                                <textarea
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    rows={3}
                                    maxLength={600}
                                    data-testid="share-note"
                                    placeholder="e.g. Hi all — sharing this month's snapshot. Big picture: we're tracking nicely, but there's a duplicate flag worth a chat."
                                    className="mt-2 w-full rounded-md border border-kindred px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k resize-none"
                                />
                                <div className="text-[10px] text-muted-k text-right mt-1">{note.length}/600</div>
                            </div>
                        </div>
                        <div className="border-t border-kindred bg-surface-2 px-5 py-3 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => !sending && setOpen(false)}
                                className="text-sm text-muted-k hover:text-primary-k px-3 py-2"
                                disabled={sending}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={submit}
                                disabled={sending}
                                data-testid="share-submit"
                                className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#16294a] inline-flex items-center gap-2 disabled:opacity-60"
                            >
                                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                {sending ? "Sending…" : "Send snapshot"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
