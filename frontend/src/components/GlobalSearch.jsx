import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Loader2, FileText, Receipt, Mail, Calendar, Users, Share2 } from "lucide-react";
import { api } from "@/lib/api";

const TYPE_META = {
    statement: { icon: Receipt, label: "Statement" },
    document: { icon: FileText, label: "Document" },
    family_message: { icon: Users, label: "Family" },
    visit: { icon: Calendar, label: "Visit" },
    correspondence: { icon: Mail, label: "Correspondence" },
    referral: { icon: Share2, label: "Referral" },
};

export default function GlobalSearch() {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef(null);
    const nav = useNavigate();

    // ⌘K / Ctrl-K to open
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen(true);
            }
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    useEffect(() => {
        if (open) setTimeout(() => inputRef.current?.focus(), 60);
    }, [open]);

    useEffect(() => {
        if (!open || !q || q.trim().length < 2) {
            setResults([]);
            return;
        }
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await api.get(`/search?q=${encodeURIComponent(q.trim())}`);
                setResults(data.results || []);
            } catch (_e) {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [q, open]);

    const go = (r) => {
        setOpen(false);
        setQ("");
        nav(r.href);
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-testid="global-search-trigger"
                className="inline-flex items-center gap-2 text-xs text-muted-k bg-surface-2 hover:bg-kindred/60 border border-kindred rounded-full px-3 py-1.5"
            >
                <Search className="h-3.5 w-3.5" /> Search
                <kbd className="hidden sm:inline-block text-[10px] bg-surface border border-kindred rounded px-1.5 py-0.5">⌘K</kbd>
            </button>
            {open && (
                <div className="fixed inset-0 z-50 bg-primary-k/60 backdrop-blur-sm flex items-start justify-center px-4 pt-24" onClick={() => setOpen(false)} data-testid="global-search-modal">
                    <div className="w-full max-w-2xl bg-surface rounded-2xl border border-kindred shadow-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-kindred">
                            <Search className="h-4 w-4 text-muted-k" />
                            <input
                                ref={inputRef}
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                data-testid="global-search-input"
                                placeholder="Search statements, documents, visits, referrals, family chat…"
                                className="flex-1 bg-transparent text-sm focus:outline-none"
                            />
                            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-k" />}
                            <button type="button" onClick={() => setOpen(false)} className="text-muted-k hover:text-primary-k"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="max-h-96 overflow-auto">
                            {q.trim().length < 2 ? (
                                <div className="px-5 py-8 text-sm text-muted-k text-center">Type 2+ characters to search across your account.</div>
                            ) : results.length === 0 && !loading ? (
                                <div className="px-5 py-8 text-sm text-muted-k text-center" data-testid="global-search-empty">No matches for "{q}".</div>
                            ) : (
                                <ul data-testid="global-search-results">
                                    {results.map((r) => {
                                        const meta = TYPE_META[r.type] || { icon: FileText, label: r.type };
                                        const Icon = meta.icon;
                                        return (
                                            <li key={`${r.type}-${r.id}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => go(r)}
                                                    data-testid={`global-search-result-${r.type}-${r.id}`}
                                                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-surface-2 text-left border-b border-kindred/40 last:border-none"
                                                >
                                                    <Icon className="h-4 w-4 text-muted-k flex-shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm text-primary-k truncate">{r.title}</div>
                                                        <div className="text-xs text-muted-k truncate">{meta.label} · {r.subtitle || ""}</div>
                                                    </div>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
