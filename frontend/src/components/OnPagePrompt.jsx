import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Sparkles, ArrowRight } from "lucide-react";
import { isConv1FlagOn } from "@/config/conv1Flags";
import conv1 from "@/lib/conv1";
import { resolveOffer, OFFERS } from "@/components/ArticleOfferBlock";

/**
 * OnPagePrompt — CONV-1 v2 Workstream J.
 *
 * A single, gentle, topic-matched prompt that appears once the reader has
 * genuinely engaged (≈60% scroll) on an article or glossary page. Rules:
 *   • once per 30 days per visitor (localStorage timestamp)
 *   • never on small phones (<480px) — the inline offer block covers those
 *   • no dark patterns: a clear dismiss (X + backdrop + Esc), easy to ignore
 *   • topic-matched to the single most relevant FREE tool
 * Fires prompt_shown / prompt_converted / prompt_dismissed. Flag: conv1_prompt.
 */
const STORAGE_KEY = "wayly_onpage_prompt_at";
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function recentlyShown() {
    try {
        const ts = Number(window.localStorage.getItem(STORAGE_KEY) || 0);
        return ts && Date.now() - ts < COOLDOWN_MS;
    } catch (_) { return false; }
}

export default function OnPagePrompt({ slug, category, title, surface = "article" }) {
    const nav = useNavigate();
    const dialogRef = useRef(null);
    const armedRef = useRef(false);
    const [open, setOpen] = useState(false);
    const on = isConv1FlagOn("conv1_prompt");
    const offerKey = resolveOffer(category, slug, title);
    const offer = OFFERS[offerKey];

    useEffect(() => {
        if (!on || !offer) return;
        if (typeof window === "undefined") return;
        if (window.innerWidth < 480) return;          // not on small phones
        if (recentlyShown()) return;                   // once per 30 days

        const onScroll = () => {
            if (armedRef.current) return;
            const scrolled = window.scrollY + window.innerHeight;
            const depth = document.documentElement.scrollHeight || 1;
            if (scrolled / depth >= 0.6) {
                armedRef.current = true;
                try { window.localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (_) { /* ignore */ }
                setOpen(true);
                try { conv1.promptShown({ surface, offer: offerKey, article_slug: slug }); } catch (_) { /* best-effort */ }
                window.removeEventListener("scroll", onScroll);
            }
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [on, offer, offerKey, slug, surface]);

    useEffect(() => {
        const d = dialogRef.current;
        if (!d) return;
        if (open && !d.open) { try { d.showModal(); } catch (_) { /* ignore */ } }
    }, [open]);

    if (!on || !offer) return null;

    const dismiss = () => {
        try { conv1.promptDismissed({ surface, offer: offerKey, article_slug: slug }); } catch (_) { /* best-effort */ }
        try { dialogRef.current?.close(); } catch (_) { /* ignore */ }
        setOpen(false);
    };

    const convert = () => {
        try { conv1.promptConverted({ surface, offer: offerKey, article_slug: slug }); } catch (_) { /* best-effort */ }
        try { dialogRef.current?.close(); } catch (_) { /* ignore */ }
        setOpen(false);
        nav(offer.href);
    };

    return (
        <dialog
            ref={dialogRef}
            onCancel={(e) => { e.preventDefault(); dismiss(); }}
            onClose={() => setOpen(false)}
            data-testid="onpage-prompt"
            data-offer={offerKey}
            className="w-[min(92vw,420px)] rounded-3xl border border-kindred bg-surface p-0 shadow-[0_32px_80px_rgba(14,42,71,0.22)] backdrop:bg-primary-k/40 backdrop:backdrop-blur-sm"
        >
            <div className="p-6">
                <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#075866] font-semibold">
                        <Sparkles className="h-3.5 w-3.5" /> {offer.eyebrow}
                    </span>
                    <button type="button" onClick={dismiss} data-testid="onpage-prompt-dismiss" aria-label="No thanks" className="text-muted-k hover:text-primary-k -mt-1 -mr-1 p-1">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <h2 className="mt-2 font-heading text-xl text-primary-k leading-snug">{offer.title}</h2>
                <p className="mt-2 text-sm text-muted-k leading-relaxed">{offer.blurb}</p>
                <button type="button" onClick={convert} data-testid="onpage-prompt-cta" className="mt-5 w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-[#075866] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0a6d7e] transition-colors">
                    {offer.cta} <ArrowRight className="h-4 w-4" />
                </button>
                <button type="button" onClick={dismiss} data-testid="onpage-prompt-no" className="mt-2 w-full text-center text-xs text-muted-k hover:text-primary-k">
                    No thanks, keep reading
                </button>
                <p className="mt-2 text-[11px] text-muted-k text-center">{offer.disclosure}</p>
            </div>
        </dialog>
    );
}
