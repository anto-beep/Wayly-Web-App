import React, { useState, useEffect } from "react";
import useScrollToResult from "@/hooks/useScrollToResult";
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
import AIAccuracyBanner, { TOOL_DISCLAIMERS } from "@/components/AIAccuracyBanner";
import UploadGuardNotice from "@/components/UploadGuardNotice";
import { api } from "@/lib/api";
import { Loader2, Sparkles, Check, X, FolderOpen, BookmarkPlus, Upload, File as FileIcon, Trash2, AlertOctagon, ShieldAlert, Shield, ShieldCheck, Download, Mail, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AutomatedDecisionDisclosure, isEnabled } from "@/uxf";

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

const _ddmmyyyy = (iso) => {
    if (!iso) return iso;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

// Findings: urgent first. compliance → warning/other → info.
function cpSeverityRank(f) {
    const s = (f?.severity || "").toLowerCase();
    if (s === "compliance") return 0;
    if (s === "info") return 2;
    return 1;
}
function cpSeverityMeta(f) {
    const s = (f?.severity || "").toLowerCase();
    if (s === "compliance") return { color: "#B23A2E", tint: "rgba(178,58,46,0.08)", Icon: AlertOctagon, label: "Needs attention" };
    if (s === "info") return { color: "#0E4D52", tint: "rgba(14,77,82,0.08)", Icon: Shield, label: "Good to know" };
    return { color: "#A5512B", tint: "rgba(165,81,43,0.08)", Icon: ShieldAlert, label: "Worth checking" };
}

// Goals → My Care Goals. Lists plan goals (or suggests some from services when
// none are written in the plan) and lets the user add each to the goal ledger,
// which then shows on the Participant Profile.
function CpGoalsSection({ goals, services, addedGoals, goalError, onAdd, participant }) {
    const hasGoals = (goals || []).length > 0;
    let suggested = [];
    if (!hasGoals) {
        const seen = new Set();
        for (const s of services || []) {
            const d = (s?.description || "").trim();
            if (!d || seen.has(d.toLowerCase())) continue;
            seen.add(d.toLowerCase());
            suggested.push(`Keep getting help with ${d.toLowerCase()} so I can stay independent at home.`);
            if (suggested.length >= 4) break;
        }
        if (suggested.length === 0) {
            suggested = [
                "Stay living safely in my own home.",
                "Keep up my social connections and the activities I enjoy.",
                "Stay on top of my health and any appointments.",
            ];
        }
    }
    const items = hasGoals ? goals : suggested;
    const goalType = hasGoals ? "self_directed_participant_stated" : "other";

    const Row = ({ text }) => {
        const state = addedGoals[text];
        return (
            <li className="flex items-start justify-between gap-3 rounded-xl bg-white/10 p-3" data-testid="cp-goal-row">
                <span className="text-sm text-white flex-1">{text}</span>
                {state === "done" ? (
                    <span className="inline-flex items-center gap-1 text-xs text-white bg-white/20 rounded-full px-3 py-1.5"><Check className="h-3.5 w-3.5" /> Added</span>
                ) : (
                    <button
                        onClick={() => onAdd(text, goalType)}
                        disabled={state === "adding"}
                        data-testid="cp-goal-add"
                        className="inline-flex items-center gap-1 text-xs font-semibold bg-white text-[#0E4D52] rounded-full px-3 py-1.5 disabled:opacity-60 shrink-0"
                    >
                        {state === "adding" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookmarkPlus className="h-3.5 w-3.5" />}
                        Add to My Care Goals
                    </button>
                )}
            </li>
        );
    };

    return (
        <div className="panel-solid-teal rounded-2xl p-6" data-testid="cp-goals">
            <div className="text-xs uppercase tracking-wider text-white/80">My Care Goals</div>
            {hasGoals ? (
                <p className="text-sm text-white/90 mt-1">We found {goals.length} goal{goals.length === 1 ? "" : "s"} in this plan. Add the ones that matter so they show on the profile.</p>
            ) : (
                <p className="text-sm text-white/90 mt-1">No goals were written in this plan. Here are some you might want, based on the services. Add any that fit.</p>
            )}
            <ul className="mt-3 space-y-2">
                {items.map((t, i) => <Row key={i} text={t} />)}
            </ul>
            {goalError && <p className="text-sm text-white mt-2 bg-white/10 rounded-lg p-2" data-testid="cp-goal-error">{goalError}</p>}
            {!participant?.id && (
                <p className="text-xs text-white/70 mt-2">Tip: choose a participant on your profile so goals save to the right person.</p>
            )}
        </div>
    );
}


export default function CarePlanReviewer() {
    const access = useToolAccess();
    const navigate = useNavigate();
    const { active: activeParticipant } = useParticipants();
    const [bands, setBands] = useState([]);
    const [prefilled, setPrefilled] = useState(false);
    const [downloadBusy, setDownloadBusy] = useState(false);
    const [letterBusyKey, setLetterBusyKey] = useState(null);
    const PROGRESS_STAGES = ["Reading the document", "Checking against Support at Home rules", "Building your summary"];
    const [progressStage, setProgressStage] = useState(0);
    const [text, setText] = useState("");
    const [classification, setClassification] = useState("");
    const [quarterlyBudget, setQuarterlyBudget] = useState("");
    // Display currency with AU grouping + 2 decimals (e.g. 12,341.32). The
    // stored string may carry commas; every submit path strips them.
    const fmtQb = (n) => Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!loading) { setProgressStage(0); return undefined; }
        const id = setInterval(() => setProgressStage((s) => Math.min(s + 1, PROGRESS_STAGES.length - 1)), 7000);
        return () => clearInterval(id);
    }, [loading]);   // eslint-disable-line react-hooks/exhaustive-deps
    const [result, setResult] = useState(null);
    const [saving, setSaving] = useState(false);
    const [savedPlanId, setSavedPlanId] = useState(null);
    const [saveError, setSaveError] = useState("");

    // Multi-file upload state (Section B)
    const [files, setFiles] = useState([]);      // File[]
    const [fileResult, setFileResult] = useState(null);    // {findings, extraction, per_file_meta}
    const [fileError, setFileError] = useState("");
    const [guard, setGuard] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const resultRef = useScrollToResult(Boolean(result));
    const fileResultRef = useScrollToResult(Boolean(fileResult));

    // Load classification budget bands (for prefilling the quarterly budget).
    useEffect(() => {
        let off = false;
        api.get("/public/csc/bands").then(({ data }) => { if (!off) setBands(data?.bands || []); }).catch(() => {});
        return () => { off = true; };
    }, []);

    // Prefill classification + quarterly budget from the active participant so
    // the review is grounded without the user re-typing what Wayly already knows.
    useEffect(() => {
        const pc = activeParticipant?.classification;
        if (!pc) return;
        setClassification((prev) => prev || String(pc));
        const band = (bands || []).find((b) => b.classification === Number(pc));
        if (band?.quarterly_budget) {
            setQuarterlyBudget((prev) => prev || fmtQb(band.quarterly_budget));
            setPrefilled(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeParticipant?.classification, bands]);

    const ALLOWED = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "text/plain"];
    const MAX_BYTES = 20 * 1024 * 1024;
    const MAX_FILES = 5;

    const validateAndAddFiles = (incoming) => {
        setFileError("");
        setGuard(null);
        const list = Array.from(incoming || []);
        const combined = [...files, ...list].slice(0, MAX_FILES);
        for (const f of list) {
            if (f.size > MAX_BYTES) {
                setFileError(`${f.name} is over 20 MB. Please compress or split.`);
                return;
            }
            if (!ALLOWED.some((p) => (f.type || "").startsWith(p)) &&
                !/\.(pdf|docx|jpg|jpeg|png|webp|heic|heif|txt)$/i.test(f.name)) {
                setFileError(`${f.name} is not a supported type. Use PDF, DOCX, JPG, PNG, HEIC, WebP, or TXT.`);
                return;
            }
        }
        if (files.length + list.length > MAX_FILES) {
            setFileError(`Up to ${MAX_FILES} files per submission.`);
        }
        setFiles(combined);
    };

    const onDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        validateAndAddFiles(e.dataTransfer?.files);
    };
    const onDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    };
    const onDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };
    const removeFile = (idx) => setFiles(files.filter((_, i) => i !== idx));

    // Poll a background review job until it finishes. The review LLM call runs
    // ~40-60s which exceeds the gateway timeout, so the backend runs it async
    // and we poll here instead of holding one long request open. Tolerant of
    // transient backend slowness: a single failed/slow poll is retried, not
    // fatal, so a brief overload never surfaces as a hard timeout to the user.
    const pollReviewJob = async (jobId, { tries = 80, intervalMs = 3000 } = {}) => {
        let consecutiveErrors = 0;
        for (let i = 0; i < tries; i++) {
            await new Promise((r) => setTimeout(r, intervalMs));
            try {
                const { data } = await api.get(`/public/care-plans/review-jobs/${jobId}`, { timeout: 20000 });
                consecutiveErrors = 0;
                if (data?.status === "done") return data.result;
                if (data?.status === "error") throw new Error(data.error || "Review failed.");
            } catch (e) {
                // A job that reported status "error" is a real failure — surface it.
                if (e?.message && !e?.response && !/timeout|network/i.test(e.message) && !e?.code) throw e;
                // Otherwise (timeout / network blip) keep polling; bail only if it persists.
                consecutiveErrors += 1;
                if (consecutiveErrors >= 8) throw new Error("We lost connection while reviewing. Please try again.");
            }
        }
        throw new Error("The review is taking longer than expected. Please try again.");
    };

    const submitFiles = async () => {
        setLoading(true);
        setFileError("");
        setFileResult(null);
        setResult(null);
        setGuard(null);
        try {
            const fd = new FormData();
            files.forEach((f) => fd.append("files", f));
            if (classification) fd.append("classification", String(parseInt(classification, 10)));
            if (quarterlyBudget) fd.append("quarterly_budget", String(parseFloat(String(quarterlyBudget).replace(/,/g, ""))));
            const { data: job } = await api.post("/public/care-plans/review-files-async", fd, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 90000,
            });
            const data = await pollReviewJob(job.job_id);
            if (data?.upload_guard) { setGuard(data.upload_guard); return; }
            setFileResult(data);
        } catch (e) {
            setFileError(e?.response?.data?.detail || e?.message || "Review failed.");
        } finally {
            setLoading(false);
        }
    };

    const saveUploadedPlan = async () => {
        setSaving(true);
        setSaveError("");
        try {
            const fd = new FormData();
            files.forEach((f) => fd.append("files", f));
            if (classification) fd.append("classification", String(parseInt(classification, 10)));
            if (quarterlyBudget) fd.append("quarterly_budget", String(parseFloat(String(quarterlyBudget).replace(/,/g, ""))));
            const { data } = await api.post("/care-plans/upload-files", fd, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 120000,
            });
            if (data?.upload_guard) { setGuard(data.upload_guard); return; }
            setSavedPlanId(data?.care_plan_id);
        } catch (e) {
            setSaveError(e?.response?.data?.detail || e?.message || "Save failed.");
        } finally {
            setSaving(false);
        }
    };

    const savePlan = async () => {
        setSaving(true);
        setSaveError("");
        try {
            const payload = { text };
            if (classification) payload.classification = parseInt(classification, 10);
            if (quarterlyBudget) payload.quarterly_budget = parseFloat(String(quarterlyBudget).replace(/,/g, ""));
            const { data } = await api.post("/care-plans/upload", payload);
            setSavedPlanId(data?.care_plan_id);
        } catch (e) {
            setSaveError(e?.response?.data?.detail || e?.message || "Save failed.");
        } finally {
            setSaving(false);
        }
    };

    const draftAllFindings = async () => {
        setLetterBusyKey("all");
        try {
            const { data } = await api.post("/care-plans/letter-from-findings", {
                findings: fileResult?.findings || [],
                provider_name: fileResult?.extraction?.provider_name || null,
                participant_id: activeParticipant?.id || null,
            });
            if (data?.editor_path) navigate(data.editor_path);
        } catch (e) {
            alert(e?.response?.data?.detail || e?.message || "Could not start the letter.");
        } finally {
            setLetterBusyKey(null);
        }
    };

    const downloadSummary = async () => {
        setDownloadBusy(true);
        try {
            const { data } = await api.post("/care-plans/summary.pdf", {
                extraction: fileResult?.extraction || {},
                findings: fileResult?.findings || [],
                verification_panel: fileResult?.verification_panel || null,
                plan_summary: fileResult?.plan_summary || null,
                provider_name: fileResult?.extraction?.provider_name || null,
            }, { responseType: "blob" });
            const url = window.URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `wayly-care-plan-review-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            alert(e?.response?.data?.detail || e?.message || "Download failed.");
        } finally {
            setDownloadBusy(false);
        }
    };

    // --- Goals → My Care Goals + Ask a question (results screen) ---
    const [addedGoals, setAddedGoals] = useState({}); // text -> "adding"|"done"|"error"
    const [openFinding, setOpenFinding] = useState(null);
    const [goalError, setGoalError] = useState("");
    const [askQ, setAskQ] = useState("");
    const [askBusy, setAskBusy] = useState(false);
    const [askAnswer, setAskAnswer] = useState("");
    const [askError, setAskError] = useState("");

    const addGoalToCareGoals = async (text, goalType = "other") => {
        const pid = activeParticipant?.id;
        if (!pid) { setGoalError("Choose or add a participant on your profile first, then goals can be saved."); return; }
        setGoalError("");
        setAddedGoals((p) => ({ ...p, [text]: "adding" }));
        try {
            await api.post(`/cpr2/participants/${pid}/goals`, {
                goal_text: text,
                goal_type: goalType,
                original_extracted_text: text,
                first_extracted_from_plan_id: savedPlanId || null,
                extraction_confidence: "medium",
                user_confirmed_at_extraction: true,
            });
            setAddedGoals((p) => ({ ...p, [text]: "done" }));
        } catch (e) {
            setAddedGoals((p) => ({ ...p, [text]: "error" }));
            setGoalError(e?.response?.data?.detail || "Could not add that goal.");
        }
    };

    const askAboutPlan = async () => {
        const q = askQ.trim();
        if (!q) return;
        setAskBusy(true); setAskError(""); setAskAnswer("");
        try {
            const { data } = await api.post("/care-plans/ask", {
                question: q,
                plan_summary: fileResult?.plan_summary || result?.plan_summary || null,
                findings: (fileResult?.findings || result?.findings || []),
                extraction: fileResult?.extraction || {},
            });
            setAskAnswer(data?.answer || "Wayly could not find an answer in this plan.");
        } catch (e) {
            setAskError(e?.response?.data?.detail || "Could not answer just now. Please try again.");
        } finally {
            setAskBusy(false);
        }
    };


    const submit = async () => {
        setLoading(true);
        setResult(null);
        setFileResult(null);
        setGuard(null);
        try {
            const payload = { text };
            if (classification) payload.classification = parseInt(classification, 10);
            if (quarterlyBudget) payload.quarterly_budget = parseFloat(String(quarterlyBudget).replace(/,/g, ""));
            // Migrated to the new findings-shape endpoint so text-paste and
            // file-upload flows share the same rendering path.
            const { data: job } = await api.post("/public/care-plans/review-async", payload, { timeout: 90000 });
            const data = await pollReviewJob(job.job_id);
            if (data?.upload_guard) { setGuard(data.upload_guard); return; }
            setFileResult(data);        // Reuse the unified findings renderer
        } catch (e) {
            const detail = e?.response?.data?.detail;
            setResult({ error: typeof detail === "string" ? detail : (detail?.message || e?.message || "Review failed.") });
        } finally { setLoading(false); }
    };

    if (access === "loading") return (<div className="min-h-screen bg-kindred"><SeoHead {...SEO.toolCarePlan} jsonLd={_toolJsonLd(SEO.toolCarePlan)} />
            <MarketingHeader /><div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /></div><ToolRelatedLinks slug="care-plan-reviewer" />
            <Footer /></div>);
    if (access === "blocked") return (<div className="min-h-screen bg-kindred"><SeoHead {...SEO.toolCarePlan} jsonLd={_toolJsonLd(SEO.toolCarePlan)} />
    <MarketingHeader /><ToolHero toolKey="care-plan-reviewer" /><ToolGate toolName="Support Plan Reviewer"><ScreenshotStatement /></ToolGate><section className="max-w-5xl mx-auto px-4 sm:px-8"><ToolExplainer toolKey="care-plan-reviewer" /></section><ToolRelatedLinks slug="care-plan-reviewer" />
            <Footer /></div>);

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolCarePlan} jsonLd={_toolJsonLd(SEO.toolCarePlan)} />
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-12 pb-6">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k">← All AI Tools</Link>
                    {access === "allowed" && (
                        <Link
                            to="/app/care-plans"
                            className="inline-flex items-center gap-1.5 text-sm text-primary-k hover:underline"
                            data-testid="link-saved-plans"
                        >
                            <FolderOpen className="h-4 w-4" />
                            Your saved plans
                        </Link>
                    )}
                </div>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight">Support Plan Reviewer</h1>
                <p className="mt-4 text-lg text-muted-k leading-relaxed max-w-3xl">Upload your care plan. Wayly checks it against Support at Home rules and the Statement of Rights, flags the gaps, and gets you ready for your provider meeting.</p>
            </section>

            <section className="mx-auto max-w-6xl px-6 pb-20">
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="care-plan-form">
                    {/* File upload zone (Section B) */}
                    <div className="mb-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs uppercase tracking-wider text-muted-k">Upload files (recommended)</span>
                            <span className="text-[10px] text-muted-k">PDF · DOCX · JPG · PNG · HEIC · WebP · up to 5 files · 20 MB each</span>
                        </div>
                        <label
                            onDrop={loading ? (e) => { e.preventDefault(); } : onDrop}
                            onDragOver={loading ? (e) => { e.preventDefault(); } : onDragOver}
                            onDragLeave={onDragLeave}
                            className={`block rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                                loading ? "opacity-50 pointer-events-none cursor-not-allowed" : "cursor-pointer"
                            } ${
                                dragActive ? "border-primary-k bg-primary-k/5" : "border-kindred hover:border-primary-k/50 bg-surface-2"
                            }`}
                            data-testid="cp-dropzone"
                            aria-disabled={loading}
                        >
                            <input
                                type="file"
                                multiple
                                disabled={loading}
                                accept=".pdf.docx.jpg.jpeg.png.webp.heic.heif.txt"
                                onChange={(e) => validateAndAddFiles(e.target.files)}
                                className="hidden"
                                data-testid="cp-file-input"
                            />
                            <Upload className="h-6 w-6 mx-auto text-muted-k" />
                            <div className="mt-2 text-sm text-primary-k">
                                <span className="font-medium">{loading ? "Review in progress — attaching is locked" : "Drop your care plan files here"}</span>
                                {!loading && <span className="text-muted-k"> or click to browse</span>}
                            </div>
                        </label>
                        {files.length > 0 && (
                            <ul className="mt-3 space-y-1.5" data-testid="cp-file-list">
                                {files.map((f, i) => (
                                    <li key={i} className="flex items-center justify-between gap-2 bg-surface-2 border border-kindred rounded-lg px-3 py-2 text-sm">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <FileIcon className="h-4 w-4 text-muted-k flex-shrink-0" />
                                            <span className="truncate text-primary-k">{f.name}</span>
                                            <span className="text-xs text-muted-k flex-shrink-0">
                                                {(f.size / 1024 / 1024).toFixed(2)} MB
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeFile(i)}
                                            disabled={loading}
                                            className="text-muted-k hover:text-terracotta disabled:opacity-40 disabled:cursor-not-allowed"
                                            aria-label={`Remove ${f.name}`}
                                            data-testid={`cp-file-remove-${i}`}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {fileError && (
                            <div className="mt-2 text-xs text-terracotta" data-testid="cp-file-error">{fileError}</div>
                        )}
                    </div>

                    {/* Or divider */}
                    <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 h-px bg-kindred" />
                        <span className="text-xs text-muted-k uppercase tracking-wider">or paste text</span>
                        <div className="flex-1 h-px bg-kindred" />
                    </div>

                    <textarea value={text} onChange={(e) => setText(e.target.value)} rows={files.length > 0 ? 4 : 12} disabled={files.length > 0} placeholder={files.length > 0 ? "Text paste disabled while files are attached." : "Paste the full text of the care plan here…"} data-testid="cp-text" className="w-full rounded-md border border-kindred bg-surface-2 p-3 text-sm focus:outline-none focus:ring-2 ring-primary-k disabled:opacity-50" />
                    <div className="mt-3 grid sm:grid-cols-2 gap-3" data-testid="cp-optional-context">
                        <label className="block">
                            <span className="text-xs text-muted-k">Classification level (optional, improves the review)</span>
                            <select value={classification} onChange={(e) => {
                                const val = e.target.value;
                                setClassification(val);
                                const band = (bands || []).find((b) => b.classification === Number(val));
                                if (band?.quarterly_budget != null) {
                                    setQuarterlyBudget(fmtQb(band.quarterly_budget));
                                    setPrefilled(false);
                                }
                            }} data-testid="cp-classification" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k">
                                <option value="">Choose a classification</option>
                                {[1,2,3,4,5,6,7,8].map((c) => <option key={c} value={c}>Classification {c}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs text-muted-k">Quarterly budget ($), optional</span>
                            <div className="relative mt-1">
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-k">$</span>
                                <input type="text" inputMode="decimal" value={quarterlyBudget} onChange={(e) => setQuarterlyBudget(e.target.value.replace(/[^0-9.,]/g, ""))} onBlur={() => setQuarterlyBudget((v) => { const num = parseFloat(String(v).replace(/,/g, "")); return isNaN(num) ? "" : fmtQb(num); })} placeholder="e.g. 12,341.32" data-testid="cp-quarterly-budget" className="w-full rounded-md border border-kindred bg-surface pl-7 pr-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 ring-primary-k" />
                            </div>
                        </label>
                    </div>
                    {prefilled && (classification || quarterlyBudget) && (
                        <p className="mt-2 text-xs text-sage inline-flex items-center gap-1.5" data-testid="cp-prefilled-hint">
                            <Check className="h-3.5 w-3.5" /> Prefilled from {activeParticipant?.name || "your profile"}. Change these if the plan is different.
                        </p>
                    )}
                    <button onClick={files.length > 0 ? submitFiles : submit} disabled={loading || (files.length === 0 && text.length < 50)} data-testid="cp-submit" className="mt-4 w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#091D33] disabled:opacity-60 inline-flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Reviewing…" : (files.length > 0 ? `Review ${files.length} file${files.length === 1 ? "" : "s"}` : "Review my care plan")}
                    </button>
                </div>

                {loading && (
                    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-primary-k/20 sect-teal p-4 animate-fade-up" data-testid="cp-progress">
                        <Loader2 className="h-5 w-5 animate-spin text-primary-k shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <div className="font-semibold text-primary-k" data-testid="cp-progress-stage">{PROGRESS_STAGES[progressStage]}…</div>
                            <div className="text-sm text-primary-k/70 mt-0.5">This usually takes about a minute. You can leave this screen and come back; we&apos;ll save the result to your list.</div>
                            <div className="mt-2 flex items-center gap-1.5">
                                {PROGRESS_STAGES.map((_, i) => (
                                    <span key={i} className={`h-1.5 rounded-full transition-colors ${i <= progressStage ? "w-8 bg-primary-k" : "w-4 bg-primary-k/20"}`} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* UPLOAD-GUARD-1 verdict (wrong-tool redirect) */}
                {guard && (
                    <div className="mt-6">
                        <UploadGuardNotice verdict={guard} onChooseAnother={() => { setFiles([]); setGuard(null); }} />
                    </div>
                )}

                {/* File-upload result: Section B.3 Preview + Section E findings */}
                {fileResult && (
                    <div ref={fileResultRef} className="mt-6 space-y-5 animate-fade-up scroll-mt-20" data-testid="cp-file-result">
                        {/* B.3 Preview what was read */}
                        <div className="section-teal-soft border border-kindred rounded-xl p-5" data-testid="cp-preview">
                            <div className="overline">Preview, what we read</div>
                            <div className="mt-3 grid sm:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-k mb-1">Plan dates</div>
                                    <div className="space-y-0.5">
                                        <div><strong>Effective:</strong> {_ddmmyyyy(fileResult.extraction?.effective_from) || "Not stated in document"}{fileResult.extraction?.effective_to && ` → ${_ddmmyyyy(fileResult.extraction.effective_to)}`}</div>
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-k mb-1">Files processed</div>
                                    <ul className="space-y-0.5">
                                        {(fileResult.per_file_meta || []).map((m, i) => (
                                            <li key={i} className="text-xs">
                                                <FileIcon className="h-3 w-3 inline text-muted-k mr-1" />
                                                {m.filename} · <span className="text-muted-k">{m.input_method}, {m.page_count} pg, {m.text_length.toLocaleString()} chars</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                            {fileResult.extraction?.services?.length > 0 && (
                                <div className="mt-4">
                                    <div className="text-xs uppercase tracking-wider text-muted-k mb-2">Services identified ({fileResult.extraction.services.length})</div>
                                    <div className="grid sm:grid-cols-2 gap-2">
                                        {fileResult.extraction.services.map((s, i) => (
                                            <div key={i} className="text-xs bg-surface-2 rounded px-2 py-1.5">
                                                <span className="text-primary-k font-medium">{s.description}</span>
                                                <span className="text-muted-k"> · {s.stream}</span>
                                                {s.frequency_text && <span className="text-muted-k"> · {s.frequency_text}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {fileResult.extraction?.unread_sections?.length > 0 && (
                                <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3">
                                    <div className="text-xs uppercase tracking-wider text-amber-800 mb-1">Sections we could not read cleanly</div>
                                    <ul className="text-xs text-amber-900 space-y-0.5">
                                        {fileResult.extraction.unread_sections.map((u, i) => <li key={i}>· {u}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* Plan overview — colourful, a bit more detail */}
                        {(fileResult.plan_summary || (fileResult.findings || []).length >= 0) && (
                            <div className="panel-solid-teal rounded-2xl p-6" data-testid="cp-plan-summary">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="text-xs uppercase tracking-wider text-white/80">Plan overview</div>
                                    <button
                                        onClick={downloadSummary}
                                        disabled={downloadBusy}
                                        data-testid="cp-download-summary"
                                        className="inline-flex items-center gap-1.5 text-xs bg-white text-[#0E4D52] rounded-full px-3 py-1.5 font-semibold hover:bg-white/90 disabled:opacity-60"
                                    >
                                        {downloadBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                        {downloadBusy ? "Preparing…" : "Download summary"}
                                    </button>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {fileResult.extraction?.provider_name && (
                                        <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white">Provider: {fileResult.extraction.provider_name}</span>
                                    )}
                                    {fileResult.extraction?.classification && (
                                        <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white">Level {fileResult.extraction.classification}</span>
                                    )}
                                    {(() => {
                                        const official = fileResult.verification_panel?.classification_quarterly_budget;
                                        const val = official ?? fileResult.extraction?.quarterly_budget;
                                        if (!val) return null;
                                        return (
                                            <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white">${Number(val).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / quarter</span>
                                        );
                                    })()}
                                    {(fileResult.extraction?.services || []).length > 0 && (
                                        <span className="rounded-full bg-white/15 px-3 py-1 text-xs text-white">{fileResult.extraction.services.length} service{fileResult.extraction.services.length === 1 ? "" : "s"}</span>
                                    )}
                                </div>
                                {fileResult.plan_summary && (
                                    <p className="mt-3 text-sm text-white/95 leading-relaxed">{fileResult.plan_summary}</p>
                                )}
                            </div>
                        )}

                        {/* Findings — urgent first, colour-coded, white text */}
                        <div className="rounded-2xl bg-surface border border-kindred p-6" data-testid="cp-file-findings">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                    <div className="overline">What we found</div>
                                    <p className="text-sm text-muted-k mt-0.5">The most important things to look at, most urgent first.</p>
                                </div>
                                {access === "allowed" && (fileResult.findings || []).length > 0 && (
                                    <button
                                        onClick={draftAllFindings}
                                        disabled={letterBusyKey === "all"}
                                        data-testid="cp-draft-letter-all"
                                        className="inline-flex items-center gap-1.5 text-sm rounded-full bg-wayly-clay-500 text-white px-4 py-2 font-semibold transition disabled:opacity-60"
                                    >
                                        {letterBusyKey === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                        Draft a letter about these
                                    </button>
                                )}
                            </div>
                            {(fileResult.findings || []).length > 0 && (() => {
                                const fs = fileResult.findings || [];
                                const urgent = fs.filter((f) => cpSeverityRank(f) === 0).length;
                                const check = fs.filter((f) => cpSeverityRank(f) === 1).length;
                                const info = fs.filter((f) => cpSeverityRank(f) === 2).length;
                                const Chip = ({ n, color, label }) => n > 0 ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: color }}>
                                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/25 text-[10px]">{n}</span>{label}
                                    </span>
                                ) : null;
                                return (
                                    <div className="mt-3 flex flex-wrap gap-2" data-testid="cp-findings-tally">
                                        <Chip n={urgent} color="#B23A2E" label="Need attention" />
                                        <Chip n={check} color="#A5512B" label="Worth checking" />
                                        <Chip n={info} color="#0E4D52" label="Good to know" />
                                    </div>
                                );
                            })()}
                            {(result?.safety_notice || fileResult?.safety_notice) && (
                                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-300 p-3" data-testid="cp-safety-banner">
                                    <div className="text-sm font-semibold text-amber-900">{(result?.safety_notice || fileResult?.safety_notice).title}</div>
                                    <p className="text-xs text-amber-900 mt-1 leading-relaxed">{(result?.safety_notice || fileResult?.safety_notice).body}</p>
                                </div>
                            )}
                            {(fileResult.findings || []).length === 0 ? (
                                (() => {
                                    const _vp = fileResult.verification_panel || {};
                                    const _checks = _vp.checks || [];
                                    const _flags = _checks.filter((c) => c.status === "flag").length;
                                    const _cannot = _checks.filter((c) => c.status === "cannot_run").length;
                                    if (_flags === 0 && _cannot === 0) {
                                        return (
                                            <div className="mt-4 rounded-xl panel-solid-sage p-5 text-white" data-testid="cp-no-findings">
                                                <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" /> Nothing needs your attention</div>
                                                <p className="text-sm text-white/90 mt-1">We ran every check and did not spot any issues in this plan. That is good news.</p>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div className="mt-4 rounded-xl panel-solid-clay p-5 text-white" data-testid="cp-no-findings-but-checks">
                                            <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-5 w-5" /> A few things worth a look</div>
                                            <p className="text-sm text-white/90 mt-1">
                                                We did not raise separate findings, but {_flags > 0 ? `${_flags} safety check${_flags === 1 ? "" : "s"} need a look` : ""}{_flags > 0 && _cannot > 0 ? " and " : ""}{_cannot > 0 ? `${_cannot} could not run because the plan did not state something` : ""}. See the safety checks below.
                                            </p>
                                        </div>
                                    );
                                })()
                            ) : (
                                <ul className="mt-4 space-y-2.5">
                                    {[...(fileResult.findings || [])]
                                        .map((f, i) => ({ f, i }))
                                        .sort((a, b) => cpSeverityRank(a.f) - cpSeverityRank(b.f))
                                        .map(({ f, i }) => {
                                            const m = cpSeverityMeta(f);
                                            const Icon = m.Icon;
                                            const open = openFinding === i;
                                            return (
                                                <li key={i} className="rounded-2xl bg-surface border border-kindred overflow-hidden" style={{ borderLeft: `4px solid ${m.color}` }} data-testid={`cp-finding-${i}`}>
                                                    <button
                                                        onClick={() => setOpenFinding(open ? null : i)}
                                                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-2 transition-colors"
                                                        data-testid={`cp-finding-toggle-${i}`}
                                                        aria-expanded={open}
                                                    >
                                                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full shrink-0" style={{ backgroundColor: m.color }}>
                                                            <Icon className="h-4 w-4 text-white" />
                                                        </span>
                                                        <span className="flex-1 min-w-0">
                                                            <span className="block text-[10px] uppercase tracking-wider font-semibold" style={{ color: m.color }}>{m.label}</span>
                                                            <span className="block font-semibold text-primary-k leading-snug">{f.title}</span>
                                                        </span>
                                                        <ChevronDown className={`h-5 w-5 text-muted-k shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                                                    </button>
                                                    {open && (
                                                        <div className="px-4 pb-4 sm:pl-16 space-y-3" data-testid={`cp-finding-body-${i}`}>
                                                            <p className="text-sm text-primary-k leading-relaxed">{f.detail}</p>
                                                            {f.suggested_question && (
                                                                <div className="rounded-lg p-3" style={{ backgroundColor: m.tint }}>
                                                                    <div className="text-[10px] uppercase tracking-wider text-muted-k">What to ask your provider</div>
                                                                    <p className="text-sm text-primary-k mt-0.5">{f.suggested_question}</p>
                                                                </div>
                                                            )}
                                                            {f.citation_source && (
                                                                <div className="text-[11px] text-muted-k">From the plan: {f.citation_source}</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        })}
                                </ul>
                            )}
                        </div>

                        {/* Goals → My Care Goals */}
                        <CpGoalsSection
                            goals={fileResult.extraction?.goals || []}
                            services={fileResult.extraction?.services || []}
                            addedGoals={addedGoals}
                            goalError={goalError}
                            onAdd={addGoalToCareGoals}
                            participant={activeParticipant}
                        />

                        {/* Verification checks — after findings, redesigned */}
                        {fileResult.verification_panel?.checks?.length > 0 && (
                            <div className="rounded-2xl bg-surface border border-kindred p-6" data-testid="cp-verification-panel">
                                <div className="overline">Safety checks we ran</div>
                                <p className="mt-1 text-sm text-muted-k">Five Support at Home checks we run on every plan. A tick means we confirmed it, not just that nothing was said.</p>
                                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                                    {fileResult.verification_panel.checks.map((c) => {
                                        const meta = {
                                            pass: { panel: "panel-solid-sage", Icon: ShieldCheck, label: "All good" },
                                            flag: { panel: "panel-solid-clay", Icon: AlertOctagon, label: "Worth a look" },
                                            cannot_run: { panel: "bg-surface-2 border border-kindred", Icon: ShieldAlert, label: "Need more info", dark: true },
                                        }[c.status] || { panel: "bg-surface-2 border border-kindred", Icon: ShieldAlert, label: c.status, dark: true };
                                        const Icon = meta.Icon;
                                        return (
                                            <div key={c.check} data-testid={`cp-check-${c.check}`} className={`rounded-xl p-4 ${meta.panel} ${meta.dark ? "" : "text-white"}`}>
                                                <div className="flex items-center gap-2">
                                                    <Icon className={`h-4 w-4 shrink-0 ${meta.dark ? "text-gold" : "text-white"}`} />
                                                    <span className={`text-sm font-semibold ${meta.dark ? "text-primary-k" : "text-white"}`}>{c.label}</span>
                                                    <span className={`ml-auto text-[9px] uppercase tracking-wider rounded-full px-2 py-0.5 ${meta.dark ? "bg-amber-100 text-primary-k" : "bg-white/20 text-white"}`}>{meta.label}</span>
                                                </div>
                                                <p className={`text-xs mt-1.5 leading-relaxed ${meta.dark ? "text-muted-k" : "text-white/90"}`}>{c.detail}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Ask a question about this plan */}
                        {access === "allowed" && (
                            <div className="panel-solid-clay rounded-2xl p-6" data-testid="cp-ask">
                                <div className="text-xs uppercase tracking-wider text-white/80">Ask about this plan</div>
                                <p className="text-sm text-white/90 mt-1">Not sure what something means? Ask in your own words and Wayly will answer from this plan.</p>
                                <div className="mt-3 flex gap-2">
                                    <input
                                        type="text"
                                        value={askQ}
                                        onChange={(e) => setAskQ(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") askAboutPlan(); }}
                                        placeholder="e.g. What does my provider have to do?"
                                        data-testid="cp-ask-input"
                                        className="flex-1 rounded-full px-4 py-2.5 text-sm text-primary-k bg-white focus:outline-none"
                                    />
                                    <button
                                        onClick={askAboutPlan}
                                        disabled={askBusy || !askQ.trim()}
                                        data-testid="cp-ask-submit"
                                        className="inline-flex items-center gap-1.5 rounded-full bg-white text-[#A5512B] px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                                    >
                                        {askBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                        Ask
                                    </button>
                                </div>
                                {askError && <p className="text-sm text-white mt-2 bg-white/10 rounded-lg p-2">{askError}</p>}
                                {askAnswer && (
                                    <div className="mt-3 rounded-xl bg-white p-4 text-sm text-primary-k leading-relaxed" data-testid="cp-ask-answer">{askAnswer}</div>
                                )}
                            </div>
                        )}

                        <ReportIssueButton variant="inline" toolName="Support Plan Reviewer" toolOutput={fileResult} />

                        {access === "allowed" && (
                            <div className="bg-cream border border-kindred rounded-xl p-5" data-testid="cp-save-file-cta">
                                {savedPlanId ? (
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-2 text-sm text-primary-k">
                                            <Check className="h-4 w-4 text-sage" />
                                            Plan saved to your Care Plans register.
                                        </div>
                                        <Link
                                            to={`/app/care-plans/${savedPlanId}`}
                                            className="text-sm bg-primary-k text-white rounded-full px-4 py-2 hover:bg-[#091D33]"
                                            data-testid="link-open-saved-file-plan"
                                        >
                                            Open saved plan →
                                        </Link>
                                    </div>
                                ) : (
                                    <>
                                        <div className="font-medium text-primary-k">Save these files for future reviews</div>
                                        <p className="text-sm text-muted-k mt-1 leading-relaxed">
                                            The original files stay in your Care Plans register, together with the review findings and your notes.
                                        </p>
                                        <button
                                            onClick={files.length > 0 ? saveUploadedPlan : savePlan}
                                            disabled={saving}
                                            data-testid="cp-save-files-btn"
                                            className="mt-3 inline-flex items-center gap-2 text-sm bg-primary-k text-white rounded-full px-4 py-2 hover:bg-[#091D33] disabled:opacity-60"
                                        >
                                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                                            {saving ? "Saving…" : "Save this plan"}
                                        </button>
                                        {saveError && <div className="mt-2 text-xs text-terracotta" data-testid="cp-save-files-error">{saveError}</div>}
                                    </>
                                )}
                            </div>
                        )}
                        {access !== "allowed" && (
                            <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                                <div className="font-medium text-primary-k">Save this review and re-run against future legislative updates.</div>
                                <Link to="/signup" className="mt-3 inline-block text-sm bg-primary-k text-white rounded-lg px-5 py-2.5 hover:bg-[#091D33]">Start free trial</Link>
                            </div>
                        )}
                    </div>
                )}

                {result && (
                    <div ref={resultRef} className="mt-6 space-y-5 animate-fade-up scroll-mt-20" data-testid="cp-result">
                        <ToolSummary
                            toolName="Support Plan Reviewer"
                            headline={(() => {
                                const flags = (result.checks || []).filter((c) => c.status === "flag").length;
                                if (flags === 0) return "Your care plan looks fine on the six structured checks.";
                                return `Your care plan has ${flags} thing${flags === 1 ? "" : "s"} worth checking with your provider.`;
                            })()}
                            body={result.summary || "Wayly checked your care plan against six Support at Home rules: budget fit, care management cap, service-list compliance, stream alignment, review-date currency, and goals alignment."}
                            tone={(result.checks || []).some((c) => c.status === "flag") ? "alert" : "success"}
                            testId="cp-summary"
                        />
                        {result.summary && <div className="bg-surface-2 rounded-xl p-5 border border-kindred"><div className="overline">Summary</div><p className="mt-2 text-primary-k leading-relaxed">{result.summary}</p></div>}

                        {result.checks?.length > 0 && (
                            <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="cp-checks">
                                <div className="overline">Six structured checks</div>
                                <ul className="mt-3 space-y-2">
                                    {result.checks.map((c) => {
                                        const label = ({
                                            budget_fit: "Budget fit",
                                            care_management_cap: "Care management cap (10%)",
                                            service_list: "Service-list compliance",
                                            stream_alignment: "Stream alignment",
                                            review_date: "Review-date currency",
                                            goals_alignment: "Goals alignment",
                                        }[c.check]) || c.check;
                                        const pillClass = c.status === "pass"
                                            ? "bg-sage/10 text-sage"
                                            : c.status === "flag"
                                                ? "bg-terracotta/10 text-terracotta"
                                                : "bg-amber-100 text-primary-k";
                                        return (
                                            <li key={c.check} data-testid={`cp-check-${c.check}`} className="flex items-start gap-3 border-b border-kindred pb-2 last:border-0">
                                                <span className={`shrink-0 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 mt-0.5 ${pillClass}`}>{c.status}</span>
                                                <div className="flex-1">
                                                    <div className="text-sm text-primary-k font-medium">{label}</div>
                                                    {c.note && <div className="text-xs text-muted-k mt-0.5 leading-relaxed">{c.note}</div>}
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {result.coverage?.length > 0 && (
                            <div className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Coverage check</div>
                                <ul className="mt-3 space-y-2">
                                    {result.coverage.map((c, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm border-b border-kindred pb-2 last:border-0">
                                            {c.present ? <Check className="h-4 w-4 text-sage mt-0.5" /> : <X className="h-4 w-4 text-terracotta mt-0.5" />}
                                            <div className="flex-1"><span className="text-primary-k font-medium">{c.item}</span>{c.note && <div className="text-xs text-muted-k mt-0.5">{c.note}</div>}</div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {result.gaps?.length > 0 && (
                            <div className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Gaps to raise</div>
                                <ul className="mt-3 space-y-1.5 text-sm text-primary-k list-disc list-inside">{result.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                            </div>
                        )}

                        {result.questions_to_raise?.length > 0 && (
                            <div className="bg-surface border border-kindred rounded-xl p-5">
                                <div className="overline">Questions for the next review</div>
                                <ul className="mt-3 space-y-1.5 text-sm text-primary-k list-disc list-inside">{result.questions_to_raise.map((q, i) => <li key={i}>{q}</li>)}</ul>
                            </div>
                        )}

                        <ReportIssueButton variant="inline" toolName="Support Plan Reviewer" toolOutput={result} />

                        {/* UXF-1 v3 spec 3.23, automated decision disclosure. */}
                        {isEnabled("uxf_v3.disclosure") && (
                            <AutomatedDecisionDisclosure
                                body="These findings were produced automatically by comparing your care plan against the Aged Care Act 2024, the Statement of Rights, and the National Aged Care Quality Standards. This is a preparation aid for your next provider meeting, not a formal audit."
                                contactUrl="/contact"
                                testId="cp-automated-decision"
                            />
                        )}
                        {access === "allowed" && (
                            <div className="bg-cream border border-kindred rounded-xl p-5" data-testid="cp-save-cta">
                                {savedPlanId ? (
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-2 text-sm text-primary-k">
                                            <Check className="h-4 w-4 text-sage" />
                                            Plan saved. You can re-review it any time.
                                        </div>
                                        <Link
                                            to={`/app/care-plans/${savedPlanId}`}
                                            className="text-sm bg-primary-k text-white rounded-full px-4 py-2 hover:bg-[#091D33]"
                                            data-testid="link-open-saved-plan"
                                        >
                                            Open saved plan →
                                        </Link>
                                    </div>
                                ) : (
                                    <>
                                        <div className="font-medium text-primary-k">Save this plan for future reviews</div>
                                        <p className="text-sm text-muted-k mt-1 leading-relaxed">
                                            Storing the plan lets you re-run the review against future legislative updates, take notes, and share findings with the household.
                                        </p>
                                        <button
                                            onClick={savePlan}
                                            disabled={saving}
                                            data-testid="cp-save-btn"
                                            className="mt-3 inline-flex items-center gap-2 text-sm bg-primary-k text-white rounded-full px-4 py-2 hover:bg-[#091D33] disabled:opacity-60"
                                        >
                                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                                            {saving ? "Saving…" : "Save this plan"}
                                        </button>
                                        {saveError && <div className="mt-2 text-xs text-terracotta" data-testid="cp-save-error">{saveError}</div>}
                                    </>
                                )}
                            </div>
                        )}
                        {access !== "allowed" && (
                            <div className="bg-surface-2 rounded-xl p-5 border border-kindred">
                                <div className="font-medium text-primary-k">Want Wayly to watch divergence between this plan and what&apos;s actually delivered?</div>
                                <Link to="/signup" className="mt-3 inline-block text-sm bg-primary-k text-white rounded-lg px-5 py-2.5 hover:bg-[#091D33]">Start free trial</Link>
                            </div>
                        )}
                    </div>
                )}
            </section>
            <section className="max-w-5xl mx-auto px-4 sm:px-8"><ToolExplainer toolKey="care-plan-reviewer" /></section>
            <ToolRelatedLinks slug="care-plan-reviewer" />
            <Footer />
        </div>
    );
}
