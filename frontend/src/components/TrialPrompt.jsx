import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    X, ArrowRight, ShieldCheck, Sparkles,
    FileText, ReceiptText, Scale, Calculator, ClipboardList, Mail, Users, BookOpen, Layers,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * TrialPrompt — a premium, context-aware "try Wayly free for 7 days" spotlight.
 *
 * Rules (per founder brief):
 *   - Logged-OUT visitors only, on PUBLIC pages (never app/onboarding/admin/auth).
 *   - First-time visitor: after 60s of active on-site time. Returning: after 120s.
 *   - Timer only advances while the tab is visible and on a public page.
 *   - First appearance speaks to the page being viewed (e.g. Support at Home
 *     Levels, Statement Decoder, Pricing, articles…).
 *   - If closed, it returns every 5 minutes, ROTATING through different premium
 *     prompts that each highlight a distinct Wayly offering.
 *   - The button starts the 7-day free trial sign-up.
 */

const APP_PREFIXES = ["/app", "/onboarding", "/journey", "/admin", "/settings", "/billing"];
const AUTH_RE = /^\/(login|signup|forgot|reset|verify-email|auth)(\/|$)/i;

function isBlockedRoute(p) {
    if (AUTH_RE.test(p)) return true;
    return APP_PREFIXES.some((x) => p === x || p.startsWith(x + "/"));
}

const VISIT_KEY = "wayly_trial_prompt_visited_v1";       // persists: seen the site before
const SESSION_SUPPRESS = "wayly_trial_prompt_engaged";    // this tab/session: already clicked through

const FIRST_DELAY = 60;     // seconds — brand-new visitor
const RETURN_DELAY = 120;   // seconds — returning visitor
const REPROMPT_DELAY = 300; // seconds — after a dismissal

// --- Context-aware first appearance -----------------------------------------
// Most specific routes first; the last entry is the catch-all.
const CONTEXT = [
    {
        match: (p) => p.startsWith("/support-at-home-levels"),
        icon: Layers, eyebrow: "Support At Home",
        title: "Know Exactly What Your Level Covers",
        body: "You're reading about Support at Home levels. Wayly turns your level, budget and statements into plain English, so you can see what's covered and what you should be paying.",
    },
    {
        match: (p) => p.startsWith("/home-care-packages") || p.startsWith("/hcp"),
        icon: Layers, eyebrow: "Home Care Packages",
        title: "Move To Support At Home With Confidence",
        body: "Wayly helps you make sense of the shift from Home Care Packages to Support at Home, decoding your statements and budgets so nothing catches you off guard.",
    },
    {
        match: (p) => p.startsWith("/ai-tools/statement-decoder"),
        icon: FileText, eyebrow: "Statement Decoder",
        title: "Decode Any Statement In About A Minute",
        body: "Paste a Support at Home statement and Wayly explains every line in plain English, flagging anything that looks off.",
    },
    {
        match: (p) => p.startsWith("/ai-tools/invoice-checker"),
        icon: ReceiptText, eyebrow: "Invoice Checker",
        title: "Catch Overcharges Before You Pay",
        body: "Wayly reads your invoice and flags double charges, wrong rates and fees that shouldn't be there, before the money leaves your account.",
    },
    {
        match: (p) => p.startsWith("/ai-tools/provider-price-checker"),
        icon: Scale, eyebrow: "Price Checker",
        title: "Check If You're Paying A Fair Price",
        body: "Compare your provider's prices against the market, so you can spot when a rate is higher than it should be.",
    },
    {
        match: (p) => p.startsWith("/ai-tools/budget-calculator") || p.startsWith("/ai-tools/contribution-estimator"),
        icon: Calculator, eyebrow: "Budget Tools",
        title: "See Your Whole Budget At A Glance",
        body: "Wayly maps your funding, your spending and what's left, so there are no end-of-quarter surprises.",
    },
    {
        match: (p) => p.startsWith("/ai-tools/care-plan-reviewer") || p.startsWith("/ai-tools/support-plan-reviewer"),
        icon: ClipboardList, eyebrow: "Care Plan Reviewer",
        title: "Make Sure Your Care Plan Works For You",
        body: "Wayly reviews your care plan and highlights gaps, so you receive every bit of support you're entitled to.",
    },
    {
        match: (p) => p.startsWith("/ai-tools/letters-and-follow-ups") || p.startsWith("/ai-tools/reassessment-letter"),
        icon: Mail, eyebrow: "Letters & Follow-Ups",
        title: "Send The Right Letter In Minutes",
        body: "From reassessments to complaints, Wayly drafts clear, confident letters you can send straight away.",
    },
    {
        match: (p) => p.startsWith("/ai-tools"),
        icon: Sparkles, eyebrow: "The Wayly Toolkit",
        title: "Every Wayly Tool, Yours To Explore",
        body: "Decode statements, check invoices, compare prices and draft letters, all in one place and all in plain English.",
    },
    {
        match: (p) => p.startsWith("/pricing"),
        icon: ShieldCheck, eyebrow: "Simple Pricing",
        title: "Start Free, Then Decide",
        body: "Every Wayly plan begins with a 7-day free trial. There's no charge today and you can cancel at any time.",
    },
    {
        match: (p) => /^\/(resources|articles|guides|faq|glossary|templates|services|features|about|trust|for-gps|chsp)/i.test(p),
        icon: BookOpen, eyebrow: "Learn With Wayly",
        title: "Put What You're Reading Into Action",
        body: "Guides are a great start. Wayly does the hard part for you, decoding statements, checking prices and drafting letters.",
    },
];

