/**
 * PSW-1 v1 · Post-Switch Settlement dashboard with refund tracking.
 * Route: /app/participants/:id/switches/:sid/settlement
 */
import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { ChevronLeft, CheckCircle2, AlertTriangle, DollarSign, ExternalLink } from "lucide-react";
import PageIntro from "@/components/PageIntro";

const STATUS_STYLE = {
    review_complete_refund_pending: { tone: "text-amber-700", bg: "bg-amber-50 border-amber-100", label: "Refund Pending" },
    not_yet_calculated: { tone: "text-amber-700", bg: "bg-amber-50 border-amber-100", label: "Refund Pending" },
    pending_receipt: { tone: "text-amber-700", bg: "bg-amber-50 border-amber-100", label: "Refund Pending" },
    refund_received_reconciled: { tone: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100", label: "Reconciled" },
    received_matches_expected: { tone: "text-emerald-700", bg: "bg-emerald-50 border-emerald-100", label: "Reconciled" },
    refund_received_variance_flagged: { tone: "text-red-700", bg: "bg-red-50 border-red-100", label: "Variance Flagged · Dispute Opened" },
    received_less_than_expected_disputed: { tone: "text-red-700", bg: "bg-red-50 border-red-100", label: "Variance Flagged · Dispute Opened" },
};

function money(m) {
    if (!m || m.amount === null || m.amount === undefined) return ",";
    const amt = Number(m.amount);
    return `$${amt.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function VarianceStrip({ variance }) {
    if (variance === null || variance === undefined || variance === 0) {
        return (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 flex items-center gap-2"
                 data-testid="psw1-settle-variance-zero">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                <p className="text-sm text-emerald-800">Refund received matches expected. No variance.</p>
            </div>
        );
    }
    const shortfall = variance > 0;
    return (
        <div className={`rounded-xl border p-3 flex items-start gap-2 ${shortfall ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}
             data-testid="psw1-settle-variance">
            <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${shortfall ? "text-red-700" : "text-amber-700"}`} />
            <div>
                <p className={`text-sm font-medium ${shortfall ? "text-red-800" : "text-amber-800"}`}>
                    {shortfall ? "Refund shortfall" : "Refund overage"}: ${Math.abs(variance).toFixed(2)}
                </p>
                <p className="text-xs mt-1 text-primary-k/60">
                    {shortfall
                        ? "A LOOP-1 dispute case was opened automatically. Track progress under Cases."
                        : "You received more than expected. This may be an accounting adjustment on the provider&#39;s side."}
                </p>
            </div>
        </div>
    );
}

function ReceiveRefundForm({ settlementId, onRecorded }) {
    const [amount, setAmount] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            const { data } = await api.post(`/psw1/settlements/${settlementId}/refund-received`, {
                refund_received_amount: Number(amount),
            });
            onRecorded(data);
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not record refund receipt.");
        } finally { setBusy(false); }
    };
    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-3"
             data-testid="psw1-settle-receive-form">
            <p className="text-xs uppercase tracking-wide text-primary-k/50">Record refund receipt</p>
            <label className="text-sm text-primary-k block">
                Amount received (AUD)
                <input type="number" step="0.01" value={amount}
                       onChange={e => setAmount(e.target.value)}
                       className="mt-1 w-full text-sm border border-primary-k/20 rounded-lg p-2"
                       data-testid="psw1-settle-amount-input" />
            </label>
            {err && <p className="text-xs text-red-700" data-testid="psw1-settle-error">{err}</p>}
            <button onClick={submit} disabled={busy || !amount}
                    className="text-xs px-4 py-2 rounded-full bg-primary-k text-white disabled:opacity-50"
                    data-testid="psw1-settle-submit">
                {busy ? "Recording..." : "Record receipt"}
            </button>
        </div>
    );
}

function CreateSettlementForm({ switchId, onCreated }) {
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("prepaid_less_delivered_services");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            const { data } = await api.post(`/psw1/switches/${switchId}/post-switch-settlement`, {
                refund_calculated_amount: Number(amount),
                refund_calculation_method: method,
            });
            onCreated(data.settlement);
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not create settlement.");
        } finally { setBusy(false); }
    };
    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-3"
             data-testid="psw1-settle-create-form">
            <p className="text-xs uppercase tracking-wide text-primary-k/50">Create settlement record</p>
            <p className="text-xs text-primary-k/60">
                The old provider&#39;s final invoice should reflect only services delivered up to the effective date.
                Any prepaid balance is owed back to you.
            </p>
            <label className="text-sm text-primary-k block">
                Refund expected (AUD)
                <input type="number" step="0.01" value={amount}
                       onChange={e => setAmount(e.target.value)}
                       className="mt-1 w-full text-sm border border-primary-k/20 rounded-lg p-2"
                       data-testid="psw1-settle-create-amount" />
            </label>
            <label className="text-sm text-primary-k block">
                Calculation basis
                <select value={method} onChange={e => setMethod(e.target.value)}
                        className="mt-1 w-full text-sm border border-primary-k/20 rounded-lg p-2"
                        data-testid="psw1-settle-create-method">
                    <option value="prepaid_less_delivered_services">Prepaid Less Delivered Services</option>
                    <option value="unused_credit_from_agreement">Unused Credit From Agreement</option>
                    <option value="pro_rata_month_charge">Pro-Rata Month Charge</option>
                    <option value="other">Other</option>
                </select>
            </label>
            {err && <p className="text-xs text-red-700">{err}</p>}
            <button onClick={submit} disabled={busy || !amount}
                    className="text-xs px-4 py-2 rounded-full bg-primary-k text-white disabled:opacity-50"
                    data-testid="psw1-settle-create-submit">
                {busy ? "Creating..." : "Create settlement"}
            </button>
        </div>
    );
}

export default function SwitchSettlement() {
    const { id: pid, sid } = useParams();
    const [sw, setSw] = useState(null);
    const [settlement, setSettlement] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const { data } = await api.get(`/psw1/switches/${sid}`);
            setSw(data.switch);
            if (data.switch?.post_switch_settlement_id) {
                // We don't have a direct GET for settlements yet; fetch via a lightweight approach:
                // We'll rely on switch fields (refund_amount_expected, refund_amount_received, refund_status).
                // The variance can be computed from those.
                setSettlement({
                    id: data.switch.post_switch_settlement_id,
                    refund_calculated_amount: data.switch.refund_amount_expected,
                    refund_received_amount: data.switch.refund_amount_received,
                    refund_status: data.switch.refund_status,
                });
            }
        } catch (e) {
            setErr(e?.response?.data?.detail || "Could not load settlement.");
        } finally { setLoading(false); }
    }, [sid]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="max-w-3xl mx-auto p-6"><Skeleton className="h-40" /></div>;
    if (err) return <div className="max-w-3xl mx-auto p-6 text-red-700" data-testid="psw1-settle-load-error">{err}</div>;

    const hasSettlement = !!settlement && settlement.refund_calculated_amount;
    const expected = settlement?.refund_calculated_amount?.amount || 0;
    const received = settlement?.refund_received_amount?.amount;
    const variance = received !== null && received !== undefined ? +(expected - received).toFixed(2) : null;
    const style = STATUS_STYLE[settlement?.refund_status] || STATUS_STYLE.review_complete_refund_pending;

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="psw1-settlement-root">
            <Link to={`/app/participants/${pid}/switches`}
                  className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4" /> Back to Switches
            </Link>

            <PageIntro
                eyebrow="Post-Switch Settlement"
                title={`Refund Tracking for ${sw?.current_provider_name || "This Switch"}`}
                description="Any prepaid balance the old provider held should come back to you. This dashboard tracks the expected refund, records what actually arrives, and opens a dispute case if there's a shortfall."
                whatItDoes="Records the expected refund amount, logs the actual receipt when it arrives, and flags any variance so you can act quickly."
                howToUse={[
                    "Create a settlement record with the expected refund amount.",
                    "Once payment arrives, record the receipt (bank date + amount).",
                    "If the amount is short, click the dispute button, a case is opened automatically.",
                    "When everything reconciles, the switch is marked complete.",
                ]}
                whatYouGet={[
                    "A single source of truth for money owed after a switch.",
                    "Automatic dispute case creation for shortfalls.",
                    "Confidence you didn't leave money on the table.",
                ]}
            />

            {!hasSettlement ? (
                <CreateSettlementForm switchId={sid} onCreated={(s) => setSettlement(s)} />
            ) : (
                <>
                    <section className="rounded-2xl border border-primary-k/10 bg-white p-5"
                             data-testid="psw1-settle-summary">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-primary-k/50">Status</p>
                                <span className={`inline-block mt-2 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${style.bg} ${style.tone}`}
                                      data-testid="psw1-settle-status">{style.label}</span>
                            </div>
                            <DollarSign className="w-6 h-6 text-primary-k/20" />
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-primary-k/50">Expected</p>
                                <p className="text-primary-k font-medium mt-1"
                                   data-testid="psw1-settle-expected">
                                    {money(settlement.refund_calculated_amount)}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-primary-k/50">Received</p>
                                <p className="text-primary-k font-medium mt-1"
                                   data-testid="psw1-settle-received">
                                    {settlement.refund_received_amount ? money(settlement.refund_received_amount) : "not yet"}
                                </p>
                            </div>
                        </div>
                        {settlement.refund_received_amount && (
                            <div className="mt-4">
                                <VarianceStrip variance={variance} />
                            </div>
                        )}
                    </section>

                    {!settlement.refund_received_amount && (
                        <ReceiveRefundForm settlementId={settlement.id}
                                           onRecorded={() => load()} />
                    )}

                    {sw?.related_case_ids?.length > 0 && (
                        <div className="rounded-xl border border-primary-k/10 bg-primary-k/5 p-4">
                            <p className="text-xs uppercase tracking-wide text-primary-k/50">Linked Cases</p>
                            <p className="text-sm text-primary-k mt-2">
                                Dispute case created via LOOP-1. Track progress in your cases list.
                            </p>
                            <Link to="/app/cases" className="text-xs text-primary-k inline-flex items-center gap-1 mt-2"
                                  data-testid="psw1-settle-cases-link">
                                Open Cases <ExternalLink className="w-3 h-3" />
                            </Link>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
