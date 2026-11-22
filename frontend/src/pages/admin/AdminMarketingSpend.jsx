import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    Megaphone, Plus, Download, X, Ban, Pencil, Layers, Receipt, CheckCircle2,
} from "lucide-react";
import { adminApi } from "./AdminAuthContext";

const extractMsg = (e, f = "Error") => {
    const d = e?.response?.data?.detail;
    if (typeof d === "string") return d;
    return f;
};
const aud = (n) => `A$${Number(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function fmtDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return String(iso); }
}

const LIFECYCLE = ["planned", "approved", "booked", "invoiced", "cancelled"];
const PAYMENT = ["unpaid", "partially_paid", "paid", "refunded"];
const GST = [
    ["gst_inclusive", "GST inclusive"], ["gst_exclusive", "GST exclusive"],
    ["gst_free", "GST free"], ["no_gst_overseas", "No GST (overseas)"],
];
const PERIODS = [
    ["this_month", "This month"], ["last_month", "Last month"],
    ["this_quarter", "This quarter"], ["this_year", "This year"], ["custom", "Custom"],
];
const PAY_COLOR = { paid: "#2f7d4a", partially_paid: "#A5512B", unpaid: "#9aa0a6", refunded: "#B42318" };
const STATUS_COLOR = { planned: "#6b6b6b", approved: "#0E4D52", booked: "#A5512B", invoiced: "#8A4423", cancelled: "#B42318" };

function Field({ label, children, hint }) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--admin-muted)", fontWeight: 600 }}>{label}</span>
            {children}
            {hint && <span style={{ color: "var(--admin-muted)", fontSize: 11 }}>{hint}</span>}
        </label>
    );
}

const EMPTY = {
    activity_name: "", channel: "", category_slug: "", vendor: "", description: "",
    internal_notes: "", owner: "", campaign_id: "", cost_ex_gst: "", gst_amount: "",
    cost_inc_gst: "", gst_treatment: "gst_inclusive", planned_budget_aud: "", refund_amount_aud: "",
    invoice_reference: "", booking_date: "", service_start_date: "", service_end_date: "",
    invoice_date: "", payment_date: "", expense_reporting_date: "", status: "planned",
    payment_status: "unpaid", publisher_url: "", published_url: "", placement_confirmation: "",
    data_source: "manual", source_id: "",
    planned_amount_aud: "", committed_amount_aud: "", incurred_amount_aud: "", amount_paid_aud: "",
    credit_amount_aud: "", publisher_name: "", publication_name: "", placement_format: "",
    placement_objective: "", audience_description: "", quoted_audience_size: "",
    booked_distribution_date: "", actual_distribution_date: "", tracking_link: "",
    utm_source: "", utm_medium: "", utm_campaign: "", performance_report_url: "", performance_notes: "",
};

function ExpenseModal({ open, onClose, onSaved, categories, campaigns, editing }) {
    const [form, setForm] = useState(EMPTY);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (open) setForm(editing ? { ...EMPTY, ...Object.fromEntries(Object.entries(editing).map(([k, v]) => [k, v == null ? "" : v])) } : EMPTY);
    }, [open, editing]);
    if (!open) return null;
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const submit = async () => {
        if (!form.activity_name || !form.channel || !form.category_slug || form.cost_inc_gst === "") {
            toast.error("Activity, channel, category and cost (inc GST) are required.");
            return;
        }
        setBusy(true);
        const num = (v) => (v === "" || v == null ? undefined : Number(v));
        const payload = {
            ...form,
            cost_inc_gst: num(form.cost_inc_gst), cost_ex_gst: num(form.cost_ex_gst),
            gst_amount: num(form.gst_amount), planned_budget_aud: num(form.planned_budget_aud),
            refund_amount_aud: num(form.refund_amount_aud),
            planned_amount_aud: num(form.planned_amount_aud), committed_amount_aud: num(form.committed_amount_aud),
            incurred_amount_aud: num(form.incurred_amount_aud), amount_paid_aud: num(form.amount_paid_aud),
            credit_amount_aud: num(form.credit_amount_aud), quoted_audience_size: num(form.quoted_audience_size),
            campaign_id: form.campaign_id || undefined,
        };
        Object.keys(payload).forEach((k) => payload[k] === "" && delete payload[k]);
        try {
            if (editing) {
                await adminApi.patch(`/admin/marketing/expenses/${editing.id}`, payload);
                toast.success("Expense updated");
            } else {
                const r = await adminApi.post("/admin/marketing/expenses", payload);
                if (r.data?.duplicate_warning) toast.warning(r.data.duplicate_warning);
                toast.success(`Saved ${r.data?.expense?.expense_id || ""}`);
            }
            onSaved();
            onClose();
        } catch (e) {
            toast.error(extractMsg(e, "Could not save the expense."));
        } finally { setBusy(false); }
    };

    return (
        <div className="admin-cmdk-overlay" onClick={onClose} data-testid="expense-modal">
            <div className="admin-card" onClick={(e) => e.stopPropagation()}
                style={{ width: 720, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{editing ? "Edit expense" : "Record marketing expense"}</h2>
                    <button className="admin-btn" onClick={onClose} data-testid="expense-modal-close"><X size={16} /></button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Activity / placement name *"><input className="admin-input" data-testid="exp-activity" value={form.activity_name} onChange={set("activity_name")} /></Field>
                    <Field label="Channel *"><input className="admin-input" data-testid="exp-channel" value={form.channel} onChange={set("channel")} placeholder="email, display, search…" /></Field>
                    <Field label="Category *">
                        <select className="admin-input" data-testid="exp-category" value={form.category_slug} onChange={set("category_slug")}>
                            <option value="">Select…</option>
                            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Campaign">
                        <select className="admin-input" data-testid="exp-campaign" value={form.campaign_id} onChange={set("campaign_id")}>
                            <option value="">— none —</option>
                            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Vendor / publisher"><input className="admin-input" data-testid="exp-vendor" value={form.vendor} onChange={set("vendor")} /></Field>
                    <Field label="Owner"><input className="admin-input" value={form.owner} onChange={set("owner")} /></Field>

                    <Field label="Cost incl GST (AUD) *"><input type="number" className="admin-input" data-testid="exp-cost-inc" value={form.cost_inc_gst} onChange={set("cost_inc_gst")} /></Field>
                    <Field label="GST treatment">
                        <select className="admin-input" data-testid="exp-gst-treatment" value={form.gst_treatment} onChange={set("gst_treatment")}>
                            {GST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                    </Field>
                    <Field label="Cost excl GST (AUD)"><input type="number" className="admin-input" value={form.cost_ex_gst} onChange={set("cost_ex_gst")} /></Field>
                    <Field label="GST amount (AUD)"><input type="number" className="admin-input" value={form.gst_amount} onChange={set("gst_amount")} /></Field>
                    <Field label="Planned budget (AUD)"><input type="number" className="admin-input" value={form.planned_budget_aud} onChange={set("planned_budget_aud")} /></Field>
                    <Field label="Invoice reference"><input className="admin-input" value={form.invoice_reference} onChange={set("invoice_reference")} /></Field>

                    <Field label="Lifecycle status">
                        <select className="admin-input" data-testid="exp-status" value={form.status} onChange={set("status")}>
                            {LIFECYCLE.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </Field>
                    <Field label="Payment status">
                        <select className="admin-input" data-testid="exp-payment-status" value={form.payment_status} onChange={set("payment_status")}>
                            {PAYMENT.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                        </select>
                    </Field>
                    <Field label="Reporting date" hint="Totals are grouped by this date"><input type="date" className="admin-input" data-testid="exp-reporting-date" value={form.expense_reporting_date} onChange={set("expense_reporting_date")} /></Field>
                    <Field label="Booking date"><input type="date" className="admin-input" value={form.booking_date} onChange={set("booking_date")} /></Field>
                    <Field label="Service start"><input type="date" className="admin-input" value={form.service_start_date} onChange={set("service_start_date")} /></Field>
                    <Field label="Service end"><input type="date" className="admin-input" value={form.service_end_date} onChange={set("service_end_date")} /></Field>
                    <Field label="Invoice date"><input type="date" className="admin-input" value={form.invoice_date} onChange={set("invoice_date")} /></Field>
                    <Field label="Payment date"><input type="date" className="admin-input" value={form.payment_date} onChange={set("payment_date")} /></Field>
                    <Field label="Publisher / campaign URL"><input className="admin-input" value={form.publisher_url} onChange={set("publisher_url")} /></Field>
                    <Field label="Published article / newsletter URL"><input className="admin-input" value={form.published_url} onChange={set("published_url")} /></Field>
                </div>
                <div style={{ marginTop: 14, borderTop: "1px solid var(--admin-border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0E4D52", marginBottom: 8 }}>Financial detail (distinct lenses — never summed together)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        <Field label="Committed (AUD)"><input type="number" className="admin-input" data-testid="exp-committed" value={form.committed_amount_aud} onChange={set("committed_amount_aud")} /></Field>
                        <Field label="Incurred (AUD)"><input type="number" className="admin-input" data-testid="exp-incurred" value={form.incurred_amount_aud} onChange={set("incurred_amount_aud")} /></Field>
                        <Field label="Amount paid (AUD)"><input type="number" className="admin-input" data-testid="exp-paid" value={form.amount_paid_aud} onChange={set("amount_paid_aud")} /></Field>
                        <Field label="Planned (AUD)"><input type="number" className="admin-input" value={form.planned_amount_aud} onChange={set("planned_amount_aud")} /></Field>
                        <Field label="Credit / refund (AUD)"><input type="number" className="admin-input" value={form.credit_amount_aud} onChange={set("credit_amount_aud")} /></Field>
                    </div>
                </div>
                <div style={{ marginTop: 14, borderTop: "1px solid var(--admin-border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0E4D52", marginBottom: 8 }}>Publisher & media placement (EDM, Solus, newsletter, advertorial)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <Field label="Publisher name"><input className="admin-input" data-testid="exp-publisher" value={form.publisher_name} onChange={set("publisher_name")} /></Field>
                        <Field label="Publication / newsletter"><input className="admin-input" value={form.publication_name} onChange={set("publication_name")} /></Field>
                        <Field label="Placement format"><input className="admin-input" value={form.placement_format} onChange={set("placement_format")} placeholder="Solus EDM, advertorial…" /></Field>
                        <Field label="Quoted audience size"><input type="number" className="admin-input" value={form.quoted_audience_size} onChange={set("quoted_audience_size")} /></Field>
                        <Field label="Booked distribution date"><input type="date" className="admin-input" value={form.booked_distribution_date} onChange={set("booked_distribution_date")} /></Field>
                        <Field label="Actual distribution date"><input type="date" className="admin-input" value={form.actual_distribution_date} onChange={set("actual_distribution_date")} /></Field>
                        <Field label="Tracking link"><input className="admin-input" value={form.tracking_link} onChange={set("tracking_link")} /></Field>
                        <Field label="UTM source"><input className="admin-input" value={form.utm_source} onChange={set("utm_source")} /></Field>
                    </div>
                </div>
                <Field label="Description"><textarea className="admin-input" rows={2} value={form.description} onChange={set("description")} /></Field>
                <Field label="Internal notes"><textarea className="admin-input" rows={2} value={form.internal_notes} onChange={set("internal_notes")} /></Field>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                    <button className="admin-btn" onClick={onClose}>Cancel</button>
                    <button className="admin-btn admin-btn-primary" data-testid="expense-save" disabled={busy} onClick={submit}>
                        {busy ? "Saving…" : editing ? "Save changes" : "Save expense"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function CampaignModal({ open, onClose, onSaved }) {
    const [form, setForm] = useState({ name: "", planned_budget_aud: "", owner: "", start_date: "", end_date: "", description: "" });
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (open) setForm({ name: "", planned_budget_aud: "", owner: "", start_date: "", end_date: "", description: "" }); }, [open]);
    if (!open) return null;
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const submit = async () => {
        if (!form.name) { toast.error("Campaign name is required."); return; }
        setBusy(true);
        try {
            await adminApi.post("/admin/marketing/campaigns", {
                ...form, planned_budget_aud: form.planned_budget_aud === "" ? undefined : Number(form.planned_budget_aud),
            });
            toast.success("Campaign created");
            onSaved(); onClose();
        } catch (e) { toast.error(extractMsg(e, "Could not create campaign.")); }
        finally { setBusy(false); }
    };
    return (
        <div className="admin-cmdk-overlay" onClick={onClose} data-testid="campaign-modal">
            <div className="admin-card" onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "95vw", padding: 20 }}>
                <h2 style={{ marginTop: 0, fontSize: 18 }}>New campaign</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <Field label="Name *"><input className="admin-input" data-testid="camp-name" value={form.name} onChange={set("name")} /></Field>
                    <Field label="Planned budget (AUD)"><input type="number" className="admin-input" data-testid="camp-budget" value={form.planned_budget_aud} onChange={set("planned_budget_aud")} /></Field>
                    <div style={{ display: "flex", gap: 10 }}>
                        <Field label="Start"><input type="date" className="admin-input" value={form.start_date} onChange={set("start_date")} /></Field>
                        <Field label="End"><input type="date" className="admin-input" value={form.end_date} onChange={set("end_date")} /></Field>
                    </div>
                    <Field label="Owner"><input className="admin-input" value={form.owner} onChange={set("owner")} /></Field>
                    <Field label="Description"><textarea className="admin-input" rows={2} value={form.description} onChange={set("description")} /></Field>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                    <button className="admin-btn" onClick={onClose}>Cancel</button>
                    <button className="admin-btn admin-btn-primary" data-testid="campaign-save" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Create"}</button>
                </div>
            </div>
        </div>
    );
}

function SummaryStrip({ summary, period, setPeriod }) {
    const t = summary?.totals || {};
    const cards = [
        ["Total investment", aud(t.total_investment_aud)],
        ["Paid media", aud(t.paid_media_spend_aud)],
        ["Committed", aud(t.committed_aud)],
        ["Incurred", aud(t.incurred_aud)],
        ["Paid", aud(t.paid_aud)],
        ["Outstanding", aud(t.outstanding_aud)],
        ["Planned", aud(t.planned_aud)],
        ["Budget remaining", aud(t.budget_remaining_aud)],
    ];
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>Period:</span>
                <select className="admin-input" data-testid="summary-period" value={period} onChange={(e) => setPeriod(e.target.value)} style={{ fontSize: 13, padding: "5px 10px" }}>
                    {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {summary?.period && <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>{summary.period.from} → {summary.period.to} · grouped by {summary.period.date_basis}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }} data-testid="summary-cards">
                {cards.map(([l, v]) => (
                    <div key={l} className="admin-card" style={{ padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{l}</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{v}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CampaignFinancialsModal({ campaignId, onClose, onChanged }) {
    const [fin, setFin] = useState(null);
    const load = useCallback(async () => {
        try { const r = await adminApi.get(`/admin/marketing/campaigns/${campaignId}/financials`); setFin(r.data); }
        catch (e) { toast.error(extractMsg(e, "Could not load campaign financials.")); onClose(); }
    }, [campaignId, onClose]);
    useEffect(() => { load(); }, [load]);
    const setBudget = async () => {
        const v = window.prompt("Approved budget (AUD):");
        if (v == null || v === "") return;
        try { await adminApi.post(`/admin/marketing/campaigns/${campaignId}/budget`, { approved_budget_aud: Number(v) }); toast.success("Budget updated"); load(); onChanged && onChanged(); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    if (!fin) return null;
    const t = fin.totals, p = fin.performance;
    const perfRow = (label, val) => (
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
            <span style={{ color: "var(--admin-muted)" }}>{label}</span><span style={{ fontWeight: 600 }}>{val}</span>
        </div>
    );
    return (
        <div className="admin-cmdk-overlay" onClick={onClose} data-testid="campaign-financials-modal">
            <div className="admin-card" onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{fin.campaign.name} — financials</h2>
                    <button className="admin-btn" onClick={onClose}><X size={16} /></button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: 10, marginBottom: 14 }}>
                    {[["Budget", aud(fin.budget.effective_budget_aud)], ["Planned", aud(t.planned_aud)], ["Committed", aud(t.committed_aud)],
                    ["Incurred", aud(t.incurred_aud)], ["Paid", aud(t.paid_aud)], ["Outstanding", aud(t.outstanding_aud)],
                    ["Remaining", aud(fin.remaining_uncommitted_aud)], ["Variance", aud(fin.variance_vs_budget_aud)]].map(([l, v]) => (
                        <div key={l} className="admin-card" style={{ padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "var(--admin-muted)", textTransform: "uppercase" }}>{l}</div>
                            <div style={{ fontSize: 16, fontWeight: 700 }}>{v}</div>
                        </div>
                    ))}
                </div>
                <button className="admin-btn" onClick={setBudget} data-testid="campaign-set-budget" style={{ marginBottom: 14 }}>Set approved budget</button>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Performance <span style={{ fontWeight: 400, fontSize: 11, color: "var(--admin-muted)" }}>(attribution: {p.attribution.replace(/_/g, " ")})</span></div>
                {perfRow("Cost basis", aud(p.cost_basis_aud))}
                {perfRow("Cost per enquiry", p.cost_per_enquiry_aud == null ? "attribution unavailable" : aud(p.cost_per_enquiry_aud))}
                {perfRow("Cost per registration", p.cost_per_registration_aud == null ? "attribution unavailable" : aud(p.cost_per_registration_aud))}
                {perfRow("Cost per trial checkout", p.cost_per_trial_checkout_aud == null ? "attribution unavailable" : aud(p.cost_per_trial_checkout_aud))}
                {perfRow("Cost per paid subscriber", p.cost_per_paid_subscriber_aud == null ? "attribution unavailable" : aud(p.cost_per_paid_subscriber_aud))}
                {perfRow("ROAS", p.roas == null ? "attribution unavailable" : `${p.roas}×`)}
                {perfRow("Marketing ROI", p.marketing_roi == null ? "attribution unavailable" : `${p.marketing_roi}×`)}
                <p style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 10 }}>{fin.meta.note}</p>
            </div>
        </div>
    );
}

export default function AdminMarketingSpend() {
    const [tab, setTab] = useState("expenses");
    const [categories, setCategories] = useState([]);
    const [campaigns, setCampaigns] = useState([]);
    const [summary, setSummary] = useState(null);
    const [period, setPeriod] = useState("this_month");
    const [expenses, setExpenses] = useState(null);
    const [filters, setFilters] = useState({ channel: "", category_slug: "", status: "", payment_status: "", data_source: "" });
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [campModalOpen, setCampModalOpen] = useState(false);
    const [finCampaign, setFinCampaign] = useState(null);

    const loadMeta = useCallback(async () => {
        try {
            const [c, cp] = await Promise.all([
                adminApi.get("/admin/marketing/categories"),
                adminApi.get("/admin/marketing/campaigns"),
            ]);
            setCategories(c.data.categories || []);
            setCampaigns(cp.data.campaigns || []);
        } catch (e) { toast.error(extractMsg(e, "Could not load setup data.")); }
    }, []);

    const loadSummary = useCallback(async () => {
        try {
            const r = await adminApi.get("/admin/marketing/summary", { params: { period } });
            setSummary(r.data);
        } catch (e) { toast.error(extractMsg(e, "Could not load summary.")); }
    }, [period]);

    const loadExpenses = useCallback(async () => {
        try {
            const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
            const r = await adminApi.get("/admin/marketing/expenses", { params: { ...params, page_size: 200 } });
            setExpenses(r.data);
        } catch (e) { toast.error(extractMsg(e, "Could not load expenses.")); }
    }, [filters]);

    useEffect(() => { loadMeta(); }, [loadMeta]);
    useEffect(() => { loadSummary(); }, [loadSummary]);
    useEffect(() => { loadExpenses(); }, [loadExpenses]);

    const refreshAll = () => { loadExpenses(); loadSummary(); loadMeta(); };

    const voidExpense = async (id) => {
        const reason = window.prompt("Reason for voiding this expense (kept in the audit trail):");
        if (!reason) return;
        try {
            await adminApi.post(`/admin/marketing/expenses/${id}/void`, { reason });
            toast.success("Expense voided");
            refreshAll();
        } catch (e) { toast.error(extractMsg(e, "Could not void.")); }
    };

    const exportCsv = async () => {
        try {
            const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
            const r = await adminApi.get("/admin/marketing/expenses/export.csv", { params, responseType: "blob" });
            const url = URL.createObjectURL(r.data);
            const a = document.createElement("a");
            a.href = url; a.download = "marketing_expenses.csv"; a.click();
            URL.revokeObjectURL(url);
        } catch (e) { toast.error(extractMsg(e, "Export failed.")); }
    };

    const rows = expenses?.expenses || [];

    return (
        <div data-testid="admin-marketing-spend">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Megaphone size={22} />
                    <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Marketing Spend & Investment</h1>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="admin-btn" onClick={exportCsv} data-testid="spend-export" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Download size={14} /> Export CSV</button>
                    <button className="admin-btn admin-btn-primary" data-testid="spend-add-expense" onClick={() => { setEditing(null); setModalOpen(true); }} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add expense</button>
                </div>
            </div>
            <p style={{ color: "var(--admin-muted)", marginTop: 0, fontSize: 13 }}>All amounts in AUD. Paid, committed and planned are tracked separately; cash dates never mix with service dates in totals.</p>

            <SummaryStrip summary={summary} period={period} setPeriod={setPeriod} />

            {/* Tabs */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }} data-testid="spend-tabs">
                {[["expenses", "Expenses", Receipt], ["campaigns", "Campaigns", Layers]].map(([k, l, Icon]) => (
                    <button key={k} data-testid={`spend-tab-${k}`} onClick={() => setTab(k)} className="admin-btn"
                        style={{ fontSize: 13, padding: "6px 14px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6,
                            background: tab === k ? "var(--admin-fg,#0E4D52)" : "transparent", color: tab === k ? "#fff" : "var(--admin-muted)",
                            border: tab === k ? "none" : "1px solid var(--admin-border)" }}>
                        <Icon size={14} /> {l}
                    </button>
                ))}
            </div>

            {tab === "expenses" && (
                <>
                    {/* Filters */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                        <select className="admin-input" data-testid="filter-category" value={filters.category_slug} onChange={(e) => setFilters((f) => ({ ...f, category_slug: e.target.value }))} style={{ fontSize: 13, padding: "6px 10px" }}>
                            <option value="">All categories</option>
                            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                        </select>
                        <select className="admin-input" data-testid="filter-status" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} style={{ fontSize: 13, padding: "6px 10px" }}>
                            <option value="">Any status</option>{LIFECYCLE.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select className="admin-input" data-testid="filter-payment" value={filters.payment_status} onChange={(e) => setFilters((f) => ({ ...f, payment_status: e.target.value }))} style={{ fontSize: 13, padding: "6px 10px" }}>
                            <option value="">Any payment</option>{PAYMENT.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                        </select>
                        <select className="admin-input" data-testid="filter-source" value={filters.data_source} onChange={(e) => setFilters((f) => ({ ...f, data_source: e.target.value }))} style={{ fontSize: 13, padding: "6px 10px" }}>
                            <option value="">Any source</option><option value="manual">Manual</option><option value="csv_import">CSV import</option><option value="api_integration">API</option>
                        </select>
                        <input className="admin-input" data-testid="filter-channel" placeholder="Channel…" value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))} style={{ fontSize: 13, padding: "6px 10px" }} />
                    </div>

                    <div className="admin-card" style={{ overflowX: "auto" }}>
                        <table className="admin-table">
                            <thead><tr>
                                <th>ID</th><th>Activity</th><th>Category</th><th>Vendor</th>
                                <th style={{ textAlign: "right" }}>Inc GST</th><th>Status</th><th>Payment</th><th>Reporting</th><th>Source</th><th></th>
                            </tr></thead>
                            <tbody>
                                {!expenses ? (
                                    <tr><td colSpan={10} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                                ) : rows.length === 0 ? (
                                    <tr><td colSpan={10} style={{ textAlign: "center", padding: 28, color: "var(--admin-muted)" }} data-testid="spend-empty">
                                        No expenses recorded yet. Click <strong>Add expense</strong> to record your first marketing investment.
                                    </td></tr>
                                ) : rows.map((e) => (
                                    <tr key={e.id} data-testid={`expense-row-${e.id}`} style={{ opacity: e.voided ? 0.5 : 1 }}>
                                        <td className="admin-mono" style={{ fontSize: 12 }}>{e.expense_id}</td>
                                        <td style={{ fontWeight: 600, fontSize: 13 }}>{e.activity_name}<div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{e.channel}</div></td>
                                        <td style={{ fontSize: 12 }}>{e.category_name}</td>
                                        <td style={{ fontSize: 12 }}>{e.vendor || "—"}</td>
                                        <td style={{ textAlign: "right", fontWeight: 600, fontSize: 13 }}>{aud(e.cost_inc_gst)}</td>
                                        <td><span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[e.status] || "#0E4D52", textTransform: "capitalize" }}>{e.status}</span></td>
                                        <td><span style={{ fontSize: 11, fontWeight: 700, color: PAY_COLOR[e.payment_status] || "#6b6b6b" }}>{(e.payment_status || "").replace("_", " ")}</span></td>
                                        <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(e.expense_reporting_date)}</td>
                                        <td style={{ fontSize: 11, color: "var(--admin-muted)" }}>{e.data_source}</td>
                                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                            {!e.voided && (
                                                <>
                                                    <button className="admin-btn" data-testid={`expense-edit-${e.id}`} onClick={() => { setEditing(e); setModalOpen(true); }} style={{ padding: "4px 8px", marginRight: 4 }}><Pencil size={12} /></button>
                                                    <button className="admin-btn" data-testid={`expense-void-${e.id}`} onClick={() => voidExpense(e.id)} style={{ padding: "4px 8px", color: "#B42318" }}><Ban size={12} /></button>
                                                </>
                                            )}
                                            {e.voided && <span style={{ fontSize: 11, color: "#B42318", fontWeight: 600 }}>voided</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {expenses && <div style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 8 }}>{expenses.total} expense(s)</div>}
                </>
            )}

            {tab === "campaigns" && (
                <>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                        <button className="admin-btn admin-btn-primary" data-testid="spend-add-campaign" onClick={() => setCampModalOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> New campaign</button>
                    </div>
                    <div className="admin-card" style={{ overflowX: "auto" }}>
                        <table className="admin-table">
                            <thead><tr><th>Campaign</th><th style={{ textAlign: "right" }}>Budget</th><th style={{ textAlign: "right" }}>Total</th><th style={{ textAlign: "right" }}>Paid</th><th style={{ textAlign: "right" }}>Committed</th><th style={{ textAlign: "right" }}>Planned</th><th style={{ textAlign: "right" }}>Expenses</th><th></th></tr></thead>
                            <tbody>
                                {campaigns.length === 0 ? (
                                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 28, color: "var(--admin-muted)" }} data-testid="campaigns-empty">No campaigns yet. Group related expenses by creating one.</td></tr>
                                ) : campaigns.map((c) => (
                                    <tr key={c.id} data-testid={`campaign-row-${c.id}`}>
                                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                                        <td style={{ textAlign: "right" }}>{c.planned_budget_aud != null ? aud(c.planned_budget_aud) : "—"}</td>
                                        <td style={{ textAlign: "right", fontWeight: 700 }}>{aud(c.total_investment_aud)}</td>
                                        <td style={{ textAlign: "right", color: "#2f7d4a" }}>{aud(c.paid_aud)}</td>
                                        <td style={{ textAlign: "right", color: "#A5512B" }}>{aud(c.committed_aud)}</td>
                                        <td style={{ textAlign: "right", color: "#6b6b6b" }}>{aud(c.planned_aud)}</td>
                                        <td style={{ textAlign: "right" }}>{c.expense_count}</td>
                                        <td style={{ textAlign: "right" }}><button className="admin-btn" data-testid={`campaign-financials-${c.id}`} onClick={() => setFinCampaign(c.id)} style={{ padding: "3px 10px", fontSize: 12 }}>Financials</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <ExpenseModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={refreshAll} categories={categories} campaigns={campaigns} editing={editing} />
            <CampaignModal open={campModalOpen} onClose={() => setCampModalOpen(false)} onSaved={refreshAll} />
            {finCampaign && <CampaignFinancialsModal campaignId={finCampaign} onClose={() => setFinCampaign(null)} onChanged={refreshAll} />}
        </div>
    );
}
