/**
 * Switch Provider, UI-1 §9 / §14.4
 *
 * 5-step guided workflow that teaches the user how to switch providers under
 * Support at Home, with draft persistence on the existing `/provider-switch`
 * resource. The steps follow the verbatim spec copy:
 *
 *   1. Why You Might Switch              (§14.4.1)
 *   2. Before You Decide                 (§14.4.2)
 *   3. Comparing Providers               (§14.4.3)
 *   4. Giving Notice + draft letter      (§14.4.4)
 *   5. Handover and First Two Weeks      (§14.4.5)
 *
 * Drafts persist across reloads via the backend resource. The draft letter
 * generated at step 4 is rendered as plain text (copy + .txt download); a
 * proper PDF generator is a follow-up.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Repeat, Check, ChevronLeft, ChevronRight, FileText, Download, Copy,
    CircleCheck, CircleDashed,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell, safeGet, safePost, safePatch } from "./_shared";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";
import ReadOnlyLock from "@/components/ReadOnlyLock";

const STAGE_BY_STEP = ["considering", "comparing", "notice_given", "transition", "complete"];

const BEFORE_YOU_DECIDE_QUESTIONS = [
    {
        key: "spoken_to_provider",
        prompt: "Have you raised your concerns with your current provider?",
        help: "Often providers will make changes if you tell them what's not working. It is worth at least one direct conversation, ideally in writing.",
    },
    {
        key: "documented_issues",
        prompt: "Have you written down the specific incidents that worry you?",
        help: "Dates, what happened, who was involved. This helps you compare providers later and gives the new provider a clearer picture of what to fix.",
    },
    {
        key: "checked_budget",
        prompt: "Do you know how much of your budget is unspent?",
        help: "Unspent funds carry with the participant when you switch. Wayly's Budget Calculator shows the current balance.",
    },
    {
        key: "considered_continuity",
        prompt: "Is the participant okay with workers changing?",
        help: "A new provider almost always means new faces. For some participants this is fine, for others it is a real disruption.",
    },
];

const COMPARE_TOPICS = [
    {
        key: "services",
        title: "Services offered",
        body: "Make sure the new provider offers everything the participant currently uses, plus anything you have been told they need next.",
    },
    {
        key: "prices",
        title: "Per-service prices",
        body: "Compare hourly rates and any package or admin fees. Wayly's Provider Price Checker can help.",
    },
    {
        key: "availability",
        title: "Availability and worker continuity",
        body: "Ask how many regular workers the participant would see and what they do when a regular worker is sick or on leave.",
    },
    {
        key: "communication",
        title: "Communication style",
        body: "Will they call you when something changes? How do they handle complaints? What is their response time on questions?",
    },
    {
        key: "fees",
        title: "Hidden fees",
        body: "There are no exit fees under Support at Home. Ask the new provider to list every fee, including admin and travel, in writing.",
    },
];

const HANDOVER_CHECKS = [
    { key: "transferred_care_plan", label: "Care plan and goals shared with new provider" },
    { key: "confirmed_first_visit", label: "First visit confirmed, with the regular worker if possible" },
    { key: "diary_for_first_two_weeks", label: "Diary set up to capture how the first two weeks go" },
    { key: "feedback_session_booked", label: "Feedback session booked with the new provider for week 3" },
];

const fmtList = (obj, labels) => Object.keys(labels).filter((k) => obj?.[k]).map((k) => labels[k].toLowerCase());

function buildNoticeLetter(participantName, currentProvider, lastDayISO, reasonShort) {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = today.getFullYear();
    let lastDay = "[last service date]";
    if (lastDayISO) {
        const d = new Date(lastDayISO);
        if (!isNaN(d.getTime())) {
            lastDay = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
        }
    }
    return [
        `${dd}/${mm}/${yyyy}`,
        ``,
        `${currentProvider || "[Current Provider]"}`,
        `[Provider address]`,
        ``,
        `Notice of Provider Change Under Support at Home`,
        ``,
        `Dear ${currentProvider || "Provider"},`,
        ``,
        `I am writing on behalf of ${participantName || "[Participant Name]"} to let you know that we have decided to move to a different Support at Home provider.`,
        ``,
        reasonShort
            ? `In short, our reason is: ${reasonShort}.`
            : `We have made this decision after weighing up our options carefully.`,
        ``,
        `Please treat this letter as formal notice. We would like the last day of service with you to be ${lastDay}.`,
        ``,
        `In line with the Support at Home program rules, please:`,
        `  1. Confirm in writing the last day you will deliver services.`,
        `  2. Confirm the balance of unspent budget that will carry across.`,
        `  3. Share a copy of the most recent care plan and any clinical notes with the new provider on request.`,
        `  4. Confirm there are no exit fees, transfer fees, or final invoices to settle outside published service rates.`,
        ``,
        `Thank you for the services you have provided to date. We would like the handover to be as smooth as possible for ${participantName || "the participant"}.`,
        ``,
        `Kind regards,`,
        ``,
        `[Your name]`,
        `[Your relationship to ${participantName || "the participant"}]`,
        `[Your contact details]`,
    ].join("\n");
}

export default function ProviderSwitch() {
    const [row, setRow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [step, setStep] = useState(1);
    const isExpired = useExpiredTrial();

    // Form scratchpads (persist into row.checklist + row.target_provider etc)
    const [intro, setIntro] = useState({ current_provider: "", target_provider: "", reason: "" });
    const [beforeYouDecide, setBeforeYouDecide] = useState({});
    const [compare, setCompare] = useState({});
    const [notice, setNotice] = useState({ last_service_date: "", reason_short: "" });

    const stepRef = useRef(null);

    const refresh = async () => {
        setLoading(true);
        const data = await safeGet("/provider-switch");
        if (data) {
            setRow(data);
            setIntro({
                current_provider: data.current_provider || "",
                target_provider: data.target_provider || "",
                reason: data.reason || "",
            });
            setBeforeYouDecide(data.checklist?.before_you_decide || {});
            setCompare(data.checklist?.compare || {});
            setNotice({
                last_service_date: data.checklist?.notice?.last_service_date || "",
                reason_short: data.checklist?.notice?.reason_short || data.reason || "",
            });
            // Jump to the step they're currently on
            const idx = STAGE_BY_STEP.indexOf(data.stage);
            if (idx >= 0) setStep(idx + 1);
        }
        setLoading(false);
    };

    useEffect(() => { refresh(); }, []);
    useEffect(() => { if (stepRef.current) stepRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, [step]);

    const startSwitch = async () => {
        if (!intro.current_provider.trim()) {
            toast.error("Please enter your current provider before starting.");
            return;
        }
        const created = await safePost("/provider-switch", { ...intro, stage: "considering" }, "Switch started");
        if (created) await refresh();
    };

    const saveAndAdvance = async (nextStep) => {
        const checklist = {
            ...(row?.checklist || {}),
            before_you_decide: beforeYouDecide,
            compare,
            notice,
            ...((nextStep === 5 && row?.checklist) ? row.checklist : {}),
        };
        const nextStage = STAGE_BY_STEP[Math.max(0, nextStep - 1)];
        await safePatch(`/provider-switch/${row.id}`, {
            current_provider: intro.current_provider,
            target_provider: intro.target_provider,
            reason: intro.reason,
            checklist,
            stage: nextStage,
        }, null);
        setStep(nextStep);
        // Background refresh
        refresh();
    };

    const toggleHandover = async (key) => {
        const next = { ...(row.checklist || {}), [key]: !row.checklist?.[key] };
        await safePatch(`/provider-switch/${row.id}`, { checklist: next });
        refresh();
    };

    const letterText = useMemo(() => {
        return buildNoticeLetter(
            "the participant",
            intro.current_provider,
            notice.last_service_date,
            notice.reason_short,
        );
    }, [intro.current_provider, notice.last_service_date, notice.reason_short]);

    const copyLetter = async () => {
        try { await navigator.clipboard.writeText(letterText); toast.success("Letter copied to your clipboard."); }
        catch { toast.error("Could not copy, select the text and copy manually."); }
    };
    const downloadLetter = () => {
        const blob = new Blob([letterText], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "wayly-switch-provider-notice.txt"; a.click();
        URL.revokeObjectURL(url);
    };
    const downloadPdf = async () => {
        try {
            const { api } = await import("@/lib/api");
            const res = await api.post("/provider-switch/notice.pdf", {
                current_provider: intro.current_provider || "[Current Provider]",
                last_service_date: notice.last_service_date || null,
                reason_short: notice.reason_short || intro.reason || null,
            }, { responseType: "blob" });
            const blob = new Blob([res.data], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "wayly-switch-provider-notice.pdf"; a.click();
            URL.revokeObjectURL(url);
            toast.success("PDF downloaded.");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not generate the PDF.");
        }
    };

    if (loading) {
        return <PageShell testid="switch-page" overline="Switch Provider" title="Switch Provider"><div className="text-muted-k">Loading…</div></PageShell>;
    }

    if (isExpired) {
        return (
            <PageShell
                testid="switch-page"
                overline="Switch Provider"
                title="Switch Provider"
                description="A guided path to changing providers, with Wayly tracking the handover so nothing falls through the cracks."
            >
                <ReadOnlyLock testId="switch-lock" label="Subscribe to start or continue a provider switch" sub="The full 5-step guided workflow, including the draft notice letter, turns back on the moment you subscribe." />
            </PageShell>
        );
    }

    return (
        <PageShell
            testid="switch-page"
            overline="Switch Provider"
            title="Switch Provider"
            description="A guided path to changing providers, with Wayly tracking the handover so nothing falls through the cracks."
        >
            <Stepper current={step} onJump={(n) => row && setStep(n)} disabled={!row} />

            <div ref={stepRef} />

            {step === 1 && (
                <StepOne intro={intro} setIntro={setIntro} row={row} onStart={startSwitch} onNext={() => row ? saveAndAdvance(2) : null} />
            )}
            {step === 2 && (
                <StepTwo beforeYouDecide={beforeYouDecide} setBeforeYouDecide={setBeforeYouDecide} onBack={() => setStep(1)} onNext={() => saveAndAdvance(3)} />
            )}
            {step === 3 && (
                <StepThree intro={intro} setIntro={setIntro} compare={compare} setCompare={setCompare} onBack={() => setStep(2)} onNext={() => saveAndAdvance(4)} />
            )}
            {step === 4 && (
                <StepFour
                    intro={intro}
                    notice={notice}
                    setNotice={setNotice}
                    letterText={letterText}
                    onCopy={copyLetter}
                    onDownload={downloadLetter}
                    onDownloadPdf={downloadPdf}
                    onBack={() => setStep(3)}
                    onNext={() => saveAndAdvance(5)}
                />
            )}
            {step === 5 && (
                <StepFive
                    row={row}
                    onToggle={toggleHandover}
                    onBack={() => setStep(4)}
                    onComplete={async () => { await safePatch(`/provider-switch/${row.id}`, { stage: "complete" }, "Switch complete, well done."); refresh(); }}
                />
            )}
        </PageShell>
    );
}

function Stepper({ current, onJump, disabled }) {
    const steps = [
        "Why You Might Switch",
        "Before You Decide",
        "Comparing Providers",
        "Giving Notice",
        "Handover",
    ];
    return (
        <nav aria-label="Switch provider steps" className="mb-4" data-testid="switch-stepper">
            <ol className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {steps.map((label, idx) => {
                    const n = idx + 1;
                    const done = n < current;
                    const active = n === current;
                    return (
                        <li key={label}>
                            <button
                                type="button"
                                disabled={disabled && n !== 1}
                                onClick={() => onJump(n)}
                                data-testid={`switch-step-${n}`}
                                className={`w-full text-left rounded-lg border px-3 py-2 transition-all ${active
                                    ? "border-primary-k bg-primary-k text-white"
                                    : done
                                        ? "border-sage bg-sage/10 text-primary-k"
                                        : "border-kindred bg-surface text-muted-k"}`}
                            >
                                <div className="text-[11px] uppercase tracking-wider opacity-75">Step {n}</div>
                                <div className="text-sm font-medium leading-snug mt-0.5">{label}</div>
                            </button>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

function StepShell({ title, intro, children, footer, testid }) {
    return (
        <section data-testid={testid} className="bg-surface border border-kindred rounded-2xl p-6 space-y-4">
            <h2 className="font-heading text-2xl text-primary-k">{title}</h2>
            {intro && <div className="text-sm leading-relaxed text-primary-k max-w-3xl">{intro}</div>}
            <div className="pt-2">{children}</div>
            {footer && <div className="pt-4 border-t border-kindred flex items-center justify-between gap-3">{footer}</div>}
        </section>
    );
}

function NavButtons({ onBack, onNext, nextLabel = "Continue", nextDisabled }) {
    return (
        <>
            <button type="button" onClick={onBack} disabled={!onBack} data-testid="switch-back" className="inline-flex items-center gap-1 text-sm text-primary-k hover:underline disabled:opacity-30 disabled:no-underline">
                <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button type="button" onClick={onNext} disabled={nextDisabled} data-testid="switch-next" className="inline-flex items-center gap-2 rounded-full bg-primary-k px-5 py-2 text-sm font-semibold text-white hover:bg-[#091D33] disabled:opacity-50">
                {nextLabel} <ChevronRight className="h-4 w-4" />
            </button>
        </>
    );
}

function StepOne({ intro, setIntro, row, onStart, onNext }) {
    const introCopy = (
        <>
            <p>
                Most caregivers consider switching providers for one of a few reasons. Your provider is consistently late or unreliable. Their published prices keep going up. The worker mix is unstable, and your parent keeps meeting new faces. Communication is poor. Or the services on offer no longer fit the participant&apos;s needs.
            </p>
            <p className="mt-3">
                You do not need to justify the switch to anyone. Under Support at Home, you can change providers at any time. You cannot be charged a fee for leaving. Your budget moves with the participant, not with the provider.
            </p>
            <p className="mt-3">
                Wayly does not recommend specific providers. We will help you understand what to ask, what to compare, and how to make the handover as clean as possible.
            </p>
        </>
    );
    return (
        <StepShell testid="switch-step1" title="Why You Might Switch Providers" intro={introCopy}
            footer={row
                ? <NavButtons onBack={null} onNext={onNext} nextLabel="I Have Read This, Continue" />
                : (
                    <div className="ml-auto">
                        <button type="button" onClick={onStart} data-testid="switch-start" className="inline-flex items-center gap-2 rounded-full bg-primary-k px-5 py-2 text-sm font-semibold text-white hover:bg-[#091D33]">
                            Start the Workflow <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                )
            }
        >
            <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                    <span className="text-xs text-muted-k">Current Provider</span>
                    <input value={intro.current_provider} onChange={(e) => setIntro({ ...intro, current_provider: e.target.value })} required data-testid="switch-current-provider" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Target Provider (Optional)</span>
                    <input value={intro.target_provider} onChange={(e) => setIntro({ ...intro, target_provider: e.target.value })} data-testid="switch-target-provider" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block sm:col-span-2">
                    <span className="text-xs text-muted-k">In a Sentence, Why Are You Considering Switching?</span>
                    <textarea value={intro.reason} onChange={(e) => setIntro({ ...intro, reason: e.target.value })} rows={2} data-testid="switch-reason" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
            </div>
        </StepShell>
    );
}

function StepTwo({ beforeYouDecide, setBeforeYouDecide, onBack, onNext }) {
    const introCopy = (
        <>
            <p>Before you make the move, walk through these four checks. You do not have to answer &ldquo;yes&rdquo; to all of them. They just help make sure switching is the right call.</p>
        </>
    );
    return (
        <StepShell testid="switch-step2" title="Before You Decide" intro={introCopy}
            footer={<NavButtons onBack={onBack} onNext={onNext} nextLabel="Compare Providers" />}
        >
            <ul className="space-y-3">
                {BEFORE_YOU_DECIDE_QUESTIONS.map((q) => {
                    const answer = beforeYouDecide[q.key];
                    return (
                        <li key={q.key} className="rounded-xl border border-kindred bg-surface p-4">
                            <div className="font-medium text-primary-k">{q.prompt}</div>
                            <p className="mt-1 text-sm text-muted-k leading-relaxed">{q.help}</p>
                            <div className="mt-3 flex gap-2">
                                {[
                                    { val: "yes", label: "Yes" },
                                    { val: "no", label: "Not Yet" },
                                    { val: "na", label: "Not Applicable" },
                                ].map((opt) => (
                                    <button
                                        key={opt.val}
                                        type="button"
                                        onClick={() => setBeforeYouDecide({ ...beforeYouDecide, [q.key]: opt.val })}
                                        data-testid={`switch-byd-${q.key}-${opt.val}`}
                                        className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${answer === opt.val ? "bg-primary-k text-white border-primary-k" : "bg-surface text-primary-k border-kindred hover:bg-surface-2"}`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </StepShell>
    );
}

function StepThree({ intro, setIntro, compare, setCompare, onBack, onNext }) {
    const introCopy = (
        <>
            <p>
                If you already know which provider you are moving to, write them down. Either way, walk through the five things that matter most when comparing providers under Support at Home.
            </p>
        </>
    );
    return (
        <StepShell testid="switch-step3" title="Comparing Providers" intro={introCopy}
            footer={<NavButtons onBack={onBack} onNext={onNext} nextLabel="Draft the Notice" />}
        >
            <label className="block max-w-md">
                <span className="text-xs text-muted-k">Target Provider</span>
                <input value={intro.target_provider} onChange={(e) => setIntro({ ...intro, target_provider: e.target.value })} data-testid="switch-target-provider-3" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
            </label>
            <ul className="mt-4 space-y-3">
                {COMPARE_TOPICS.map((t) => {
                    const done = compare[t.key];
                    return (
                        <li key={t.key}>
                            <button
                                type="button"
                                onClick={() => setCompare({ ...compare, [t.key]: !done })}
                                data-testid={`switch-compare-${t.key}`}
                                className="w-full text-left rounded-xl border border-kindred bg-surface p-4 flex items-start gap-3 hover:border-primary-k transition-colors"
                            >
                                {done ? <CircleCheck className="h-5 w-5 text-sage flex-shrink-0 mt-0.5" /> : <CircleDashed className="h-5 w-5 text-muted-k flex-shrink-0 mt-0.5" />}
                                <div>
                                    <div className={`font-medium ${done ? "text-muted-k line-through" : "text-primary-k"}`}>{t.title}</div>
                                    <p className="mt-1 text-sm text-muted-k leading-relaxed">{t.body}</p>
                                </div>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </StepShell>
    );
}

function StepFour({ intro, notice, setNotice, letterText, onCopy, onDownload, onDownloadPdf, onBack, onNext }) {
    const introCopy = (
        <>
            <p>
                When you are ready, send written notice to your current provider. Under Support at Home there is no required notice period, but most providers ask for 14 days so they can wind down services properly. Below is a draft letter you can copy, adjust, and send.
            </p>
        </>
    );
    return (
        <StepShell testid="switch-step4" title="Giving Notice" intro={introCopy}
            footer={<NavButtons onBack={onBack} onNext={onNext} nextLabel="Plan the Handover" />}
        >
            <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                    <span className="text-xs text-muted-k">Last Day of Service With Current Provider</span>
                    <input type="date" value={notice.last_service_date} onChange={(e) => setNotice({ ...notice, last_service_date: e.target.value })} data-testid="switch-last-day" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Reason (One Short Sentence)</span>
                    <input value={notice.reason_short} onChange={(e) => setNotice({ ...notice, reason_short: e.target.value })} placeholder={intro.reason || "for example, we are moving to a provider closer to home"} data-testid="switch-reason-short" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm" />
                </label>
            </div>

            <div className="mt-4 rounded-xl border border-kindred overflow-hidden">
                <div className="flex items-center justify-between gap-2 bg-surface-2 px-4 py-2 border-b border-kindred">
                    <div className="flex items-center gap-2 text-sm text-primary-k font-medium">
                        <FileText className="h-4 w-4" /> Draft Notice Letter
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onCopy} data-testid="switch-letter-copy" className="inline-flex items-center gap-1.5 text-xs text-primary-k hover:underline">
                            <Copy className="h-3.5 w-3.5" /> Copy
                        </button>
                        <button type="button" onClick={onDownload} data-testid="switch-letter-download" className="inline-flex items-center gap-1.5 text-xs text-primary-k hover:underline">
                            <Download className="h-3.5 w-3.5" /> .txt
                        </button>
                        <button type="button" onClick={onDownloadPdf} data-testid="switch-letter-pdf" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-k bg-surface-2 rounded-full px-2.5 py-1 hover:bg-primary-k hover:text-white transition-colors">
                            <Download className="h-3.5 w-3.5" /> PDF
                        </button>
                    </div>
                </div>
                <pre data-testid="switch-letter-preview" className="bg-white p-5 text-[13px] leading-relaxed text-primary-k whitespace-pre-wrap font-sans overflow-x-auto">{letterText}</pre>
            </div>

            <p className="text-xs text-muted-k leading-relaxed">
                The letter is a starting point. Adjust the wording, add anything specific to your situation, and replace the bracketed parts before sending.
            </p>
        </StepShell>
    );
}

function StepFive({ row, onToggle, onBack, onComplete }) {
    const allDone = HANDOVER_CHECKS.every((c) => row?.checklist?.[c.key]);
    const introCopy = (
        <>
            <p>
                The first two weeks with a new provider matter the most. New workers are still learning the participant&apos;s routine and preferences. Set yourself up to spot problems early and give the new provider clear feedback.
            </p>
        </>
    );
    return (
        <StepShell testid="switch-step5" title="Handover and First Two Weeks" intro={introCopy}
            footer={
                <>
                    <button type="button" onClick={onBack} data-testid="switch-back" className="inline-flex items-center gap-1 text-sm text-primary-k hover:underline">
                        <ChevronLeft className="h-4 w-4" /> Back
                    </button>
                    <button type="button" onClick={onComplete} disabled={!allDone || row?.stage === "complete"} data-testid="switch-complete" className="inline-flex items-center gap-2 rounded-full bg-sage px-5 py-2 text-sm font-semibold text-white hover:bg-[#5a7a5f] disabled:opacity-50">
                        <Check className="h-4 w-4" /> {row?.stage === "complete" ? "Switch Complete" : "Mark Switch Complete"}
                    </button>
                </>
            }
        >
            <ul className="space-y-2">
                {HANDOVER_CHECKS.map((c) => {
                    const done = row?.checklist?.[c.key];
                    return (
                        <li key={c.key}>
                            <button type="button" onClick={() => onToggle(c.key)} data-testid={`switch-handover-${c.key}`} className="w-full text-left flex items-start gap-3 rounded-lg border border-kindred bg-surface p-3 hover:border-primary-k">
                                {done ? <CircleCheck className="h-5 w-5 text-sage flex-shrink-0" /> : <CircleDashed className="h-5 w-5 text-muted-k flex-shrink-0" />}
                                <span className={`text-sm ${done ? "text-muted-k line-through" : "text-primary-k"}`}>{c.label}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            {row?.stage === "complete" && (
                <div className="mt-4 rounded-xl border border-sage/40 bg-sage/10 p-4 text-sm text-primary-k flex items-center gap-2">
                    <CircleCheck className="h-5 w-5 text-sage" />
                    Switch marked complete. Wayly will keep this record on file and start tracking the new provider going forward.
                </div>
            )}
        </StepShell>
    );
}
