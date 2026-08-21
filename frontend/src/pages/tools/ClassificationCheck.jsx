import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolRelatedLinks from "@/components/ToolRelatedLinks";
import ReportIssueButton from "@/components/ReportIssueButton";
import ToolExplainer from "@/components/ToolExplainer";
import ToolHero from "@/components/ToolHero";
import ToolGate from "@/components/ToolGate";
import { ScreenshotStatement } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import useScrollToResult from "@/hooks/useScrollToResult";
import { api, formatAUD } from "@/lib/api";
import { usePersona } from "@/lib/persona";
import { CSC_QUESTIONS } from "@/data/cscQuestions";
import { Loader2, Sparkles, ArrowRight, ChevronDown, ChevronUp, RefreshCcw, CheckCircle2, Download, Mail } from "lucide-react";

import SeoHead, { softwareApplicationLd, howToLd, faqLd, breadcrumbLd } from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";

const DRAFT_KEY = "csc.run.draft";
const LATEST_KEY = "csc.run.latest.v1";

const _toolJsonLd = (cfg) => {
    const blocks = [softwareApplicationLd({
        name: cfg.toolName,
        description: cfg.toolDesc,
        url: `https://wayly.com.au${cfg.path}`,
    })];
    if (cfg.howTo) blocks.push(howToLd(cfg.howTo));
    if (cfg.faqs) blocks.push(faqLd(cfg.faqs));
    blocks.push(breadcrumbLd([
        { name: "Home", url: "/" },
        { name: "AI Tools", url: "/ai-tools" },
        { name: cfg.toolName, url: cfg.path },
    ]));
    return blocks;
};

// ============================================================================
// Small building blocks
// ============================================================================