const DEFAULT_CONTEXT = {
    icon: Sparkles, eyebrow: "Meet Wayly",
    title: "Take The Guesswork Out Of Aged Care Costs",
    body: "Wayly reads your statements, checks your prices and drafts your letters, all in plain English, so you always know where you stand.",
};

// --- Rotating premium re-prompts (each a different offering) -----------------
const ROTATION = [
    {
        icon: FileText, eyebrow: "Statement Decoder",
        title: "Turn Any Statement Into Plain English",
        body: "Wayly reads your Support at Home statement line by line and tells you what every charge really means, in seconds.",
    },
    {
        icon: ReceiptText, eyebrow: "Invoice Checker",
        title: "Catch Overcharges Before You Pay",
        body: "Upload an invoice and Wayly flags double charges, wrong rates and fees that shouldn't be there.",
    },
    {
        icon: Scale, eyebrow: "Price Checker",
        title: "Know If You're Paying A Fair Price",
        body: "Compare your provider's prices against the market, so you can spot when something is too high.",
    },
    {
        icon: Calculator, eyebrow: "Budget Calculator",
        title: "See Your Support At Home Budget Clearly",
        body: "Wayly maps your funding, spending and what's left over, so there are no end-of-quarter surprises.",
    },
    {
        icon: ClipboardList, eyebrow: "Care Plan Reviewer",
        title: "Make Sure Your Care Plan Works For You",
        body: "Wayly reviews your care plan and highlights the gaps, so you get the support you're entitled to.",
    },
    {
        icon: Mail, eyebrow: "Letters & Follow-Ups",
        title: "Send The Right Letter In Minutes",
        body: "From reassessments to complaints, Wayly drafts clear, confident letters you can send straight away.",
    },
    {
        icon: Users, eyebrow: "Family Coordination",
        title: "Keep The Whole Family In The Loop",
        body: "Share updates, statements and tasks, so everyone caring for your loved one stays on the same page.",
    },
];

function pickContextual(pathname) {
    const hit = CONTEXT.find((c) => c.match(pathname));
    return hit || DEFAULT_CONTEXT;
}

