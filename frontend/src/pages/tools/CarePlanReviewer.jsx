import React, { useState } from "react";
import useScrollToResult from "@/hooks/useScrollToResult";
import { Link } from "react-router-dom";
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
import { Loader2, Sparkles, Check, X, FolderOpen, BookmarkPlus, Upload, File as FileIcon, Trash2, AlertOctagon, ShieldAlert, Shield, ShieldCheck } from "lucide-react";
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

export default function CarePlanReviewer() {
    const access = useToolAccess();
    const [text, setText] = useState("");
    const [classification, setClassification] = useState("");
    const [quarterlyBudget, setQuarterlyBudget] = useState("");
    const [loading, setLoading] = useState(false);
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
            if (quarterlyBudget) fd.append("quarterly_budget", String(parseFloat(quarterlyBudget)));
            const { data } = await api.post("/public/care-plans/review-files", fd, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 120000,
            });
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
            if (quarterlyBudget) fd.append("quarterly_budget", String(parseFloat(quarterlyBudget)));
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
            if (quarterlyBudget) payload.quarterly_budget = parseFloat(quarterlyBudget);
            const { data } = await api.post("/care-plans/upload", payload);
            setSavedPlanId(data?.care_plan_id);
        } catch (e) {
            setSaveError(e?.response?.data?.detail || e?.message || "Save failed.");
        } finally {
            setSaving(false);
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
            if (quarterlyBudget) payload.quarterly_budget = parseFloat(quarterlyBudget);
            // Migrated to the new findings-shape endpoint so text-paste and
            // file-upload flows share the same rendering path.
            const { data } = await api.post("/public/care-plans/review", payload);
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
            <section className="mx-auto max-w-3xl px-6 pt-12 pb-6">
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
                <p className="mt-4 text-lg text-muted-k leading-relaxed">Paste the care plan text. We will check it against the Statement of Rights (Aged Care Act 2024) and the National Quality Standards, and flag the gaps.</p>
            </section>

            <section className="mx-auto max-w-3xl px-6 pb-20">
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="care-plan-form">
                    {/* File upload zone (Section B) */}
                    <div className="mb-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs uppercase tracking-wider text-muted-k">Upload files (recommended)</span>
                            <span className="text-[10px] text-muted-k">PDF · DOCX · JPG · PNG · HEIC · WebP · up to 5 files · 20 MB each</span>
                        </div>
                        <label
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            className={`block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                                dragActive ? "border-primary-k bg-primary-k/5" : "border-kindred hover:border-primary-k/50 bg-surface-2"
                            }`}
                            data-testid="cp-dropzone"
                        >
                            <input
                                type="file"
                                multiple
                                accept=".pdf.docx.jpg.jpeg.png.webp.heic.heif.txt"
                                onChange={(e) => validateAndAddFiles(e.target.files)}
                                className="hidden"
                                data-testid="cp-file-input"
                            />
                            <Upload className="h-6 w-6 mx-auto text-muted-k" />
                            <div className="mt-2 text-sm text-primary-k">
                                <span className="font-medium">Drop your care plan files here</span>
                                <span className="text-muted-k"> or click to browse</span>
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
                                            className="text-muted-k hover:text-terracotta"
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
                            <select value={classification} onChange={(e) => setClassification(e.target.value)} data-testid="cp-classification" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k">
                                <option value="">Choose a classification</option>
                                {[1,2,3,4,5,6,7,8].map((c) => <option key={c} value={c}>Classification {c}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs text-muted-k">Quarterly budget ($), optional</span>
                            <input type="number" min="0" step="0.01" value={quarterlyBudget} onChange={(e) => setQuarterlyBudget(e.target.value)} placeholder="e.g. 7424.00" data-testid="cp-quarterly-budget" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 ring-primary-k" />
                        </label>
                    </div>
                    <button onClick={files.length > 0 ? submitFiles : submit} disabled={loading || (files.length === 0 && text.length < 50)} data-testid="cp-submit" className="mt-4 w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#091D33] disabled:opacity-60 inline-flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {loading ? "Reviewing…" : (files.length > 0 ? `Review ${files.length} file${files.length === 1 ? "" : "s"}` : "Review my care plan")}
                    </button>
                </div>

                {loading && (
                    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-primary-k/20 bg-cream/60 p-4 animate-fade-up" data-testid="cp-progress">
                        <Loader2 className="h-5 w-5 animate-spin text-primary-k shrink-0 mt-0.5" />
                        <div>
                            <div className="font-semibold text-primary-k">Reviewing the care plan…</div>
                            <div className="text-sm text-primary-k/70 mt-0.5">This usually takes about a minute. We&apos;re checking it against the Statement of Rights and the National Quality Standards, hang tight.</div>
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
                        <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="cp-preview">
                            <div className="overline">Preview, what we read</div>
                            <div className="mt-3 grid sm:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-k mb-1">Plan header</div>
                                    <div className="space-y-0.5">
                                        <div><strong>Provider:</strong> {fileResult.extraction?.provider_name || "Not stated in document"}</div>
                                        <div><strong>Effective:</strong> {_ddmmyyyy(fileResult.extraction?.effective_from) || "Not stated in document"}{fileResult.extraction?.effective_to && ` → ${_ddmmyyyy(fileResult.extraction.effective_to)}`}</div>
                                        <div><strong>Classification:</strong> {fileResult.extraction?.classification || "Not stated in document"}</div>
                                        {fileResult.extraction?.quarterly_budget && (
                                            <div><strong>Quarterly budget:</strong> ${fileResult.extraction.quarterly_budget.toLocaleString()}</div>
                                        )}
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

                        {/* A3 Flagship Verification panel — always visible */}
                        {fileResult.verification_panel?.checks?.length > 0 && (
                            <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="cp-verification-panel">
                                <div className="overline">Verification checks</div>
                                <p className="mt-1 text-xs text-muted-k">Five Support at Home checks we run on every plan. A pass is confirmed correct, not just silence.</p>
                                <ul className="mt-3 space-y-2">
                                    {fileResult.verification_panel.checks.map((c) => {
                                        const meta = {
                                            pass: { pill: "bg-sage/15 text-sage", Icon: ShieldCheck, label: "Confirmed" },
                                            flag: { pill: "bg-terracotta/15 text-terracotta", Icon: AlertOctagon, label: "Flagged" },
                                            cannot_run: { pill: "bg-amber-100 text-primary-k", Icon: ShieldAlert, label: "Missing info" },
                                        }[c.status] || { pill: "bg-amber-100 text-primary-k", Icon: ShieldAlert, label: c.status };
                                        const Icon = meta.Icon;
                                        return (
                                            <li key={c.check} data-testid={`cp-check-${c.check}`} className="flex items-start gap-3 border-b border-kindred pb-2 last:border-0">
                                                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${c.status === "pass" ? "text-sage" : c.status === "flag" ? "text-terracotta" : "text-gold"}`} />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm text-primary-k font-medium">{c.label}</span>
                                                        <span className={`text-[9px] uppercase tracking-wider rounded-full px-2 py-0.5 ${meta.pill}`}>{meta.label}</span>
                                                    </div>
                                                    <div className="text-xs text-muted-k mt-0.5 leading-relaxed">{c.detail}</div>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {/* Findings */}
                        <div className="bg-surface border border-kindred rounded-xl p-5" data-testid="cp-file-findings">
                            <div className="overline">Findings ({(fileResult.findings || []).length})</div>
                            {(result?.safety_notice || fileResult?.safety_notice) && (
                                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-300 p-3" data-testid="cp-safety-banner">
                                    <div className="text-sm font-semibold text-amber-900">{(result?.safety_notice || fileResult?.safety_notice).title}</div>
                                    <p className="text-xs text-amber-900 mt-1 leading-relaxed">{(result?.safety_notice || fileResult?.safety_notice).body}</p>
                                </div>
                            )}
                            {(fileResult.findings || []).length === 0 ? (
                                <div className="mt-3 text-sm text-muted-k">No issues surfaced in this review.</div>
                            ) : (
                                <ul className="mt-3 space-y-3">
                                    {(fileResult.findings || []).map((f, i) => {
                                        const meta = {
                                            compliance: { label: "Compliance", cls: "bg-terracotta text-white", Icon: AlertOctagon },
                                            choice: { label: "Choice", cls: "bg-clay text-white", Icon: ShieldAlert },
                                            efficiency: { label: "Efficiency", cls: "bg-gold text-white", Icon: Shield },
                                            info: { label: "Info", cls: "bg-sage text-white", Icon: ShieldCheck },
                                        }[f.severity] || { label: "Info", cls: "bg-sage text-white", Icon: ShieldCheck };
                                        return (
                                            <li key={i} className="border-l-4 pl-3 py-1" style={{ borderColor: f.severity === "compliance" ? "#B14C36" : f.severity === "choice" ? "#B65D3D" : f.severity === "efficiency" ? "#C88A2E" : "#7FA083" }} data-testid={`cp-finding-${i}`}>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`text-[9px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
                                                    <span className="text-[10px] text-muted-k uppercase tracking-wider">{f.confidence} confidence</span>
                                                </div>
                                                <div className="mt-1 text-sm font-medium text-primary-k">{f.title}</div>
                                                <div className="mt-0.5 text-sm text-primary-k/85">{f.detail}</div>
                                                {f.citation_source && (
                                                    <div className="mt-1 text-xs text-muted-k">Source: {f.citation_source}</div>
                                                )}
                                                {f.suggested_question && (
                                                    <div className="mt-2 text-xs italic text-primary-k">→ {f.suggested_question}</div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

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
                                <Link to="/signup" className="mt-3 inline-block text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#091D33]">Start free trial</Link>
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
                                <Link to="/signup" className="mt-3 inline-block text-sm bg-primary-k text-white rounded-full px-5 py-2.5 hover:bg-[#091D33]">Start free trial</Link>
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
