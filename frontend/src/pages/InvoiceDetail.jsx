/**
 * InvoiceDetail
 *
 * Route: /app/invoices/:id
 *
 * Sibling to StatementDetail. Shows the full checker output for a
 * single invoice using the same visual language as the Statement
 * Decoder: summary banner, plain-English summary, issue register, and
 * clean reconciliation. All heavy lifting lives on the backend already
 * (POST /api/invoices/upload wrote reconciliation into the doc); this
 * page just fetches and renders.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, extractErrorMessage } from "@/lib/api";
import { ChevronLeft, Sparkles, Loader2, Save, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Skeleton from "@/components/Skeleton";
import {
    InvoiceResultBanner,
    InvoiceIssueRegister,
    InvoiceMetadataStrip,
    InvoiceChargesTable,
    InvoiceDownloadBar,
    InvoiceCompareView,
} from "@/components/invoices/InvoiceResultView";

export default function InvoiceDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [inv, setInv] = useState(null);
    const [error, setError] = useState(null);
    const [savingToVault, setSavingToVault] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [comparing, setComparing] = useState(false);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get(`/invoices/${id}`);
            setInv(data);
        } catch (e) {
            setError(extractErrorMessage(e, "Could not load invoice."));
        }
    }, [id]);
    useEffect(() => { load(); }, [load]);

    const saveToVault = async () => {
        setSavingToVault(true);
        try {
            await api.post(`/invoices/${id}/save-to-vault`);
            toast.success("Saved to your vault.");
            setInv((v) => v ? { ...v, saved_to_vault: true } : v);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not save. Please try again."));
        } finally {
            setSavingToVault(false);
        }
    };

    const remove = async () => {
        if (!window.confirm("Delete this invoice? This cannot be undone.")) return;
        setDeleting(true);
        try {
            await api.delete(`/invoices/${id}`);
            toast.success("Invoice deleted.");
            window.location.href = "/app/invoices";
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not delete."));
            setDeleting(false);
        }
    };

    // Bulk-draft: combine every open finding into a single well-structured
    // escalation email so the caregiver can raise the whole invoice with one
    // click. Uses the same Letters Mailbox compose URL as the per-finding
    // draft, keeping the flow familiar.
    const onDraftAllLetter = () => {
        const findings = inv?.reconciliation?.findings || [];
        if (findings.length === 0) return;
        const provider = inv?.provider_name || "your provider";
        const invNo = inv?.invoice_number || inv?.reconciliation?.invoice_number || "";
        const subject = `Review of invoice ${invNo || "(reference to follow)"} — ${findings.length} question${findings.length === 1 ? "" : "s"}`.trim();
        const lines = [
            `Hello ${provider},`,
            "",
            `I have reviewed invoice ${invNo ? "#" + invNo : ""} using Wayly and I would like to raise the following ${findings.length === 1 ? "concern" : "concerns"} in one place:`,
            "",
        ];
        findings.forEach((f, i) => {
            lines.push(`${i + 1}. [${f.check_id || "issue"}] ${f.narrative || f.suggested_question || "Please review this line."}`);
            if (f.suggested_question && f.narrative && f.suggested_question !== f.narrative) {
                lines.push(`   Question: ${f.suggested_question}`);
            }
            lines.push("");
        });
        lines.push("Could you please review these items and confirm the correct amounts, or issue adjustments where appropriate? Happy to discuss any of them.");
        lines.push("");
        lines.push("Kind regards,");
        const params = new URLSearchParams({
            source_type: "inv1_bulk",
            source_id: `${id}::bulk::${findings.length}`,
            provider_name: provider,
            subject,
            body: lines.join("\n"),
        });
        window.location.href = `/app/letters?compose=1&${params.toString()}`;
    };

    // Draft an escalation letter pre-filled with the specific finding. Uses
    // the source-aware backend bridge (POST /invoices/{id}/findings/{i}/letter)
    // so the letter template + prefill knows it came from this invoice finding.
    const onDraftLetter = async (findingIndex) => {
        try {
            const { data } = await api.post(`/invoices/${id}/findings/${findingIndex}/letter`);
            if (data?.editor_path) navigate(data.editor_path);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not draft the letter."));
        }
    };

    // Draft ONE letter covering every issue on this invoice.
    const onDraftAll = async () => {
        try {
            const { data } = await api.post(`/invoices/${id}/letter`);
            if (data?.editor_path) navigate(data.editor_path);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not draft the letter."));
        }
    };

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-16 text-center" data-testid="invoice-detail-error">
                <div className="text-terracotta text-lg">{error}</div>
                <Link to="/app/invoices" className="mt-4 inline-block text-primary-k underline">Back to invoices</Link>
            </div>
        );
    }
    if (!inv) return <Skeleton className="h-64" />;

    // Compose a shape that the shared InvoiceResultBanner expects.
    const result = {
        reconciliation: inv.reconciliation,
        provider_name: inv.provider_name,
        provider_abn: inv.provider_abn,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        document_shape: inv.document_shape,
        invoice_number: inv.invoice_number || inv?.reconciliation?.invoice_number,
    };

    return (
        <div className="space-y-6" data-testid="invoice-detail-page">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <Link to="/app/invoices" className="text-sm text-primary-k inline-flex items-center gap-1 hover:underline" data-testid="invoice-detail-back">
                    <ChevronLeft className="h-4 w-4" /> All invoices
                </Link>
                <div className="flex items-center gap-2">
                    {!inv.saved_to_vault ? (
                        <button
                            type="button"
                            onClick={saveToVault}
                            disabled={savingToVault}
                            data-testid="invoice-detail-save-vault"
                            className="text-xs inline-flex items-center gap-1.5 rounded-full bg-primary-k text-white px-3 py-1.5 hover:bg-primary-k/90 disabled:opacity-60"
                        >
                            {savingToVault ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            {savingToVault ? "Saving" : "Save to Vault"}
                        </button>
                    ) : (
                        <span className="text-xs inline-flex items-center gap-1.5 rounded-full border border-sage-200 bg-sage-50 text-sage-800 px-3 py-1.5" data-testid="invoice-detail-vaulted">
                            <CheckCircle2 className="h-3 w-3" /> In your vault
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={remove}
                        disabled={deleting}
                        data-testid="invoice-detail-delete"
                        className="text-xs inline-flex items-center gap-1.5 rounded-full border border-terracotta/25 bg-white text-terracotta hover:bg-terracotta hover:text-white px-3 py-1.5"
                    >
                        <Trash2 className="h-3 w-3" /> Delete
                    </button>
                </div>
            </div>

            <InvoiceResultBanner result={result} />

            <InvoiceMetadataStrip result={result} />

            <InvoiceDownloadBar
                invoiceId={id}
                onCompare={() => setComparing((c) => !c)}
                comparing={comparing}
            />

            {comparing && <InvoiceCompareView invoiceId={id} result={result} />}


            {inv?.reconciliation?.summary_md && (
                <section className="rounded-3xl border border-primary-k/10 bg-white p-6 sm:p-8 shadow-sm" data-testid="invoice-detail-summary">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="h-8 w-8 rounded-lg bg-primary-k/10 flex items-center justify-center">
                            <Sparkles className="h-4 w-4 text-primary-k" />
                        </div>
                        <div className="text-sm font-semibold text-primary-k tracking-wide">Wayly Summary</div>
                    </div>
                    <p className="text-[15px] text-primary-k leading-[1.7] whitespace-pre-line">
                        {inv.reconciliation.summary_md}
                    </p>
                </section>
            )}

            {(inv?.reconciliation?.findings || []).length > 1 && (
                <div className="flex justify-end -mt-2">
                    <button
                        type="button"
                        onClick={onDraftAllLetter}
                        data-testid="invoice-detail-draft-all-letter"
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary-k text-white text-sm font-medium px-4 py-2 hover:bg-primary-k/90"
                    >
                        <Sparkles className="h-4 w-4" /> Draft one letter covering all {(inv?.reconciliation?.findings || []).length} issues
                    </button>
                </div>
            )}

            <InvoiceIssueRegister findings={inv?.reconciliation?.findings || []} onDraftLetter={onDraftLetter} onDraftAll={onDraftAll} />

            <InvoiceChargesTable result={result} />
        </div>
    );
}
