/**
 * InvoiceCheckerTool.jsx
 *
 * INV-1 v1.2 Phase 1 · Marketing + upload page for the Invoice Checker.
 * Mirrors the structure of the other tool pages (`StatementDecoderTool`,
 * `BudgetCalculatorTool`), with:
 *   - <ToolHero /> title + hero copy
 *   - <ToolGate /> paywall (Solo & Family)
 *   - Upload widget calling POST /api/invoices/upload
 *   - Classification result strip (document_shape + confidence)
 *   - "Coming soon" indicator for the C1,C12 checks (Phase 1 WS4)
 *   - <ToolExplainer /> for the marketing body copy
 *   - <ToolRelatedLinks /> for cross-sell
 *
 * The full checks engine, situation-step flow and results screen ship
 * in Phase 1 WS4 + WS8. This page is the seven-sisters-shaped shell
 * that makes the tool discoverable and useful from day one.
 */
import React, { useRef, useState } from "react";
import useScrollToResult from "@/hooks/useScrollToResult";
import { Link, useNavigate } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolHero from "@/components/ToolHero";
import ToolGate from "@/components/ToolGate";
import ToolExplainer from "@/components/ToolExplainer";
import ToolRelatedLinks from "@/components/ToolRelatedLinks";
import AIAccuracyBanner from "@/components/AIAccuracyBanner";
import FilePreviewPanel from "@/components/FilePreviewPanel";
import UploadGuardNotice from "@/components/UploadGuardNotice";
import useToolAccess from "@/hooks/useToolAccess";
import { useAuth } from "@/context/AuthContext";
import { api, extractErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/formatDate";
import {
    Upload, Loader2, ArrowRight, CheckCircle2, AlertTriangle,
    FileText, ReceiptText,
    Save, FolderInput,
} from "lucide-react";
import SeoHead, {
    softwareApplicationLd,
    howToLd,
    faqLd,
    breadcrumbLd,
} from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
import { AutomatedDecisionDisclosure, isEnabled } from "@/uxf";
import { ConsequenceLadderList } from "@/uxf/components/ConsequenceLadder";
import { InvoiceResultBody } from "@/components/invoices/InvoiceResultView";

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

const SHAPE_LABEL = {
    invoice: "Invoice",
    combined: "Combined statement + invoice",
    combined_unsplit: "Combined document",
    statement: "Statement",
    remittance: "Remittance advice",
    receipt: "Receipt",
};

function CleanReconciliation({ items }) {
    if (!items || items.length === 0) return null;
    const clean = items.filter((c) => c.ok);
    if (clean.length === 0) return null;
    return (
        <div className="rounded-2xl border border-sage/30 bg-sage/5 p-5" data-testid="inv1-clean-reconciliation">
            <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-4 w-4 text-sage" />
                <div className="text-sm font-semibold text-primary-k">We also checked</div>
                <span className="text-xs text-muted-k">({clean.length} passed)</span>
            </div>
            <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-primary-k/80">
                {clean.map((c) => (
                    <li key={c.check_id} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-sage mt-1 shrink-0" />
                        <span>{c.label}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ShapeChip({ shape, confidence }) {
    const label = SHAPE_LABEL[shape] || shape;
    const isConfident = (confidence ?? 0) >= 0.6;
    const tone = isConfident
        ? "bg-sage/15 text-[#0F5648] border-sage/30"
        : "bg-gold/20 text-primary-k border-gold/40";
    return (
        <span
            className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border ${tone}`}
            data-testid={`inv1-shape-chip-${shape}`}
        >
            {label}
            <span className="text-muted-k">· {Math.round((confidence ?? 0) * 100)}% confidence</span>
        </span>
    );
}

function RadioRow({ testid, label, value, setValue, options }) {
    return (
        <div>
            <div className="text-sm font-medium text-primary-k">{label}</div>
            <div className="mt-1.5 flex flex-wrap gap-2">
                {options.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => setValue(o.value)}
                        data-testid={`${testid}-${o.value}`}
                        className={`text-sm rounded-full px-3 py-1 border transition-colors ${
                            value === o.value
                                ? "bg-primary-k border-primary-k text-white"
                                : "bg-surface border-kindred text-primary-k hover:bg-surface-2"
                        }`}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * WS3 · Situation-step questionnaire (spec §7). Five fields, all
 * optional. Submits to POST /api/invoices/{id}/situation which re-runs
 * the checks engine with the new context and returns the fresh
 * reconciliation payload.
 */
function SituationForm({ invoiceId, onUpdated }) {
    const [pension, setPension] = useState("unknown");
    const [grandfathered, setGrandfathered] = useState("unknown");
    const [hardship, setHardship] = useState("unknown");
    const [assessment, setAssessment] = useState("unknown");
    const [letterDate, setLetterDate] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const onSubmit = async (e) => {
        e?.preventDefault?.();
        if (!invoiceId) return;
        setSaving(true);
        setSaveError(null);
        try {
            const { data } = await api.post(`/invoices/${invoiceId}/situation`, {
                pension_status: pension,
                grandfathered,
                hardship,
                assessment_pending: assessment,
                assessment_letter_date: letterDate || null,
            });
            onUpdated?.(data);
        } catch (err) {
            setSaveError(extractErrorMessage(err) || "Could not update the situation. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <form
            onSubmit={onSubmit}
            className="rounded-2xl border border-kindred bg-surface p-5 space-y-5"
            data-testid="inv1-situation-form"
        >
            <div>
                <div className="font-heading text-lg text-primary-k">Refine the checks with your situation</div>
                <p className="mt-1 text-sm text-muted-k">
                    A handful of questions so we can apply the right contribution rate and hardship rules to this invoice. Everything is optional.
                </p>
            </div>
            <RadioRow
                testid="inv1-pension"
                label="Pension status"
                value={pension}
                setValue={setPension}
                options={[
                    { value: "full_pensioner", label: "Full pensioner" },
                    { value: "part_pensioner", label: "Part pensioner" },
                    { value: "cshc", label: "CSHC holder" },
                    { value: "self_funded_no_cshc", label: "Self-funded" },
                    { value: "unknown", label: "Not sure" },
                ]}
            />
            <RadioRow
                testid="inv1-grandfathered"
                label="Was your care arranged before 12 September 2024?"
                value={grandfathered}
                setValue={setGrandfathered}
                options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                    { value: "unknown", label: "Not sure" },
                ]}
            />
            <RadioRow
                testid="inv1-hardship"
                label="Do you have a hardship arrangement in place?"
                value={hardship}
                setValue={setHardship}
                options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                    { value: "unknown", label: "Not sure" },
                ]}
            />
            <RadioRow
                testid="inv1-assessment"
                label="Do you have a reassessment pending?"
                value={assessment}
                setValue={setAssessment}
                options={[
                    { value: "yes", label: "Yes" },
                    { value: "no", label: "No" },
                    { value: "unknown", label: "Not sure" },
                ]}
            />
            {assessment === "yes" && (
                <label className="block">
                    <span className="text-sm font-medium text-primary-k">Date of the reassessment letter (optional)</span>
                    <input
                        type="date"
                        value={letterDate}
                        onChange={(e) => setLetterDate(e.target.value)}
                        className="mt-1.5 block w-full sm:w-auto rounded-lg border border-kindred bg-surface px-3 py-2 text-sm"
                        data-testid="inv1-assessment-letter-date"
                    />
                </label>
            )}
            {saveError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-testid="inv1-situation-error">
                    {saveError}
                </div>
            )}
            <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-k text-white text-sm font-medium px-5 py-2.5 disabled:opacity-60"
                data-testid="inv1-situation-submit"
            >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Re-checking..." : "Re-check with these details"}
            </button>
        </form>
    );
}

export default function InvoiceCheckerTool() {
    const access = useToolAccess();
    const { user } = useAuth();
    const [file, setFile] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [guard, setGuard] = useState(null);
    const [dupe, setDupe] = useState(null);
    const [drafting, setDrafting] = useState(false);
    const [reconcilingCombined, setReconcilingCombined] = useState(false);
    const [savingToVault, setSavingToVault] = useState(false);
    const [vaultSaved, setVaultSaved] = useState(null);
    const [comparing, setComparing] = useState(false);
    const fileRef = useRef(null);
    const resultRef = useScrollToResult(Boolean(result));
    const navigate = useNavigate();

    const onDraftLetter = async (findingIndex) => {
        if (!result?.invoice_id) return;
        setDrafting(true);
        try {
            const { data } = await api.post(
                `/invoices/${result.invoice_id}/findings/${findingIndex}/letter`,
            );
            if (data?.editor_path) {
                navigate(data.editor_path);
            }
        } catch (e) {
            setError(extractErrorMessage(e) || "Could not draft the letter.");
        } finally {
            setDrafting(false);
        }
    };

    const onSituationUpdated = (data) => {
        setResult((prev) => prev ? { ...prev, reconciliation: data.reconciliation } : prev);
    };

    const onDraftAll = async () => {
        if (!result?.invoice_id) return;
        setDrafting(true);
        try {
            const { data } = await api.post(`/invoices/${result.invoice_id}/letter`);
            if (data?.editor_path) navigate(data.editor_path);
        } catch (e) {
            setError(extractErrorMessage(e) || "Could not draft the letter.");
        } finally {
            setDrafting(false);
        }
    };

    const onReconcileCombined = async () => {
        if (!result?.invoice_id) return;
        setReconcilingCombined(true);
        setError(null);
        try {
            const { data } = await api.post(`/invoices/${result.invoice_id}/reconcile-combined`);
            setResult((prev) => prev ? {
                ...prev,
                reconciliation: data.reconciliation,
                combined_reconciled: true,
            } : prev);
        } catch (e) {
            setError(extractErrorMessage(e) || "Could not reconcile against the statement side.");
        } finally {
            setReconcilingCombined(false);
        }
    };

    const onSaveToVault = async () => {
        if (!result?.invoice_id) return;
        setSavingToVault(true);
        setError(null);
        try {
            const { data } = await api.post(`/invoices/${result.invoice_id}/save-to-vault`);
            setVaultSaved(data);
        } catch (e) {
            setError(extractErrorMessage(e) || "Could not save to your Document Vault.");
        } finally {
            setSavingToVault(false);
        }
    };

    const onPick = (e) => {
        const f = e.target.files?.[0];
        if (f) {
            setFile(f);
            setResult(null);
            setError(null);
            setGuard(null);
        }
    };

    const onUpload = async (override = false) => {
        if (!file) return;
        setLoading(true);
        setError(null);
        setResult(null);
        setGuard(null);
        setDupe(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            if (override) fd.append("override_guard", "true");
            const resp = await api.post("/invoices/upload", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            if (resp.data?.upload_guard && resp.data.upload_guard.decision !== "accept") {
                setGuard(resp.data.upload_guard);
                return;
            }
            setResult(resp.data);
        } catch (e) {
            const detail = e?.response?.data?.detail;
            if (e?.response?.status === 409 && detail?.error === "DUPLICATE_EXACT") {
                setDupe(detail);
                return;
            }
            setError(extractErrorMessage(e) || "We could not read this file. Please try a clearer copy.");
        } finally {
            setLoading(false);
        }
    };

    const onReset = () => {
        setFile(null);
        setResult(null);
        setError(null);
        setGuard(null);
        setDupe(null);
        setVaultSaved(null);
        if (fileRef.current) fileRef.current.value = "";
    };

    if (access === "loading") {
        return (
            <div className="min-h-screen bg-kindred">
                <SeoHead {...SEO.toolInvoiceChecker} jsonLd={_toolJsonLd(SEO.toolInvoiceChecker)} />
                <MarketingHeader />
                <div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k">
                    <Loader2 className="h-5 w-5 animate-spin" />
                </div>
                <Footer />
            </div>
        );
    }

    if (access === "blocked") {
        return (
            <div className="min-h-screen bg-kindred">
                <SeoHead {...SEO.toolInvoiceChecker} jsonLd={_toolJsonLd(SEO.toolInvoiceChecker)} />
                <MarketingHeader />
                <ToolHero toolKey="invoice-checker" />
                <ToolGate toolName="Invoice Checker">
                    <div className="mx-auto max-w-3xl rounded-2xl border border-kindred bg-surface p-8 text-center">
                        <ReceiptText className="h-10 w-10 text-primary-k mx-auto" />
                        <p className="mt-4 text-sm text-muted-k">
                            Invoice Checker verifies every line on your provider&apos;s contribution invoice, flags anything worth raising, and drafts the question to ask before you pay.
                        </p>
                    </div>
                </ToolGate>
                <section className="max-w-5xl mx-auto px-4 sm:px-8">
                    <ToolExplainer toolKey="invoice-checker" />
                </section>
                <ToolRelatedLinks slug="invoice-checker" />
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.toolInvoiceChecker} jsonLd={_toolJsonLd(SEO.toolInvoiceChecker)} />
            <MarketingHeader />
            <ToolHero toolKey="invoice-checker" wide />

            <section className="mx-auto max-w-[1720px] px-6 pb-20">
                {/* Upload widget */}
                <div className="bg-surface border border-kindred rounded-2xl p-6 sm:p-8 mt-4" data-testid="inv1-upload-card">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="font-heading text-2xl text-primary-k">Upload your invoice</h2>
                            <p className="mt-2 text-sm text-muted-k max-w-xl">
                                Add the invoice your provider sent. Same formats as the statement decoder: PDF, DOC/DOCX, TXT, CSV, JPG, PNG, HEIC, WEBP. If your provider sends one document with both the statement and invoice combined, that works too.
                            </p>
                        </div>
                        <ReceiptText className="h-8 w-8 text-primary-k hidden sm:block" />
                    </div>

                    <input
                        ref={fileRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png,.heic,.heif,.webp"
                        onChange={onPick}
                        className="hidden"
                        data-testid="inv1-file-input"
                    />
                    {!file ? (
                        <div
                            className={`mt-6 rounded-xl border-2 border-dashed bg-surface-2 p-10 text-center cursor-pointer transition-colors ${dragActive ? "border-gold bg-surface scale-[1.01]" : "border-kindred hover:bg-surface"}`}
                            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                            onDragLeave={() => setDragActive(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragActive(false);
                                const f = e.dataTransfer.files?.[0];
                                if (f) { setFile(f); setResult(null); setError(null); setGuard(null); }
                            }}
                            onClick={() => fileRef.current?.click()}
                            data-testid="inv1-dropzone"
                        >
                            <Upload className={`h-12 w-12 mx-auto text-primary-k transition-transform ${dragActive ? "scale-110" : ""}`} />
                            <div className="font-heading text-xl text-primary-k mt-3">Drag your invoice here</div>
                            <div className="text-sm text-muted-k mt-1">or click to browse files</div>
                            <div className="text-xs text-muted-k mt-3">PDF · Word · TXT · CSV · JPG · PNG · HEIC · WEBP</div>
                        </div>
                    ) : (
                        <div className="mt-6">
                            <FilePreviewPanel file={file} onClear={onReset} />
                        </div>
                    )}

                    {file && (
                        <button
                            type="button"
                            onClick={() => onUpload()}
                            disabled={loading}
                            data-testid="inv1-upload-submit"
                            className="mt-4 w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#091D33] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                            {loading ? "Reading your invoice…" : "Check my invoice"}
                        </button>
                    )}

                    <p className="mt-4 text-xs text-muted-k">
                        We accept PDF, DOC/DOCX, TXT, CSV, JPG, PNG, HEIC, and WEBP files. Your invoice is stored securely in Australia and you can delete it any time.
                    </p>
                </div>

                {/* ADM disclosure (spec §11) */}
                {isEnabled?.("uxf_v3.adm_disclosure") && (
                    <div className="mt-4">
                        <AutomatedDecisionDisclosure
                            toolName="Invoice Checker"
                            body="Invoice Checker reads your invoice automatically and compares it against the program rules and what you have told us. It points out things worth checking, but it does not make decisions for you and it can be wrong, so always confirm anything important with your provider."
                        />
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="mt-6 rounded-xl border border-terracotta/40 bg-terracotta/10 p-4 flex items-start gap-3" data-testid="inv1-error">
                        <AlertTriangle className="h-5 w-5 text-terracotta shrink-0 mt-0.5" />
                        <div className="text-sm text-primary-k">{error}</div>
                    </div>
                )}

                {/* Exact-duplicate notice */}
                {dupe && (
                    <div className="mt-6 overflow-hidden rounded-2xl border-2 border-gold bg-gold/10 shadow-sm" data-testid="inv1-duplicate">
                        <div className="h-1.5 w-full bg-gold" />
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="h-12 w-12 rounded-full bg-gold flex items-center justify-center flex-shrink-0">
                                    <AlertTriangle className="h-6 w-6 text-white" />
                                </div>
                                <div className="flex-1">
                                    <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-primary-k bg-gold/30 rounded-full px-2.5 py-1">
                                        Already Checked
                                    </span>
                                    <h3 className="mt-2 font-heading text-xl text-primary-k">You Have Already Checked This Invoice</h3>
                                    <p className="mt-1.5 text-sm text-primary-k/80 leading-relaxed">
                                        This exact file was uploaded before
                                        {dupe.existing_created_at ? <> on <strong>{formatDate(dupe.existing_created_at)}</strong></> : null}
                                        {dupe.existing_provider_name ? <> for <strong>{dupe.existing_provider_name}</strong></> : null}.
                                        Open the existing check instead of creating a duplicate.
                                    </p>
                                    <div className="mt-5 flex flex-wrap gap-3">
                                        {dupe.existing_invoice_id && (
                                            <Link
                                                to={`/app/invoices/${dupe.existing_invoice_id}`}
                                                data-testid="inv1-duplicate-open"
                                                className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-k text-white rounded-lg px-5 py-3 hover:bg-[#091D33] transition-colors"
                                            >
                                                <ArrowRight className="h-4 w-4" /> Open the Existing Check
                                            </Link>
                                        )}
                                        <button
                                            type="button"
                                            onClick={onReset}
                                            data-testid="inv1-duplicate-reset"
                                            className="inline-flex items-center gap-2 text-sm font-semibold bg-[#A5512B] text-white rounded-lg px-5 py-3 hover:bg-[#8f4523] transition-colors"
                                        >
                                            <ReceiptText className="h-4 w-4" /> Check a Different Invoice
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* UPLOAD-GUARD-1 verdict */}
                {guard && (
                    <div className="mt-6">
                        <UploadGuardNotice
                            strict
                            verdict={guard}
                            busy={loading}
                            onContinue={guard.decision === "confirm" ? () => onUpload(true) : undefined}
                            onChooseAnother={onReset}
                        />
                    </div>
                )}

                {/* Statement-only redirect */}
                {result && result.document_shape === "statement" && (
                    <div className="mt-6 rounded-2xl border border-kindred bg-surface p-6" data-testid="inv1-statement-redirect">
                        <div className="flex items-start gap-3">
                            <FileText className="h-5 w-5 text-primary-k shrink-0 mt-0.5" />
                            <div>
                                <div className="font-heading text-lg text-primary-k">This looks like your statement, not your invoice.</div>
                                <p className="mt-2 text-sm text-muted-k">
                                    Your statement is a summary and is not a bill. Your provider usually sends the invoice separately. Upload the invoice and we will check what you actually pay.
                                </p>
                                <div className="mt-4 flex flex-wrap items-center gap-3">
                                    <Link
                                        to="/ai-tools/statement-decoder"
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary-k text-white text-sm font-medium px-4 py-2"
                                        data-testid="inv1-open-statement-decoder"
                                    >
                                        Open Statement Decoder <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={onReset}
                                        className="text-sm text-primary-k underline"
                                        data-testid="inv1-try-another"
                                    >
                                        Upload the invoice instead
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Result, Phase 1 checks engine (C1, C2, C3, C4, C5, C7, C8, C9, C10, C11, C12) */}
                {result && result.document_shape && result.document_shape !== "statement" && (
                    <div ref={resultRef} className="mt-8 space-y-6 scroll-mt-20" data-testid="inv1-result">
                        {result.duplicate_warning && (
                            <div
                                data-testid="inv1-duplicate-warning"
                                role="status"
                                className="flex items-start gap-3 rounded-2xl border border-wayly-gold-300 bg-wayly-gold-50 px-4 py-3"
                            >
                                <span className="mt-0.5 text-wayly-gold-700">⚠️</span>
                                <div className="flex-1 text-sm text-[#5A4A1C]">
                                    <p className="font-semibold">{result.duplicate_warning.message}</p>
                                    <p className="mt-0.5 text-[#7A6A3C]">
                                        We&apos;ve still checked this one — but you may have already looked at
                                        {result.duplicate_warning.provider_name ? ` ${result.duplicate_warning.provider_name}` : " this provider"}
                                        {result.duplicate_warning.invoice_date ? ` dated ${result.duplicate_warning.invoice_date}` : ""}.
                                    </p>
                                    {result.duplicate_warning.invoice_id && (
                                        <a
                                            href={`/invoices/${result.duplicate_warning.invoice_id}`}
                                            data-testid="inv1-duplicate-view"
                                            className="mt-1 inline-block font-semibold underline"
                                        >
                                            View the earlier check
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                        {/* Shared result body — identical layout + graphics to the saved Invoice page */}
                        <InvoiceResultBody
                            result={result}
                            invoiceId={result.invoice_id}
                            comparing={comparing}
                            onCompare={() => setComparing((c) => !c)}
                            onDraftFinding={onDraftLetter}
                            onDraftAll={onDraftAll}
                        />

                        {/* Combined-doc reconciliation prompt (C7/C9). Shows when the
                            document had a statement side that hasn't been reconciled yet. */}
                        {(result.combined_statement_line_count > 0) && !result.combined_reconciled && (
                            <div
                                className="rounded-2xl border-2 border-gold/50 bg-gradient-to-br from-gold/15 to-gold/5 p-6"
                                data-testid="inv1-combined-prompt"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="h-11 w-11 rounded-xl bg-gold/25 text-primary-k flex items-center justify-center shrink-0">
                                        <FolderInput className="h-5 w-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-heading text-lg text-primary-k">
                                            We detected a statement in this document
                                        </div>
                                        <p className="mt-1.5 text-sm text-primary-k/80 leading-relaxed">
                                            Your provider bundled the invoice and statement together
                                            ({result.combined_statement_line_count} statement line{result.combined_statement_line_count === 1 ? "" : "s"} found).
                                            We can cross-check every invoice line against the statement side to catch missed or unmatched items.
                                        </p>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={onReconcileCombined}
                                                disabled={reconcilingCombined}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-k text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
                                                data-testid="inv1-reconcile-combined-btn"
                                            >
                                                {reconcilingCombined ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                                                {reconcilingCombined ? "Reconciling..." : "Reconcile now"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {result.combined_reconciled && (
                            <div
                                className="rounded-xl border border-sage/40 bg-sage/10 p-3 flex items-center gap-2 text-sm text-primary-k"
                                data-testid="inv1-combined-reconciled-badge"
                            >
                                <CheckCircle2 className="h-4 w-4 text-sage" />
                                Reconciled against the statement side of this document.
                            </div>
                        )}

                        {/* 2. AI plain-English summary + 3. metadata + 4. issue register +
                            4a. charges now all render inside <InvoiceResultBody> above,
                            so the fresh run looks identical to the saved invoice page. */}

                        {/* 4b. Legacy consequence-ladder view (kept for the "next steps" chips) */}
                        {result.reconciliation?.findings?.length > 0 && (
                            <details className="rounded-2xl border border-primary-k/10 bg-white/40 px-4 py-3" data-testid="inv1-findings-ladder-toggle">
                                <summary className="cursor-pointer text-sm font-medium text-primary-k">Show step-by-step next actions per issue</summary>
                                <div className="mt-3">
                                    <ConsequenceLadderList
                                        findings={result.reconciliation.findings}
                                    />
                                </div>
                            </details>
                        )}

                        {/* 5. Clean reconciliation summary */}
                        <CleanReconciliation items={result.reconciliation?.clean_reconciliation} />

                        {/* 6. Situation refinement */}
                        {result.invoice_id && (
                            <SituationForm
                                invoiceId={result.invoice_id}
                                onUpdated={onSituationUpdated}
                            />
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap gap-3 items-center" data-testid="inv1-actions">
                            {!vaultSaved ? (
                                <button
                                    type="button"
                                    onClick={onSaveToVault}
                                    disabled={savingToVault}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-k text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
                                    data-testid="inv1-save-to-vault-btn"
                                >
                                    {savingToVault ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    {savingToVault ? "Saving..." : "Save to Vault"}
                                </button>
                            ) : (
                                <div
                                    className="inline-flex items-center gap-2 rounded-lg border border-sage/50 bg-sage/10 text-primary-k text-sm px-4 py-2"
                                    data-testid="inv1-vault-saved-badge"
                                >
                                    <CheckCircle2 className="h-4 w-4 text-sage" />
                                    <span>
                                        Saved to your Vault
                                        {vaultSaved.saved_count > 0 && ` (${vaultSaved.saved_count} file${vaultSaved.saved_count === 1 ? "" : "s"})`}
                                    </span>
                                    <Link
                                        to="/app/documents"
                                        className="ml-1 underline text-primary-k hover:no-underline"
                                        data-testid="inv1-open-vault"
                                    >
                                        Open Vault
                                    </Link>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={onReset}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-kindred bg-surface text-primary-k text-sm font-medium px-4 py-2 hover:bg-surface-2"
                                data-testid="inv1-check-another"
                            >
                                Check another invoice
                            </button>
                            <Link
                                to="/ai-tools/statement-decoder"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-kindred bg-surface text-primary-k text-sm font-medium px-4 py-2 hover:bg-surface-2"
                                data-testid="inv1-open-statement-decoder-cross"
                            >
                                Decode a statement <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>
                )}

                <div className="mt-8">
                    <AIAccuracyBanner />
                </div>

                <div className="mt-8 grid sm:grid-cols-2 gap-4">
                    <Link to="/ai-tools/statement-decoder" className="bg-[rgba(14,77,82,0.08)] border border-[rgba(14,77,82,0.25)] rounded-xl p-4 hover:bg-[rgba(14,77,82,0.14)] transition-colors" data-testid="inv1-related-statement-decoder">
                        <div className="overline">Related tool</div>
                        <div className="font-heading text-lg text-primary-k mt-1">Statement Decoder →</div>
                        <p className="mt-1 text-sm text-muted-k">The information-only statement, decoded line by line.</p>
                    </Link>
                    <Link to="/ai-tools/contribution-estimator" className="bg-gold/10 border border-gold/30 rounded-xl p-4 hover:bg-gold/20 transition-colors" data-testid="inv1-related-contribution-estimator">
                        <div className="overline">Related tool</div>
                        <div className="font-heading text-lg text-primary-k mt-1">Contribution Estimator →</div>
                        <p className="mt-1 text-sm text-muted-k">Work out what you should be paying each quarter.</p>
                    </Link>
                </div>
            </section>

            <section className="max-w-5xl mx-auto px-4 sm:px-8">
                <ToolExplainer toolKey="invoice-checker" />
            </section>
            <ToolRelatedLinks slug="invoice-checker" />
            <Footer />
        </div>
    );
}
