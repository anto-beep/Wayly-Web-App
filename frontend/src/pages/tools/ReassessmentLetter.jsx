import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useParticipants } from "@/context/ParticipantsContext";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolRelatedLinks from "@/components/ToolRelatedLinks";
import ReportIssueButton from "@/components/ReportIssueButton";
import { ToolSummary } from "@/components/ToolShell";
import ToolExplainer from "@/components/ToolExplainer";
import ToolHero from "@/components/ToolHero";
import ToolGate from "@/components/ToolGate";
import { ScreenshotStatement } from "@/components/Screenshots";
import useToolAccess from "@/hooks/useToolAccess";
import { useParticipantPrefill } from "@/hooks/useParticipantPrefill";
import AIAccuracyBanner, { TOOL_DISCLAIMERS } from "@/components/AIAccuracyBanner";
import ProfileInlinePrompts from "@/components/ProfileInlinePrompts";
import { api, extractErrorMessage } from "@/lib/api";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import EmailResultButton from "@/components/EmailResultButton";

import SeoHead, { softwareApplicationLd, howToLd, faqLd, breadcrumbLd } from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";

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

export default function ReassessmentLetter() {
    const _domainLabel = (k) => ({
        self_care: "self-care",
        iadl: "IADLs",
        cognition_behaviour: "cognition and behaviour",
        safety_hospitalisation: "safety",
        informal_support: "informal support",
        home_environment: "home environment",
        mood: "mood",
    }[k] || k);
    const access = useToolAccess();
    const { active: activeParticipant } = useParticipants();
    const [form, setForm] = useState({
        participant_name: "",
        current_classification: 4,
        changes_summary: "",
        recent_events: "",
        sender_name: "",
        relationship: "family caregiver",
        letter_type: "classification_reassessment",
        hospital_name: "",
        discharge_date: "",
    });
    const [loading, setLoading] = useState(false);
    const [letter, setLetter] = useState(null);
    const [copied, setCopied] = useState(false);
    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    // Keep participant_name in lockstep with the active participant selection.
    // On first fill this seeds the field. On participant switch it swaps
    // unless the user has typed a custom value.
    useParticipantPrefill({
        value: form.participant_name,
        onChange: (name) => setForm((f) => ({ ...f, participant_name: name })),
    });

    // Pre-fill from the user's primary participant when available, saves
    // typing and keeps the letter consistent with the saved profile.
    const _applyParticipantToForm = (doc) => {
        if (!doc) return;
        const fullName = `${doc.first_name || ""} ${doc.last_name || ""}`.trim();
        setForm((f) => ({
            ...f,
            participant_name: f.participant_name || fullName,
            current_classification: doc.classification_level || f.current_classification,
        }));
    };

    useEffect(() => {
        // Follow the active participant from context so the form always
        // pre-fills the currently-selected person, not just the primary.
        if (activeParticipant?.id) {
            _applyParticipantToForm(activeParticipant);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get("/participants");
                if (cancelled) return;
                const p = (data?.items || []).find((x) => x.is_primary && x.status === "ACTIVE")
                       || (data?.items || [])[0];
                _applyParticipantToForm(p);
            } catch { /* unauthenticated or no participant, no-op */ }
        })();
        return () => { cancelled = true; };
    }, [activeParticipant?.id]);

    // When an inline prompt saves any field, re-apply the freshest values.
    const onParticipantUpdated = (doc) => _applyParticipantToForm(doc);

    // CSC-1 payload ingest (LF-1 v1.3). If the user arrived via a Branch A
    // deep-link from the Classification Self-Check tool, prefill the
    // reassessment letter's ``current_classification`` and
    // ``changes_summary`` from the CSC run. Deep-link contract:
    //   /ai-tools/letters-and-follow-ups?csc_run_id=<uuid>&primary=<N>&current=<M>
    // The full payload is fetched from GET /api/public/csc/run/{id} when the
    // querystring is present. Falls back to querystring params if the id
    // lookup fails.
    const [cscBadge, setCscBadge] = useState(null);
    useEffect(() => {
        try {
            const url = new URL(window.location.href);
            const runId = url.searchParams.get("csc_run_id");
            const primaryQs = parseInt(url.searchParams.get("primary") || "");
            const currentQs = parseInt(url.searchParams.get("current") || "");
            if (!runId && !primaryQs) return;

            const applyPayload = (payload) => {
                const primary = payload?.classification?.primary || primaryQs;
                const current = payload?.current_classification || currentQs;
                const drivers = payload?.top_drivers || [];
                const driverText = drivers.length
                    ? drivers.map((d) => `- ${d.answer.toLowerCase()} in ${_domainLabel(d.domain).toLowerCase()}`).join("\n")
                    : "";
                const summary = drivers.length
                    ? `Based on a recent Classification Self-Check on Wayly, my daily-life answers suggest higher needs than my current Classification ${current || "?"} typically covers. In particular:\n${driverText}\n\nI would like the assessor to review these functional changes and confirm whether the current classification still fits.`
                    : `A recent Classification Self-Check on Wayly indicates my needs are at Classification ${primary}, above my current Classification ${current || "?"}. I would like a reassessment.`;
                setForm((f) => ({
                    ...f,
                    current_classification: current || primary || f.current_classification,
                    changes_summary: f.changes_summary || summary,
                }));
                setCscBadge({ primary, current, runId, ts: payload?.run_at || null });
            };

            if (runId) {
                api.get(`/public/csc/run/${runId}`)
                    .then(({ data }) => applyPayload(data))
                    .catch(() => applyPayload(null));
            } else {
                applyPayload(null);
            }
        } catch { /* ignore malformed URL */ }
    }, []);

    const submit = async () => {
        setLoading(true);
        setLetter(null);
        try {
            const payload = { ...form };
            if (payload.letter_type !== "rcp_assessment") {
                delete payload.hospital_name;
                delete payload.discharge_date;
            }
            // LF-1 v1.3, pass the CSC run id through so the server-side
            // prompt can inline the evidence rather than trusting the
            // free-text summary alone.
            if (cscBadge?.runId) {
                payload.csc_run_id = cscBadge.runId;
            }
            const { data } = await api.post("/public/reassessment-letter", payload);
            setLetter(data.letter);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not draft letter."));
        } finally {
            setLoading(false);
        }
    };

    const copy = async () => {
        await navigator.clipboard.writeText(letter);
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    if (access === "loading") return (<div className="min-h-screen bg-kindred"><SeoHead {...SEO.toolReassessment} jsonLd={_toolJsonLd(SEO.toolReassessment)} />
            <MarketingHeader /><div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div><ToolRelatedLinks slug="reassessment-letter" />
            <Footer /></div>);
    if (access === "blocked") return (<div className="min-h-screen bg-kindred"><SeoHead {...SEO.toolReassessment} jsonLd={_toolJsonLd(SEO.toolReassessment)} />
    <MarketingHeader /><ToolHero toolKey="reassessment-letter" /><ToolGate toolName="Reassessment Letter Drafter"><ScreenshotStatement /></ToolGate><section className="max-w-5xl mx-auto px-4 sm:px-8"><ToolExplainer toolKey="reassessment-letter" /></section><ToolRelatedLinks slug="reassessment-letter" />
            <Footer /></div>);

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolReassessment} jsonLd={_toolJsonLd(SEO.toolReassessment)} />
            <MarketingHeader />
            <section className="mx-auto max-w-3xl px-6 pt-12 pb-6">
                <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI Tools</Link>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Reassessment Letter Drafter</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed">Tell us what's changed. We will draft a clear, polite letter you can send to My Aged Care, the provider's care manager, or both, including Restorative Care Pathway and care-plan amendment requests.</p>
            </section>

            <section className="mx-auto max-w-3xl px-6 pb-20">
                <ProfileInlinePrompts where="reassessment_letter" onParticipantUpdated={onParticipantUpdated} />
                {cscBadge && (
                    <div className="mt-4 rounded-lg border border-kindred bg-surface-2 p-4 flex items-start gap-3" data-testid="rl-csc-badge">
                        <span className="inline-block h-2 w-2 rounded-full bg-[#6d907d] mt-1.5 flex-shrink-0" />
                        <div>
                            <div className="text-sm text-primary-k font-medium">Pre-filled from your Classification Self-Check</div>
                            <div className="text-xs text-muted-k mt-0.5">
                                Your CSC pointed to <b>Classification {cscBadge.primary}</b>{cscBadge.current ? ` (current: C${cscBadge.current})` : ""}. We drafted an opening summary below. Feel free to edit before generating.
                            </div>
                        </div>
                    </div>
                )}
                <div className="bg-surface border border-kindred rounded-2xl p-6 space-y-5 mt-4" data-testid="reassessment-form">
                    <div>
                        <span className="text-sm text-muted-k">Letter type</span>
                        <div className="mt-2 grid sm:grid-cols-3 gap-2">
                            {[
                                { v: "classification_reassessment", label: "Classification reassessment", sub: "Ask My Aged Care to re-rate the participant" },
                                { v: "rcp_assessment", label: "Restorative Care Pathway", sub: "Request an RCP assessment after a hospital stay or decline" },
                                { v: "care_plan_amendment", label: "Care plan amendment", sub: "Ask the care manager to change services in the plan" },
                            ].map((t) => (
                                <button
                                    key={t.v}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, letter_type: t.v }))}
                                    data-testid={`rl-type-${t.v}`}
                                    className={`text-left rounded-lg border p-3 transition-colors ${form.letter_type === t.v ? "border-primary-k bg-surface-2" : "border-kindred hover:bg-surface-2"}`}
                                >
                                    <div className="text-sm font-medium text-primary-k">{t.label}</div>
                                    <div className="text-xs text-muted-k mt-0.5">{t.sub}</div>
                                </button>
                            ))}
                        </div>
                        {form.letter_type === "classification_reassessment" && (
                            <p className="mt-3 text-xs text-muted-k leading-relaxed" data-testid="rl-chsp-note">
                                On the Commonwealth Home Support Programme (CHSP) and your parent's needs have grown? This same letter works as a request to move from CHSP into Support at Home, see the{" "}
                                <Link to="/chsp/transition-2027" className="underline text-primary-k">CHSP-to-Support-at-Home transition guide</Link>.
                            </p>
                        )}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <label className="block"><span className="text-sm text-muted-k">Participant name</span>
                            <input value={form.participant_name} onChange={update("participant_name")} required data-testid="rl-participant" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                        </label>
                        <label className="block"><span className="text-sm text-muted-k">Current classification</span>
                            <select value={form.current_classification} onChange={(e) => setForm((f) => ({ ...f, current_classification: parseInt(e.target.value) }))} data-testid="rl-class" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k">
                                {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>Classification {n}</option>)}
                            </select>
                        </label>
                    </div>
                    <label className="block"><span className="text-sm text-muted-k">What's changed since the last assessment?</span>
                        <textarea value={form.changes_summary} onChange={update("changes_summary")} rows={4} required placeholder="e.g. Their mobility has dropped significantly since the recent hospital admission; they now need help with showering and meal prep daily." data-testid="rl-changes" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                    </label>
                    <label className="block"><span className="text-sm text-muted-k">Recent events (optional)</span>
                        <textarea value={form.recent_events} onChange={update("recent_events")} rows={2} placeholder="e.g. Hospital admission 14 March, fall on 2 April, new dementia diagnosis." data-testid="rl-events" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                    </label>
                    {form.letter_type === "rcp_assessment" && (
                        <div data-testid="rl-rcp-fields" className="grid sm:grid-cols-2 gap-4">
                            <label className="block">
                                <span className="text-sm text-muted-k">Hospital name (optional)</span>
                                <input value={form.hospital_name} onChange={update("hospital_name")} placeholder="e.g. Royal Melbourne Hospital" data-testid="rl-hospital" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                            </label>
                            <label className="block">
                                <span className="text-sm text-muted-k">Discharge date (optional)</span>
                                <input type="date" value={form.discharge_date} onChange={update("discharge_date")} data-testid="rl-discharge" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                            </label>
                        </div>
                    )}
                    <div className="grid sm:grid-cols-2 gap-4">
                        <label className="block"><span className="text-sm text-muted-k">Your name (the sender)</span>
                            <input value={form.sender_name} onChange={update("sender_name")} required data-testid="rl-sender" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                        </label>
                        <label className="block"><span className="text-sm text-muted-k">Your relationship</span>
                            <input value={form.relationship} onChange={update("relationship")} data-testid="rl-rel" className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                        </label>
                    </div>
                    <button onClick={submit} disabled={loading || !form.participant_name || !form.changes_summary || !form.sender_name} data-testid="rl-submit" className="w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#091D33] disabled:opacity-60 inline-flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Drafting…" : "Draft my letter"}
                    </button>
                </div>

                {letter && (
                    <div className="mt-6 space-y-3 animate-fade-up" data-testid="rl-result">
                        <ToolSummary
                            toolName="Reassessment Letter"
                            headline="Your reassessment letter is ready to review."
                            body="Wayly drafted a short, factual letter to My Aged Care asking for a reassessment. Read it end to end, edit anything that does not sound like you, and send it from your own email. Include the participant's My Aged Care reference number if you have it."
                            tone="success"
                            testId="rl-summary"
                        />
                        <div className="flex items-center justify-between">
                            <div className="overline">Your draft letter</div>
                            <button onClick={copy} className="text-sm text-primary-k inline-flex items-center gap-1.5 underline">
                                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
                            </button>
                        </div>
                        <div className="bg-surface border border-kindred rounded-xl p-6 whitespace-pre-wrap text-sm text-primary-k leading-relaxed font-mono">{letter}</div>
                        <p className="text-xs text-muted-k italic">Always review before sending. Remove anything that doesn't sound like you, add anything missing.</p>
                        <ReportIssueButton variant="inline" toolName="Reassessment Letter" toolOutput={{ letter }} />
                        {access !== "allowed" && (
                            <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                                <div className="font-medium text-primary-k">Want Wayly to track the response?</div>
                                <p className="text-sm text-muted-k mt-1">Paid plans watch for the My Aged Care reply, log it to your audit trail, and walk you through the next steps.</p>
                                <div className="mt-3 flex items-center gap-3 flex-wrap">
                                    <Link to="/signup" className="inline-block text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#091D33]">Start free trial</Link>
                                    <EmailResultButton
                                        tool="Reassessment Letter"
                                        headline={`Reassessment letter for ${form.participant_name || "[Participant]"}`}
                                        bodyHtml={`<p style="margin:0 0 12px;color:#555;font-size:13px">Draft reassessment letter to My Aged Care:</p><pre style="white-space:pre-wrap;font-family:Georgia,serif;color:#0E2A47;background:#EAF4FB;padding:16px;border-radius:8px;border:1px solid #CFE0F0">${(letter || "").replace(/</g, "&lt;")}</pre>`}
                                    />
                                </div>
                            </div>
                        )}
                        {access === "allowed" && (
                            <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                                <div className="font-medium text-primary-k">Email this draft to yourself</div>
                                <div className="mt-3">
                                    <EmailResultButton
                                        tool="Reassessment Letter"
                                        headline={`Reassessment letter for ${form.participant_name || "[Participant]"}`}
                                        bodyHtml={`<p style="margin:0 0 12px;color:#555;font-size:13px">Draft reassessment letter to My Aged Care:</p><pre style="white-space:pre-wrap;font-family:Georgia,serif;color:#0E2A47;background:#EAF4FB;padding:16px;border-radius:8px;border:1px solid #CFE0F0">${(letter || "").replace(/</g, "&lt;")}</pre>`}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </section>
            <section className="max-w-5xl mx-auto px-4 sm:px-8"><ToolExplainer toolKey="reassessment-letter" /></section>
            <ToolRelatedLinks slug="reassessment-letter" />
            <Footer />
        </div>
    );
}
