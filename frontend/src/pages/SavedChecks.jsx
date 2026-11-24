import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ReceiptText, FileText, ArrowRight, Loader2, Bookmark, Trash2 } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";
import { api } from "@/lib/api";

/**
 * SavedChecks — CONV-1 D: a free member's kept invoice checks + statement
 * decodes, household-independent, reopenable any time.
 */
export default function SavedChecks() {
    const [rows, setRows] = useState(null);
    const [busy, setBusy] = useState(null);

    const load = () => {
        api.get("/me/free-results")
            .then(({ data }) => setRows(data.results || []))
            .catch(() => setRows([]));
    };
    useEffect(load, []);

    const remove = async (id) => {
        setBusy(id);
        try {
            await api.delete(`/me/free-results/${id}`);
            setRows((r) => (r || []).filter((x) => x.id !== id));
        } catch (_) { /* ignore */ } finally { setBusy(null); }
    };

    const reopenHref = (r) =>
        r.type === "invoice"
            ? `/ai-tools/invoice-checker?r=${encodeURIComponent(r.token)}`
            : `/ai-tools/statement-decoder?r=${encodeURIComponent(r.id)}`;

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead title="Your saved checks" description="Your kept invoice checks and statement decodes." path="/app/saved-checks" noindex />
            <MarketingHeader />
            <main id="main-content" className="mx-auto max-w-3xl px-6 pt-10 pb-16">
                <div className="flex items-center gap-2">
                    <Bookmark className="h-5 w-5 text-primary-k" />
                    <h1 className="font-heading text-3xl text-primary-k tracking-tight">Your saved checks</h1>
                </div>
                <p className="mt-2 text-sm text-muted-k leading-relaxed">
                    Every invoice check and statement decode you save on the free plan is kept here. Reopen one any time.
                </p>

                {rows === null && (
                    <div className="mt-10 flex justify-center text-muted-k" data-testid="saved-checks-loading">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                )}

                {rows !== null && rows.length === 0 && (
                    <div className="mt-8 rounded-2xl border border-kindred bg-surface p-8 text-center" data-testid="saved-checks-empty">
                        <p className="text-sm text-muted-k">You haven't saved any checks yet.</p>
                        <div className="mt-4 flex flex-wrap justify-center gap-3">
                            <Link to="/ai-tools/invoice-checker" className="inline-flex items-center gap-1.5 rounded-full bg-primary-k text-white px-5 py-2.5 text-sm font-semibold hover:bg-[#091D33]">
                                <ReceiptText className="h-4 w-4" /> Check an invoice
                            </Link>
                            <Link to="/ai-tools/statement-decoder" className="inline-flex items-center gap-1.5 rounded-full border border-primary-k/30 bg-surface px-5 py-2.5 text-sm font-semibold text-primary-k hover:bg-surface-2">
                                <FileText className="h-4 w-4" /> Decode a statement
                            </Link>
                        </div>
                    </div>
                )}

                {rows !== null && rows.length > 0 && (
                    <ul className="mt-6 space-y-3" data-testid="saved-checks-list">
                        {rows.map((r) => (
                            <li key={r.id} className="rounded-2xl border border-kindred bg-surface p-4 flex items-center gap-4" data-testid={`saved-check-${r.id}`}>
                                <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
                                    {r.type === "invoice" ? <ReceiptText className="h-5 w-5 text-primary-k" /> : <FileText className="h-5 w-5 text-primary-k" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold text-primary-k truncate">{r.title}</div>
                                    {r.subtitle && <div className="text-xs text-muted-k truncate">{r.subtitle}</div>}
                                    <div className="text-[11px] text-muted-k mt-0.5">
                                        {r.type === "invoice" ? "Invoice check" : "Statement decode"}
                                        {r.created_at ? ` · ${new Date(r.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                                    </div>
                                </div>
                                <Link to={reopenHref(r)} data-testid={`saved-check-reopen-${r.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary-k text-white px-4 py-2 text-xs font-semibold hover:bg-[#091D33] shrink-0">
                                    Reopen <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                                <button type="button" onClick={() => remove(r.id)} disabled={busy === r.id} data-testid={`saved-check-remove-${r.id}`} className="text-muted-k hover:text-terracotta shrink-0" aria-label="Remove">
                                    {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </main>
            <Footer />
        </div>
    );
}