export default function TrialPrompt() {
    const { user, loading } = useAuth();
    const { pathname } = useLocation();
    const navigate = useNavigate();

    const [open, setOpen] = useState(false);
    const [visible, setVisible] = useState(false); // drives the enter/exit transition
    const [content, setContent] = useState(DEFAULT_CONTEXT);

    const activeRef = useRef(0);          // seconds of active, on-site time toward the next show
    const targetRef = useRef(FIRST_DELAY); // threshold for the next show
    const shownOnceRef = useRef(false);    // has the first (contextual) prompt fired?
    const rotationRef = useRef(0);         // which rotation prompt comes next
    const lastFocusRef = useRef(null);
    const ctaRef = useRef(null);

    const loggedOut = !loading && !user;
    const blocked = isBlockedRoute(pathname || "");

    // Decide first-visit vs returning once, then mark as "visited" for next time.
    useEffect(() => {
        let returning = false;
        try { returning = localStorage.getItem(VISIT_KEY) === "1"; } catch { /* ignore */ }
        targetRef.current = returning ? RETURN_DELAY : FIRST_DELAY;
        try { localStorage.setItem(VISIT_KEY, "1"); } catch { /* ignore */ }
    }, []);

    const openPrompt = useCallback(() => {
        const next = shownOnceRef.current
            ? ROTATION[rotationRef.current % ROTATION.length]
            : pickContextual(pathname || "/");
        shownOnceRef.current = true;
        setContent(next);
        try { lastFocusRef.current = document.activeElement; } catch { /* ignore */ }
        setOpen(true);
    }, [pathname]);

    // One global 1s ticker. Advances only while visible, logged out, on a public
    // page, and not already open. Fires the prompt when the threshold is reached.
    useEffect(() => {
        const id = setInterval(() => {
            if (open) return;
            if (typeof document !== "undefined" && document.hidden) return;
            if (!loggedOut || blocked) return;
            try { if (sessionStorage.getItem(SESSION_SUPPRESS) === "1") return; } catch { /* ignore */ }
            activeRef.current += 1;
            if (activeRef.current >= targetRef.current) openPrompt();
        }, 1000);
        return () => clearInterval(id);
    }, [open, loggedOut, blocked, openPrompt]);

    // Enter transition + body scroll lock + focus the CTA while open.
    useEffect(() => {
        if (!open) return;
        const raf = requestAnimationFrame(() => setVisible(true));
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const t = setTimeout(() => { try { ctaRef.current?.focus(); } catch { /* ignore */ } }, 60);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(t);
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);

    const close = useCallback((engaged = false) => {
        setVisible(false);
        // After a rotation prompt is dismissed, advance to the next offering.
        if (shownOnceRef.current && content !== DEFAULT_CONTEXT && ROTATION.includes(content)) {
            rotationRef.current += 1;
        }
        activeRef.current = 0;
        targetRef.current = REPROMPT_DELAY;
        if (engaged) { try { sessionStorage.setItem(SESSION_SUPPRESS, "1"); } catch { /* ignore */ } }
        setTimeout(() => setOpen(false), 250); // let the exit transition play
        try { lastFocusRef.current?.focus?.(); } catch { /* ignore */ }
    }, [content]);

    const startTrial = useCallback(() => {
        close(true);
        navigate("/signup?src=trial_prompt");
    }, [close, navigate]);

    // Escape to close while open.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") close(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, close]);

    if (!open) return null;

    const Icon = content.icon || Sparkles;

    return (
        <div
            data-testid="trial-prompt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-prompt-title"
            aria-describedby="trial-prompt-body"
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
        >
            {/* Dimmed, softly blurred backdrop */}
            <div
                aria-hidden="true"
                onClick={() => close(false)}
                className={`absolute inset-0 bg-[#06201f]/70 backdrop-blur-sm transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
            />

            {/* Spotlight card */}
            <div
                className={`relative w-full max-w-[26rem] sm:max-w-md overflow-hidden rounded-[28px] bg-[#F4F7F6] shadow-2xl ring-1 ring-black/5 transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95"} max-h-[92vh] overflow-y-auto`}
            >
                {/* Teal header band with decorative orbs + icon tile */}
                <div className="relative overflow-hidden bg-gradient-to-br from-[#0E4D52] to-[#15707a] px-6 pt-7 pb-8 sm:px-7">
                    <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full bg-[#A5512B]/30 blur-2xl" />
                    <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-8 h-44 w-44 rounded-full bg-[#6B8F71]/30 blur-2xl" />

                    <button
                        type="button"
                        onClick={() => close(false)}
                        aria-label="Close"
                        data-testid="trial-prompt-close"
                        className="absolute top-3.5 right-3.5 rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    <div className="relative flex items-center gap-3.5">
                        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
                            <Icon className="h-6 w-6 text-white" strokeWidth={2} />
                        </span>
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">{content.eyebrow}</p>
                            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20">
                                <Sparkles className="h-3 w-3" /> 7 Days Free
                            </span>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 pt-6 pb-7 sm:px-7">
                    <h2
                        id="trial-prompt-title"
                        className="text-[1.6rem] leading-tight tracking-tight text-[#0A2022]"
                        style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 500 }}
                    >
                        {content.title}
                    </h2>
                    <p id="trial-prompt-body" className="mt-3 text-[15px] leading-relaxed text-[#0A2022]/70">
                        {content.body}
                    </p>

                    <button
                        ref={ctaRef}
                        type="button"
                        onClick={startTrial}
                        data-testid="trial-prompt-cta"
                        className="group mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#0E4D52] px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-[#0E4D52]/20 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-[#0c4248] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0E4D52] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F4F7F6] motion-reduce:hover:translate-y-0 motion-reduce:transition-none"
                    >
                        Start Your 7-Day Free Trial
                        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                    </button>

                    <div className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-[#0A2022]/55">
                        <ShieldCheck className="h-3.5 w-3.5 text-[#2D6A4F]" />
                        <span>No Charge Today &middot; Cancel Anytime</span>
                    </div>

                    <button
                        type="button"
                        onClick={() => close(false)}
                        data-testid="trial-prompt-later"
                        className="mx-auto mt-3 block text-[13px] font-medium text-[#0A2022]/50 underline-offset-2 transition-colors hover:text-[#0A2022]/75 hover:underline"
                    >
                        Maybe Later
                    </button>
                </div>
            </div>
        </div>
    );
}
