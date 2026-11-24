/**
 * AnonymousInvoiceCheck.jsx — CONV-1 v2 Workstream B.
 *
 * The signed-out Invoice Check. A visitor runs one real check on their own
 * invoice with no account and no card, and sees the COMPLETE result rendered
 * by the SAME <InvoiceResultBody> the signed-in tool uses. Upload-first (B2),
 * with camera capture (B3), a reduced optional situation step (B4), the full
 * result (B5), account-gated next steps at the foot (B6), the 120-day
 * allowance (B7) and 7-day session persistence (B8).
 */
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    Upload, Camera, ClipboardPaste, Loader2, ArrowRight, FileText,
    AlertTriangle, Sparkles, Save, Mail, ReceiptText, ChevronDown, ChevronUp,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import useScrollToResult from "@/hooks/useScrollToResult";
import { conv1 } from "@/lib/conv1";
import { InvoiceResultBody } from "@/components/invoices/InvoiceResultView";
import FilePreviewPanel from "@/components/FilePreviewPanel";
import UploadGuardNotice from "@/components/UploadGuardNotice";
import FreeAllowanceBadge from "@/components/FreeAllowanceBadge";

const _ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.heif,.webp";

function SitRow({ label, value, onChange, testid, options }) {
    return (
        <div>
            <div className="text-sm font-medium text-primary-k">{label}</div>
            <div className="mt-1.5 flex flex-wrap gap-2">
                {options.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        onClick={() => onChange(o.value)}
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

export default function AnonymousInvoiceCheck({ onSeeExample }) {
    const { user } = useAuth();
    const [savedToAccount, setSavedToAccount] = useState(false);
    const [mode, setMode] = useState("upload"); // upload | paste
    const [file, setFile] = useState(null);
    const [pasted, setPasted] = useState("");
    const [sit, setSit] = useState({
        pension_status: "unknown", grandfathered: "unknown",
        hardship: "unknown", assessment_pending: "unknown",
    });
    const [showSit, setShowSit] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [statementRedirect, setStatementRedirect] = useState(false);
    const [guard, setGuard] = useState(null);
    const [cooldown, setCooldown] = useState(null);
    const [emailVal, setEmailVal] = useState("");
    const [consent, setConsent] = useState(false);
    const [emailing, setEmailing] = useState(false);
    const [emailed, setEmailed] = useState(false);
    const [emailErr, setEmailErr] = useState(null);
    const [fbComment, setFbComment] = useState("");
    const [fbQuote, setFbQuote] = useState(false);
    const [fbSent, setFbSent] = useState(false);
    const fileRef = useRef(null);
    const cameraRef = useRef(null);
    const resultRef = useScrollToResult(Boolean(result));

    // Session restore (B8): a ?r=<token> link (e.g. from the emailed result)
    // first, otherwise the first-party cookie from a previous run this week.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = new URLSearchParams(window.location.search).get("r");
                const { data } = r
                    ? await api.get(`/public/invoice-check/${r}`, { withCredentials: true })
                    : await api.get("/public/invoice-check/session", { withCredentials: true });
                if (!cancelled && data?.reconciliation) setResult(data);
            } catch (_) { /* no prior session, normal */ }
        })();
        return () => { cancelled = true; };
    }, []);

    const reset = () => {
        setFile(null); setPasted(""); setResult(null); setError(null);
        setGuard(null); setCooldown(null); setStatementRedirect(false);
        if (fileRef.current) fileRef.current.value = "";
        if (cameraRef.current) cameraRef.current.value = "";
    };

    const run = async ({ sample = false } = {}) => {
        if (loading) return;
        setError(null); setGuard(null); setCooldown(null); setStatementRedirect(false);
        if (!sample && mode === "paste" && !pasted.trim()) { setError("Paste the text from your invoice first."); return; }
        if (!sample && mode === "upload" && !file) { setError("Add your invoice — upload a file or take a photo."); return; }
        setLoading(true);
        try {
            conv1.anonCheckStarted({ input_method: sample ? "sample" : mode });
            const fd = new FormData();
            if (sample) fd.append("example", "true");
            else if (mode === "paste") fd.append("text", pasted);
            else fd.append("file", file);
            fd.append("pension_status", sit.pension_status);
            fd.append("grandfathered", sit.grandfathered);
            fd.append("hardship", sit.hardship);
            fd.append("assessment_pending", sit.assessment_pending);
            const { data } = await api.post("/public/invoice-check/run", fd, {
                headers: { "Content-Type": "multipart/form-data" },
                withCredentials: true,
            });
            if (data?.upload_guard) { setGuard(data.upload_guard); return; }
            if (data?.redirect_to === "statement-decoder") { setStatementRedirect(true); return; }
            setResult(data);
            conv1.anonCheckCompleted({
                input_method: sample ? "sample" : mode,
                findings: (data?.reconciliation?.findings || []).length,
            });
            // CONV-1 D: a logged-in Free member's check is kept in their account.
            if (user && !sample && data?.token && data?.reconciliation) {
                try {
                    const n = (data.reconciliation.findings || []).length;
                    await api.post("/me/free-results/save", {
                        type: "invoice",
                        token: data.token,
                        title: data.reconciliation.provider_name || "Invoice check",
                        subtitle: n ? `${n} finding${n === 1 ? "" : "s"} flagged` : null,
                    });
                    setSavedToAccount(true);
                } catch (_) { /* saving is best-effort */ }
            }
        } catch (e) {
            const detail = e?.response?.data?.detail;
            if (e?.response?.status === 429 && detail?.error === "cooldown_active") { setCooldown(detail); return; }
            if (e?.response?.status === 503) { setError(detail?.message || "Instant checks are paused right now — start a free trial to check your invoice."); return; }
            setError(extractErrorMessage(e) || "We couldn't read that. Try a clearer copy, or paste the text instead.");
        } finally {
            setLoading(false);
        }
    };

    const onPick = (e) => {
        const f = e.target.files?.[0];
        if (f) { setFile(f); setResult(null); setError(null); setGuard(null); }
    };

    const emailResult = async () => {
        if (emailing || !result?.token) return;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailVal.trim())) { setEmailErr("Enter a valid email address."); return; }
        setEmailing(true); setEmailErr(null);
        try {
            await api.post(`/public/invoice-check/${result.token}/email`, {
                email: emailVal.trim(), marketing_consent: consent,
            }, { withCredentials: true });
            setEmailed(true);
            conv1.resultEmailed({ input_method: result.is_sample ? "sample" : mode });
        } catch (e) {
            setEmailErr(extractErrorMessage(e) || "Could not send the email. Please try again.");
        } finally {
            setEmailing(false);
        }
    };

    const signupHref = emailVal.trim() ? `/signup?email=${encodeURIComponent(emailVal.trim())}` : "/signup";

    const sendFeedback = async (helpful) => {
        if (!result?.token) return;
        try {
            await api.post(`/public/invoice-check/${result.token}/feedback`, {
                helpful, comment: fbComment.trim() || null, may_quote: fbQuote,
            }, { withCredentials: true });
            setFbSent(true);
        } catch (_) { setFbSent(true); /* never block the user on feedback */ }
    };

    return (
        <section className="mx-auto max-w-[1720px] px-6" data-testid="anon-invoice-check">
            <div className="bg-surface border border-kindred rounded-2xl p-6 sm:p-8 shadow-sm">
                <span className="overline">Free · no account needed</span>
                <h2 className="font-heading text-2xl sm:text-3xl text-primary-k mt-1 tracking-tight">
                    Check your aged-care invoice now
                </h2>
                <p className="mt-2 text-sm text-muted-k leading-relaxed">
                    Upload it, photograph it, or paste it. We&apos;ll read every line and show you exactly what&apos;s worth
                    raising — the whole result, free, before you decide anything.
                </p>

                {!result && !statementRedirect && (
                    <>
                        {/* B3: input methods — upload, camera, paste */}
                        <input ref={fileRef} type="file" accept={_ACCEPT} onChange={onPick} className="hidden" data-testid="anon-file-input" />
                        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" data-testid="anon-camera-input" />

                        {mode === "upload" && (
                            <>
                                {!file ? (
                                    <div className="mt-5 grid sm:grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => fileRef.current?.click()}
                                            data-testid="anon-upload-btn"
                                            className="rounded-xl border-2 border-dashed border-kindred bg-surface-2 p-6 text-center hover:bg-surface hover:border-primary-k/40 transition-colors"
                                        >
                                            <Upload className="h-8 w-8 mx-auto text-primary-k" />
                                            <div className="font-heading text-base text-primary-k mt-2">Upload a file</div>
                                            <div className="text-xs text-muted-k mt-0.5">PDF · Word · JPG · PNG · HEIC</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => cameraRef.current?.click()}
                                            data-testid="anon-camera-btn"
                                            className="rounded-xl border-2 border-dashed border-kindred bg-surface-2 p-6 text-center hover:bg-surface hover:border-primary-k/40 transition-colors"
                                        >
                                            <Camera className="h-8 w-8 mx-auto text-primary-k" />
                                            <div className="font-heading text-base text-primary-k mt-2">Take a photo</div>
                                            <div className="text-xs text-muted-k mt-0.5">Use your phone camera</div>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-5"><FilePreviewPanel file={file} onClear={reset} /></div>
                                )}
                            </>
                        )}

                        {mode === "paste" && (
                            <textarea
                                value={pasted}
                                onChange={(e) => setPasted(e.target.value)}
                                rows={7}
                                data-testid="anon-paste-input"
                                placeholder="Paste the text of your invoice here…"
                                className="mt-5 w-full rounded-xl border border-kindred bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        )}

                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                            <button
                                type="button"
                                onClick={() => setMode(mode === "upload" ? "paste" : "upload")}
                                data-testid="anon-toggle-mode"
                                className="inline-flex items-center gap-1.5 text-primary-k underline hover:no-underline"
                            >
                                <ClipboardPaste className="h-3.5 w-3.5" />
                                {mode === "upload" ? "Paste text instead" : "Upload a file instead"}
                            </button>
                            <button
                                type="button"
                                onClick={() => run({ sample: true })}
                                data-testid="anon-sample-btn"
                                className="inline-flex items-center gap-1.5 text-primary-k underline hover:no-underline"
                            >
                                <Sparkles className="h-3.5 w-3.5" /> Try a sample invoice
                            </button>
                            {onSeeExample && (
                                <button
                                    type="button"
                                    onClick={onSeeExample}
                                    data-testid="anon-see-example"
                                    className="text-muted-k underline hover:no-underline"
                                >
                                    Not ready? See an example check first
                                </button>
                            )}
                        </div>

                        {/* B4: reduced, optional situation step — never blocks the run */}
                        <div className="mt-5 rounded-xl border border-kindred bg-surface-2/60">
                            <button
                                type="button"
                                onClick={() => setShowSit((s) => !s)}
                                data-testid="anon-situation-toggle"
                                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
                            >
                                <span className="text-sm font-medium text-primary-k">
                                    Tell us your situation <span className="font-normal text-muted-k">(optional — sharpens the result)</span>
                                </span>
                                {showSit ? <ChevronUp className="h-4 w-4 text-muted-k" /> : <ChevronDown className="h-4 w-4 text-muted-k" />}
                            </button>
                            {showSit && (
                                <div className="px-4 pb-4 space-y-4" data-testid="anon-situation-form">
                                    <SitRow
                                        label="Pension status" testid="anon-pension"
                                        value={sit.pension_status} onChange={(v) => setSit((s) => ({ ...s, pension_status: v }))}
                                        options={[
                                            { value: "full_pensioner", label: "Full pensioner" },
                                            { value: "part_pensioner", label: "Part pensioner" },
                                            { value: "self_funded_no_cshc", label: "Self-funded" },
                                            { value: "unknown", label: "I'm not sure" },
                                        ]}
                                    />
                                    <SitRow
                                        label="Was care arranged before 12 September 2024?" testid="anon-grandfathered"
                                        value={sit.grandfathered} onChange={(v) => setSit((s) => ({ ...s, grandfathered: v }))}
                                        options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "I'm not sure" }]}
                                    />
                                    <SitRow
                                        label="Do you have a hardship arrangement?" testid="anon-hardship"
                                        value={sit.hardship} onChange={(v) => setSit((s) => ({ ...s, hardship: v }))}
                                        options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unknown", label: "I'm not sure" }]}
                                    />
                                    <p className="text-xs text-muted-k leading-relaxed">
                                        Wherever you&apos;re not sure, your result will say which findings depend on that answer and what would change.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* D2: honest allowance, stated up front — BEFORE the run button */}
                        <FreeAllowanceBadge tool="INVOICE_CHECKER" noun="invoice check" nounPlural="invoice checks" refreshKey={result ? 1 : 0} />

                        <button
                            type="button"
                            onClick={() => run()}
                            disabled={loading}
                            data-testid="anon-run-btn"
                            className="mt-5 w-full bg-primary-k text-white rounded-full py-3 hover:bg-[#091D33] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                            {loading ? "Reading your invoice…" : "Check my invoice"}
                        </button>


                        {/* B privacy line — what happens to the upload (spec §7.3, H5) */}
                        <p className="mt-3 text-xs text-muted-k leading-relaxed" data-testid="anon-privacy-line">
                            Your invoice is processed in Australia to produce your result, then the file is deleted. We keep only the
                            result, held for 7 days so you can come back to it. No account, no card.
                        </p>
                    </>
                )}

                {error && (
                    <div className="mt-5 rounded-xl border border-terracotta/40 bg-terracotta/10 p-4 flex items-start gap-3" data-testid="anon-error">
                        <AlertTriangle className="h-5 w-5 text-terracotta shrink-0 mt-0.5" />
                        <div className="text-sm text-primary-k">{error}</div>
                    </div>
                )}

                {guard && (
                    <div className="mt-5" data-testid="anon-guard">
                        <UploadGuardNotice strict verdict={guard} busy={loading} onChooseAnother={reset} />
                    </div>
                )}

                {cooldown && (
                    <div className="mt-5 rounded-2xl border-2 border-gold bg-gold/10 p-5" data-testid="anon-cooldown">
                        <div className="font-heading text-lg text-primary-k">You&apos;ve used your free invoice check</div>
                        <p className="mt-1.5 text-sm text-primary-k/80 leading-relaxed">{cooldown.message}</p>
                        <Link to="/signup" data-testid="anon-cooldown-signup" className="mt-4 inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm hover:bg-[#091D33]">
                            Start a 7-day free trial <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                )}

                {statementRedirect && (
                    <div className="mt-5 rounded-2xl border border-kindred bg-surface-2 p-5" data-testid="anon-statement-redirect">
                        <div className="flex items-start gap-3">
                            <FileText className="h-5 w-5 text-primary-k shrink-0 mt-0.5" />
                            <div>
                                <div className="font-heading text-lg text-primary-k">That looks like your statement, not your invoice</div>
                                <p className="mt-1.5 text-sm text-muted-k">Your statement is a summary, not a bill. Decode it with the Statement Decoder, or upload the invoice to check what you actually pay.</p>
                                <div className="mt-3 flex flex-wrap gap-3">
                                    <Link to="/ai-tools/statement-decoder" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-k text-white text-sm px-4 py-2" data-testid="anon-open-statement-decoder">Open Statement Decoder <ArrowRight className="h-3.5 w-3.5" /></Link>
                                    <button type="button" onClick={reset} className="text-sm text-primary-k underline" data-testid="anon-try-invoice-instead">Upload the invoice instead</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* B5: the full result + B6: account-gated next steps */}
            {result?.reconciliation && (
                <div ref={resultRef} className="mt-8 space-y-6 scroll-mt-20" data-testid="anon-result">
                    {savedToAccount && (
                        <div className="rounded-2xl border border-sage/40 bg-sage/10 p-4 flex items-center justify-between gap-3" data-testid="anon-saved-banner">
                            <div className="flex items-center gap-2 text-primary-k">
                                <Save className="h-4 w-4 text-sage" />
                                <span className="text-sm">Saved to your account — reopen it any time.</span>
                            </div>
                            <Link to="/app/saved-checks" data-testid="anon-saved-link" className="text-sm font-semibold text-primary-k underline whitespace-nowrap">Your saved checks</Link>
                        </div>
                    )}
                    <InvoiceResultBody result={result} invoiceId={null} />

                    {/* C1: email me this result (transactional) + C4 consent */}
                    <div className="rounded-2xl border border-kindred bg-surface p-6" data-testid="anon-email-capture">
                        {!emailed ? (
                            <>
                                <div className="flex items-center gap-2">
                                    <Mail className="h-4 w-4 text-primary-k" />
                                    <div className="font-heading text-lg text-primary-k">Email this result to yourself</div>
                                </div>
                                <p className="mt-1.5 text-sm text-muted-k leading-relaxed">One field, no account needed. We&apos;ll send the full result and a link back to it.</p>
                                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                                    <input
                                        type="email"
                                        value={emailVal}
                                        onChange={(e) => setEmailVal(e.target.value)}
                                        placeholder="you@example.com"
                                        data-testid="anon-email-input"
                                        className="flex-1 rounded-lg border border-kindred bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                    <button
                                        type="button"
                                        onClick={emailResult}
                                        disabled={emailing}
                                        data-testid="anon-email-submit"
                                        className="inline-flex items-center justify-center gap-2 bg-primary-k text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-[#091D33] disabled:opacity-60"
                                    >
                                        {emailing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                                        {emailing ? "Sending…" : "Email it to me"}
                                    </button>
                                </div>
                                {emailErr && <p className="mt-2 text-sm text-terracotta" data-testid="anon-email-error">{emailErr}</p>}
                                <label className="mt-3 flex items-start gap-2.5 cursor-pointer select-none" data-testid="anon-consent-label">
                                    <input
                                        type="checkbox"
                                        checked={consent}
                                        onChange={(e) => setConsent(e.target.checked)}
                                        data-testid="anon-consent-checkbox"
                                        className="mt-0.5 h-4 w-4 flex-none rounded border-kindred text-primary-k focus:ring-primary-k"
                                    />
                                    <span className="text-xs text-muted-k leading-relaxed">
                                        Also email me occasional aged-care guides and product news from Wayly. Unsubscribe any time. (Your result is sent either way.)
                                    </span>
                                </label>
                            </>
                        ) : (
                            <div className="flex items-center gap-2 text-primary-k" data-testid="anon-email-sent">
                                <Mail className="h-5 w-5 text-sage" />
                                <span className="text-sm">Sent. Check your inbox — the full result and a link back are on their way.</span>
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border-2 border-primary-k/15 bg-primary-k/[0.04] p-6" data-testid="anon-cta-foot">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary-k" />
                            <div className="font-heading text-lg text-primary-k">Keep going with a free Wayly account</div>
                        </div>
                        <p className="mt-1.5 text-sm text-muted-k leading-relaxed">
                            Your result is saved here for 7 days. Create a free account — no card — to save it for good, draft the
                            email to your provider, reconcile it against your statement, and check another invoice.
                        </p>
                        <div className="mt-4 grid sm:grid-cols-2 gap-3">
                            <Link to={signupHref} data-testid="anon-cta-draft-letter" className="inline-flex items-center justify-center gap-2 bg-primary-k text-white rounded-lg px-4 py-3 text-sm font-medium hover:bg-[#091D33]">
                                <Mail className="h-4 w-4" /> Draft the email to my provider
                            </Link>
                            <Link to={signupHref} data-testid="anon-cta-save" className="inline-flex items-center justify-center gap-2 border border-primary-k/30 bg-surface text-primary-k rounded-lg px-4 py-3 text-sm font-medium hover:bg-surface-2">
                                <Save className="h-4 w-4" /> Save this result
                            </Link>
                            <Link to={signupHref} data-testid="anon-cta-reconcile" className="inline-flex items-center justify-center gap-2 border border-primary-k/30 bg-surface text-primary-k rounded-lg px-4 py-3 text-sm font-medium hover:bg-surface-2">
                                <ReceiptText className="h-4 w-4" /> Reconcile with my statement
                            </Link>
                            <Link to={signupHref} data-testid="anon-cta-another" className="inline-flex items-center justify-center gap-2 border border-primary-k/30 bg-surface text-primary-k rounded-lg px-4 py-3 text-sm font-medium hover:bg-surface-2">
                                <ArrowRight className="h-4 w-4" /> Check another invoice
                            </Link>
                        </div>
                    </div>

                    {/* H4: Did this help? — optional, nothing is gated on it */}
                    <div className="rounded-2xl border border-kindred bg-surface p-6" data-testid="anon-feedback">
                        {!fbSent ? (
                            <>
                                <div className="font-heading text-base text-primary-k">Did this help?</div>
                                <textarea
                                    value={fbComment}
                                    onChange={(e) => setFbComment(e.target.value)}
                                    rows={2}
                                    placeholder="Tell us in your own words (optional)…"
                                    data-testid="anon-feedback-comment"
                                    className="mt-2 w-full rounded-lg border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                />
                                <label className="mt-2 flex items-start gap-2.5 cursor-pointer select-none">
                                    <input type="checkbox" checked={fbQuote} onChange={(e) => setFbQuote(e.target.checked)} data-testid="anon-feedback-quote" className="mt-0.5 h-4 w-4 flex-none rounded border-kindred text-primary-k focus:ring-primary-k" />
                                    <span className="text-xs text-muted-k leading-relaxed">You may quote my feedback (first name only) on the Wayly site.</span>
                                </label>
                                <div className="mt-3 flex gap-2">
                                    <button type="button" onClick={() => sendFeedback(true)} data-testid="anon-feedback-yes" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-k text-white text-sm px-4 py-2 hover:bg-[#091D33]">Yes, it did</button>
                                    <button type="button" onClick={() => sendFeedback(false)} data-testid="anon-feedback-no" className="inline-flex items-center gap-1.5 rounded-lg border border-kindred bg-surface text-primary-k text-sm px-4 py-2 hover:bg-surface-2">Not really</button>
                                </div>
                            </>
                        ) : (
                            <div className="text-sm text-primary-k" data-testid="anon-feedback-thanks">Thank you — that helps us make Wayly better.</div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