function ProgressBar({ answered, total }) {
    const pct = Math.round((answered / total) * 100);
    return (
        <div className="mb-6" data-testid="csc-progress">
            <div className="flex justify-between text-xs text-muted-k mb-1.5">
                <span>{answered} of {total} answered</span>
                <span>{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-primary-k transition-all" style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

function ConfidencePill({ confidence }) {
    const cfg = {
        high: { label: "High confidence", bg: "bg-[#6d907d]", fg: "text-white" },
        medium: { label: "Medium confidence", bg: "bg-[#f5efe3] border border-[#6d907d]", fg: "text-primary-k" },
        low: { label: "Low confidence", bg: "bg-[#c86540]", fg: "text-white" },
    }[confidence] || { label: confidence, bg: "bg-surface-2", fg: "text-primary-k" };
    return (
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.fg}`} data-testid={`csc-confidence-${confidence}`}>
            {cfg.label}
        </span>
    );
}

function QuestionCard({ index, question, persona, value, onChange }) {
    const [showAnchor, setShowAnchor] = useState(null);
    const stem = question.stem[persona] || question.stem.caregiver;
    return (
        <div className="border-b border-kindred pb-5" data-testid={`csc-q-${question.id}`}>
            <div className="text-sm text-primary-k font-medium">
                <span className="text-muted-k">{index + 1}.</span> {stem}
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {question.scale.map((opt) => {
                    const selected = value === opt.value;
                    const anchor = question.anchors?.[opt.value];
                    const isNotSure = opt.value === "not_sure";
                    return (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange(opt.value)}
                            onMouseEnter={() => setShowAnchor(opt.value)}
                            onMouseLeave={() => setShowAnchor(null)}
                            data-testid={`csc-q-${question.id}-${opt.value}`}
                            className={`text-left text-sm rounded-lg border px-3 py-2 transition-colors ${
                                selected
                                    ? "border-primary-k bg-primary-k text-white font-medium"
                                    : isNotSure
                                        ? "border-dashed border-kindred text-muted-k hover:bg-surface-2"
                                        : "border-kindred text-primary-k hover:bg-surface-2"
                            }`}
                        >
                            <div>{opt.label}</div>
                            {anchor && showAnchor === opt.value && (
                                <div className={`mt-1 text-xs ${selected ? "text-white/80" : "text-muted-k"}`}>{anchor}</div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================================
// Results screen (§6)
// ============================================================================

function ProfileHeader({ result, current }) {
    const c = result.classification;
    const rangeLabel = c.range_low === c.range_high
        ? `Classification ${c.primary}`
        : `Classification ${c.range_low} to ${c.range_high}`;
    return (
        <div className="rounded-2xl border border-kindred bg-surface p-6" data-testid="csc-result-header">
            <div className="flex flex-wrap items-center gap-3 mb-4">
                <ConfidencePill confidence={c.confidence} />
                {result.gap_detected && result.gap_direction === "up" && (
                    <span className="text-xs text-clay-k font-medium" data-testid="csc-gap-badge">
                        Gap detected: needs above current C{current}
                    </span>
                )}
            </div>
            <div className="overline">Indicative band</div>
            <div className="mt-2 font-heading text-4xl sm:text-5xl text-primary-k tracking-tight">{rangeLabel}</div>
            <p className="mt-3 text-muted-k font-mono tabular-nums">
                {formatAUD(c.annual_budget_low)} to {formatAUD(c.annual_budget_high)} per year
                <span className="text-xs ml-2">({formatAUD(c.quarterly_budget_low)} to {formatAUD(c.quarterly_budget_high)} per quarter)</span>
            </p>
            <p className="mt-4 text-sm text-primary-k">{result.profile_summary}</p>
        </div>
    );
}

function TopDrivers({ drivers }) {
    if (!drivers?.length) return null;
    const domainLabel = (k) => ({
        self_care: "Self-care",
        iadl: "IADLs",
        cognition_behaviour: "Cognition and behaviour",
        safety_hospitalisation: "Safety",
        informal_support: "Informal support",
        home_environment: "Home environment",
        mood: "Mood",
    }[k] || k);
    return (
        <div className="rounded-2xl border border-kindred bg-surface p-6" data-testid="csc-drivers">
            <div className="overline mb-3">What drove this result</div>
            <div className="grid gap-3 sm:grid-cols-3">
                {drivers.map((d) => (
                    <div key={d.question_id} className="rounded-lg bg-surface-2 p-3">
                        <div className="text-xs text-muted-k">{domainLabel(d.domain)}</div>
                        <div className="text-sm text-primary-k font-medium mt-1">{d.answer}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function NextStepBlock({ result, current }) {
    // Branch A: gap up → LF-1 CTA
    if (result.branch === "A") {
        const runIdParam = `?csc_run_id=${encodeURIComponent(result.csc_run_id)}&primary=${result.classification.primary}&current=${current || ""}`;
        return (
            <div className="rounded-2xl border border-clay-k bg-surface p-6" data-testid="csc-next-step-a">
                <div className="text-primary-k font-medium">
                    Your daily-life answers suggest higher needs than Classification {current} typically covers.
                </div>
                <p className="text-sm text-muted-k mt-2">
                    This is a common reason to request a reassessment. Being under-classified is common and fixable.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                        to={`/ai-tools/reassessment-letter${runIdParam}`}
                        data-testid="csc-cta-lf1"
                        className="inline-flex items-center gap-2 bg-primary-k text-white text-sm font-medium rounded-full px-4 py-2 hover:bg-[#091D33]"
                    >
                        Draft a reassessment letter <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </div>
        );
    }
    // Branch B: match or lower → save + reassure
    if (result.branch === "B") {
        return (
            <div className="rounded-2xl border border-kindred bg-surface p-6" data-testid="csc-next-step-b">
                <div className="text-primary-k font-medium">
                    Your answers line up with your current classification.
                </div>
                <p className="text-sm text-muted-k mt-2">
                    If the situation changes, run this again. This tool is designed to be re-used.
                </p>
            </div>
        );
    }
    // Branch C: no current classification → MAC
    return (
        <div className="rounded-2xl border border-kindred bg-surface p-6" data-testid="csc-next-step-c">
            <div className="text-primary-k font-medium">
                This is a starting point. The formal assessment is arranged through My Aged Care.
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
                <a
                    href="tel:1800200422"
                    data-testid="csc-cta-mac"
                    className="inline-flex items-center gap-2 bg-primary-k text-white text-sm font-medium rounded-full px-4 py-2 hover:bg-[#091D33]"
                >
                    Call My Aged Care on 1800 200 422
                </a>
            </div>
        </div>
    );
}

function AssessorBlock() {
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    useEffect(() => {
        if (open && !data) {
            api.get("/public/csc/iat-domains").then(({ data }) => setData(data)).catch(() => setData({ domains: [], closing_copy: "" }));
        }
    }, [open, data]);
    return (
        <div className="rounded-2xl border border-kindred bg-surface" data-testid="csc-assessor-block">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between p-6 text-left"
                data-testid="csc-assessor-toggle"
            >
                <span className="font-medium text-primary-k">What the assessor will ask</span>
                {open ? <ChevronUp className="h-5 w-5 text-muted-k" /> : <ChevronDown className="h-5 w-5 text-muted-k" />}
            </button>
            {open && (
                <div className="px-6 pb-6">
                    {!data ? (
                        <div className="text-muted-k text-sm"><Loader2 className="inline h-4 w-4 animate-spin mr-1" /> Loading…</div>
                    ) : (
                        <>
                            <ul className="divide-y divide-kindred">
                                {data.domains.map((d) => (
                                    <li key={d.name} className="py-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                                d.covered_by_csc === true || d.covered_by_csc === "yes"
                                                    ? "bg-[#6d907d]/20 text-[#3d6852]"
                                                    : d.covered_by_csc === "partly"
                                                        ? "bg-[#f5efe3] text-primary-k"
                                                        : "bg-surface-2 text-muted-k"
                                            }`}>
                                                {d.covered_by_csc === true || d.covered_by_csc === "yes" ? "Covered" : d.covered_by_csc === "partly" ? "Partly" : "Not covered"}
                                            </span>
                                            <span className="text-sm text-primary-k font-medium">{d.name}</span>
                                        </div>
                                        {d.notes && <div className="mt-1 text-xs text-muted-k pl-1">{d.notes}</div>}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-4 text-sm text-muted-k italic">{data.closing_copy}</p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Result actions (§6.1 Actions row): Save as PDF + Email to self
// ============================================================================

function ResultActions({ result }) {
    const [pdfLoading, setPdfLoading] = useState(false);
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailSent, setEmailSent] = useState(false);
    const [emailError, setEmailError] = useState(null);

    const downloadPdf = async () => {
        setPdfLoading(true);
        try {
            const res = await api.post("/public/csc/pdf", { payload: result }, { responseType: "blob" });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "classification_self_check.pdf";
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert(e?.response?.data?.detail || "Could not generate PDF.");
        } finally {
            setPdfLoading(false);
        }
    };

    const emailToSelf = async () => {
        // Read the user's email from /auth/me (fast, cached).
        setEmailLoading(true);
        setEmailError(null);
        try {
            const me = await api.get("/auth/me");
            const to = me?.data?.email;
            if (!to) {
                setEmailError("Please sign in to email this result to yourself.");
                setEmailLoading(false);
                return;
            }
            await api.post("/public/csc/email", { payload: result, to });
            setEmailSent(true);
        } catch (e) {
            setEmailError(e?.response?.data?.detail || "Could not send email.");
        } finally {
            setEmailLoading(false);
        }
    };

    return (
        <div className="rounded-2xl border border-kindred bg-surface p-5" data-testid="csc-actions">
            <div className="flex flex-wrap gap-3">
                <button
                    onClick={downloadPdf}
                    disabled={pdfLoading}
                    data-testid="csc-download-pdf"
                    className="inline-flex items-center gap-2 border border-kindred bg-surface-2 text-primary-k text-sm font-medium rounded-full px-4 py-2 hover:bg-kindred disabled:opacity-60"
                >
                    {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Save as PDF
                </button>
                <button
                    onClick={emailToSelf}
                    disabled={emailLoading || emailSent}
                    data-testid="csc-email-self"
                    className="inline-flex items-center gap-2 border border-kindred bg-surface-2 text-primary-k text-sm font-medium rounded-full px-4 py-2 hover:bg-kindred disabled:opacity-60"
                >
                    {emailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    {emailSent ? "Emailed" : "Email to self"}
                </button>
            </div>
            {emailError && <div className="text-xs text-clay-k mt-2" data-testid="csc-email-error">{emailError}</div>}
            {emailSent && <div className="text-xs text-[#6d907d] mt-2" data-testid="csc-email-sent">Check your inbox in a minute.</div>}
        </div>
    );
}

// ============================================================================
// Main
// ============================================================================

export default function ClassificationCheck() {
    const access = useToolAccess();
    const personaBundle = usePersona();
    // Persona resolution priority: ?persona= querystring (test/preview) →
    // account bundle → default caregiver.
    let personaFromQs = null;
    if (typeof window !== "undefined") {
        const p = new URLSearchParams(window.location.search).get("persona");
        if (p === "participant" || p === "caregiver") personaFromQs = p;
    }
    const persona = personaFromQs
        || (personaBundle?.persona === "participant" ? "participant" : "caregiver");

    // Answers keyed by question id. null == unanswered.
    const [answers, setAnswers] = useState(() => Object.fromEntries(CSC_QUESTIONS.map((q) => [q.id, null])));
    const [current, setCurrent] = useState("");
    const [resumed, setResumed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const resultRef = useScrollToResult(result);

    const answered = useMemo(() => Object.values(answers).filter((v) => v !== null).length, [answers]);
    const allDone = answered === CSC_QUESTIONS.length;

    // ---- Auto-save to localStorage on every answer change ----
    useEffect(() => {
        if (result) return;
        try {
            window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, current, persona, ts: new Date().toISOString() }));
        } catch { /* ignore quota */ }
    }, [answers, current, persona, result]);

    // ---- Resume prompt on mount ----
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const draft = JSON.parse(raw);
            if (!draft?.answers) return;
            const draftAnswered = Object.values(draft.answers).filter((v) => v !== null).length;
            if (draftAnswered > 0) {
                setAnswers({ ...answers, ...draft.answers });
                setCurrent(draft.current || "");
                setResumed(true);
            }
        } catch { /* ignore */ }
    }, []);

    const setAnswer = (qid, value) => {
        setAnswers((prev) => ({ ...prev, [qid]: value }));
        setResumed(false);
    };

    const resetDraft = () => {
        try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
        setAnswers(Object.fromEntries(CSC_QUESTIONS.map((q) => [q.id, null])));
        setCurrent("");
        setResumed(false);
        setResult(null);
    };

    const submit = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await api.post("/public/csc/run", {
                persona,
                current_classification: current ? parseInt(current) : null,
                answers,
            });
            setResult(data);
            try {
                window.localStorage.setItem(LATEST_KEY, JSON.stringify(data));
                window.localStorage.removeItem(DRAFT_KEY);
            } catch { /* noop */ }
        } catch (e) {
            setError(e?.response?.data?.detail?.message || "Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // ---- Access gate ----
    if (access === "loading") return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolClassification} jsonLd={_toolJsonLd(SEO.toolClassification)} />
            <MarketingHeader />
            <div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div>
            <ToolRelatedLinks slug="classification-self-check" />
            <Footer />
        </div>
    );
    if (access === "blocked") return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolClassification} jsonLd={_toolJsonLd(SEO.toolClassification)} />
            <MarketingHeader />
            <ToolHero toolKey="classification-self-check" />
            <ToolGate toolName="Classification Self-Check"><ScreenshotStatement /></ToolGate>
            <section className="max-w-5xl mx-auto px-4 sm:px-8"><ToolExplainer toolKey="classification-self-check" /></section>
            <ToolRelatedLinks slug="classification-self-check" />
            <Footer />
        </div>
    );

    const intro = persona === "participant"
        ? "Answer 16 questions about your daily life. We will show you the classification band you are likely to fall in, whether your needs have shifted since your last assessment, and what to prepare for if a reassessment is needed."
        : "Answer 16 questions about your parent's daily life. We will show you the classification band they are likely to fall in, whether their needs have shifted since their last assessment, and what to prepare for if a reassessment is needed.";

    const openerCopy = persona === "participant"
        ? "Some of these questions can be hard to sit with. Take your time. There is no wrong answer."
        : "These questions can be hard to sit with. Take your time. There is no wrong answer.";

    const currentLabel = persona === "participant"
        ? "What's your current classification, if you know it?"
        : "What's their current classification, if you know it?";

    const ctaLabel = allDone
        ? "See my result"
        : answered > 0
            ? `${answered} of ${CSC_QUESTIONS.length} done. Keep going.`
            : `Answer all ${CSC_QUESTIONS.length} questions to see your result.`;

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolClassification} jsonLd={_toolJsonLd(SEO.toolClassification)} />
            <MarketingHeader />
            <section className="mx-auto max-w-3xl px-6 pt-12 pb-4">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI Tools</Link>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">
                    {persona === "participant" ? "Are you on the right classification?" : "Is your parent on the right classification?"}
                </h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">{intro}</p>
                <p className="mt-3 text-sm text-muted-k italic">
                    This is informational only. Only the My Aged Care Integrated Assessment Tool (IAT) determines actual classification.
                </p>
                <p className="mt-3 text-xs text-muted-k">Takes about 5 minutes. Your answers are saved as you go.</p>
            </section>

            {!result && (
                <section className="mx-auto max-w-3xl px-6 pb-20">
                    <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="csc-quiz">
                        {/* Current classification (top of flow) */}
                        <div className="mb-6 pb-5 border-b border-kindred">
                            <label className="block text-sm font-medium text-primary-k mb-2">{currentLabel} <span className="text-muted-k font-normal">(Optional)</span></label>
                            <select
                                value={current}
                                onChange={(e) => setCurrent(e.target.value)}
                                data-testid="csc-current"
                                className="w-full rounded-lg border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                            >
                                <option value="">Not sure or not yet assessed</option>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>Classification {n}</option>)}
                            </select>
                        </div>

                        {/* Progress bar (sticky so it stays visible while answering) */}
                        <div className="sticky top-16 z-30 -mx-6 px-6 pt-4 bg-surface border-b border-kindred" data-testid="csc-progress-sticky">
                            <ProgressBar answered={answered} total={CSC_QUESTIONS.length} />
                        </div>

                        {/* Resume banner */}
                        {resumed && (
                            <div className="mb-5 p-3 rounded-lg bg-surface-2 border border-kindred flex items-center justify-between" data-testid="csc-resumed">
                                <div className="text-sm text-primary-k inline-flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-[#6d907d]" /> We restored your previous answers.
                                </div>
                                <button onClick={resetDraft} className="text-xs text-clay-k inline-flex items-center gap-1" data-testid="csc-restart">
                                    <RefreshCcw className="h-3 w-3" /> Start over
                                </button>
                            </div>
                        )}

                        {/* Warm opener */}
                        <p className="mb-6 text-sm text-muted-k italic">{openerCopy}</p>

                        {/* Questions */}
                        <div className="space-y-5">
                            {CSC_QUESTIONS.map((q, idx) => (
                                <QuestionCard
                                    key={q.id}
                                    index={idx}
                                    question={q}
                                    persona={persona}
                                    value={answers[q.id]}
                                    onChange={(v) => setAnswer(q.id, v)}
                                />
                            ))}
                        </div>

                        {/* Submit */}
                        <div className="mt-8 space-y-2">
                            {!allDone && (
                                <p className="text-xs text-muted-k text-center" data-testid="csc-cta-help">
                                    {answered === 0
                                        ? "Answer all 16 questions to see your result."
                                        : `${CSC_QUESTIONS.length - answered} question${CSC_QUESTIONS.length - answered === 1 ? "" : "s"} to go.`}
                                </p>
                            )}
                            <button
                                onClick={submit}
                                disabled={!allDone || loading}
                                data-testid="csc-submit"
                                className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#091D33] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 font-medium"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                {loading ? "Scoring…" : ctaLabel}
                            </button>
                            {error && <div className="text-sm text-clay-k text-center" data-testid="csc-error">{error}</div>}
                        </div>
                    </div>
                </section>
            )}

            {result && (
                <section ref={resultRef} className="mx-auto max-w-3xl px-6 pb-20 space-y-5 animate-fade-up scroll-mt-20" data-testid="csc-result">
                    <ProfileHeader result={result} current={current} />
                    <TopDrivers drivers={result.top_drivers} />
                    <NextStepBlock result={result} current={current} />
                    <ResultActions result={result} />
                    <AssessorBlock />
                    <div className="rounded-2xl border border-kindred bg-surface-2 p-5 text-sm text-muted-k" data-testid="csc-repeat-nudge">
                        This isn&apos;t a one-time answer. Run this again after a fall, a hospital stay, a new diagnosis, or a carer change.
                    </div>
                    <div className="flex flex-wrap justify-between items-center gap-3 pt-4">
                        <button
                            onClick={resetDraft}
                            className="text-sm text-primary-k inline-flex items-center gap-1 hover:underline"
                            data-testid="csc-rerun"
                        >
                            <RefreshCcw className="h-4 w-4" /> Run this again
                        </button>
                        <ReportIssueButton variant="inline" toolName="Classification Self-Check" toolOutput={result} />
                    </div>
                    <p className="text-xs text-muted-k text-center pt-2">
                        Payload version <code>{result.schema_version}</code>. Budgets sourced from <code>{result.classification.budget_source_version}</code>.
                    </p>
                </section>
            )}

            <section className="max-w-5xl mx-auto px-4 sm:px-8">
                <ToolExplainer toolKey="classification-self-check" />
            </section>
            <ToolRelatedLinks slug="classification-self-check" />
            <Footer />
        </div>
    );
}
