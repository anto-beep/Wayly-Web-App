/**
 * ChargeEntryDialog — FUNDTRACK-1 charge entry, a primary action with three
 * paths (locked decision #3): "from your usual care", "scan it" (through the
 * existing Invoice Checker extraction), and "type it" (what / when / how much).
 * No mandatory fields; an amount may be left blank (records an unpriced visit).
 */
import React, { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ListChecks, Camera, Pencil, Loader2, Check } from "lucide-react";

const today = () => new Date().toISOString().slice(0, 10);
const AUD = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n) || 0);
const STREAMS = ["Clinical", "Independence", "Everyday Living"];

const STREAM_FROM_CATEGORY = (c) => {
    const k = String(c || "").toLowerCase();
    if (k.includes("clinical")) return "Clinical";
    if (k.includes("independence") || k.includes("restorative")) return "Independence";
    return "Everyday Living";
};

export default function ChargeEntryDialog({ pid, savedServices = [], initialTab = "usual", onClose, onSaved }) {
    const [tab, setTab] = useState(initialTab);
    const [busy, setBusy] = useState(false);

    // type-it fields
    const [name, setName] = useState("");
    const [date, setDate] = useState(today());
    const [amount, setAmount] = useState("");
    const [stream, setStream] = useState("Everyday Living");

    // scan-it state
    const [scanRows, setScanRows] = useState(null);
    const [scanning, setScanning] = useState(false);

    const post = async (payload) => {
        setBusy(true);
        try {
            const { data } = await api.post(`/fundtrack/participants/${pid}/charges`, payload);
            toast.success(data.message || "Added");
            onSaved?.(data);
            onClose?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not add that charge.");
        } finally { setBusy(false); }
    };

    const addFromSaved = (svc) => post({
        source: "entered", service_id: svc.service_id, service_name: svc.service_name,
        stream: svc.stream, date: today(), amount: svc.last_amount,
    });

    const submitType = () => {
        if (!name.trim()) { toast.error("What was the service? Add a short name."); return; }
        post({
            source: "entered", service_name: name.trim(), stream,
            date: date || today(), amount: amount === "" ? null : Number(amount),
        });
    };

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setScanning(true); setScanRows(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const { data } = await api.post("/invoices/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
            if (data.document_shape === "statement") {
                toast.message("That looks like a statement. Upload it in the Statement Decoder for the full read.");
            }
            const lines = (data.reconciliation?.lines) || [];
            if (lines.length === 0) {
                toast.message("We couldn't read line items. You can type the charge instead.");
                setTab("type");
            } else {
                setScanRows(lines.map((ln, i) => ({
                    key: `scan-${i}`,
                    service_name: ln.service_type || ln.service_category || "Service",
                    stream: STREAM_FROM_CATEGORY(ln.service_category),
                    date: ln.service_date || today(),
                    amount: ln.gross_cost != null ? String(ln.gross_cost) : "",
                    include: true,
                })));
            }
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (err?.response?.status === 409) toast.message("You've already checked this file.");
            else toast.error(typeof detail === "string" ? detail : "We couldn't read that file.");
        } finally { setScanning(false); }
    };

    const saveScanRows = async () => {
        const rows = (scanRows || []).filter((r) => r.include);
        if (rows.length === 0) { toast.error("Tick at least one charge to add."); return; }
        setBusy(true);
        try {
            let last;
            for (const r of rows) {
                const { data } = await api.post(`/fundtrack/participants/${pid}/charges`, {
                    source: "invoice", service_name: r.service_name, stream: r.stream,
                    date: r.date || today(), amount: r.amount === "" ? null : Number(r.amount),
                });
                last = data;
            }
            toast.success(`Added ${rows.length} charge${rows.length === 1 ? "" : "s"} from your invoice.`);
            onSaved?.(last);
            onClose?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not add those charges.");
        } finally { setBusy(false); }
    };

    const TABS = [
        { key: "usual", label: "From your usual care", Icon: ListChecks },
        { key: "scan", label: "Scan it", Icon: Camera },
        { key: "type", label: "Type it", Icon: Pencil },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" data-testid="charge-entry-dialog" onClick={onClose}>
            <div className="bg-white rounded-2xl p-5 max-w-lg w-full shadow-xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="font-heading text-xl text-primary-k">Add a charge</h3>
                    <button onClick={onClose} className="text-muted-k hover:text-primary-k" data-testid="charge-entry-close"><X className="w-5 h-5" /></button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-primary-k/[0.06] p-1">
                    {TABS.map((t) => (
                        <button key={t.key} onClick={() => setTab(t.key)} data-testid={`charge-tab-${t.key}`}
                            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors ${tab === t.key ? "bg-primary-k text-white shadow-sm" : "text-primary-k/70 hover:text-primary-k"}`}>
                            <t.Icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t.label}</span>
                        </button>
                    ))}
                </div>

                {tab === "usual" && (
                    <div className="mt-4" data-testid="charge-usual">
                        {savedServices.length === 0 ? (
                            <p className="text-sm text-muted-k">No usual services saved yet. Type a charge and it'll appear here next time.</p>
                        ) : (
                            <ul className="space-y-2">
                                {savedServices.slice(0, 10).map((s) => (
                                    <li key={s.service_id}>
                                        <button onClick={() => addFromSaved(s)} disabled={busy} data-testid={`charge-usual-${s.service_id}`}
                                            className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-primary-k/10 px-3 py-2.5 hover:border-clay/50 hover:shadow-sm transition-all disabled:opacity-50">
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold text-primary-k truncate">{s.service_name}</span>
                                                <span className="block text-xs text-muted-k">{s.stream} · last {AUD(s.last_amount)}</span>
                                            </span>
                                            <span className="text-xs font-semibold text-clay shrink-0">Add for today →</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <p className="mt-3 text-[11px] text-muted-k">Date defaults to today, amount to the last amount recorded. You can fix it afterwards.</p>
                    </div>
                )}

                {tab === "type" && (
                    <div className="mt-4 space-y-3" data-testid="charge-type">
                        <label className="block"><span className="text-xs text-muted-k">What was the service?</span>
                            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Personal care" data-testid="charge-type-name" className="mt-1" /></label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block"><span className="text-xs text-muted-k">When</span>
                                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="charge-type-date" className="mt-1" /></label>
                            <label className="block"><span className="text-xs text-muted-k">How much (optional)</span>
                                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="leave blank if unknown" data-testid="charge-type-amount" className="mt-1" /></label>
                        </div>
                        <label className="block"><span className="text-xs text-muted-k">Category (we guess, you can change)</span>
                            <select value={stream} onChange={(e) => setStream(e.target.value)} data-testid="charge-type-stream" className="mt-1 w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                                {STREAMS.map((s) => <option key={s} value={s}>{s}</option>)}
                            </select></label>
                        <p className="text-[11px] text-muted-k">Leave the amount blank to record an unpriced visit — it still counts, and you can add the amount later.</p>
                        <div className="flex justify-end gap-2 pt-1">
                            <button onClick={onClose} className="text-sm text-primary-k px-4 py-2 rounded-md hover:bg-primary-k/5">Cancel</button>
                            <Button onClick={submitType} disabled={busy} data-testid="charge-type-save">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add charge"}</Button>
                        </div>
                    </div>
                )}

                {tab === "scan" && (
                    <div className="mt-4" data-testid="charge-scan">
                        {!scanRows && (
                            <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary-k/25 py-8 cursor-pointer hover:border-clay/50 transition-colors" data-testid="charge-scan-drop">
                                {scanning ? <Loader2 className="w-7 h-7 text-primary-k animate-spin" /> : <Camera className="w-7 h-7 text-primary-k" />}
                                <span className="text-sm font-semibold text-primary-k">{scanning ? "Reading your invoice…" : "Upload a photo or file of an invoice"}</span>
                                <span className="text-xs text-muted-k">We read it with the Invoice Checker. Nothing saves until you confirm.</span>
                                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} disabled={scanning} data-testid="charge-scan-file" />
                            </label>
                        )}
                        {scanRows && (
                            <div className="space-y-2" data-testid="charge-scan-confirm">
                                <p className="text-xs text-muted-k">We read these charges. Untick anything you don't want, fix amounts, then add.</p>
                                {scanRows.map((r, i) => (
                                    <div key={r.key} className="flex items-center gap-2 rounded-xl border border-primary-k/10 px-3 py-2" data-testid={`charge-scan-row-${i}`}>
                                        <button onClick={() => setScanRows((rows) => rows.map((x, j) => j === i ? { ...x, include: !x.include } : x))}
                                            className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${r.include ? "bg-primary-k border-primary-k text-white" : "border-primary-k/30"}`} data-testid={`charge-scan-toggle-${i}`}>
                                            {r.include && <Check className="w-3.5 h-3.5" />}
                                        </button>
                                        <Input value={r.service_name} onChange={(e) => setScanRows((rows) => rows.map((x, j) => j === i ? { ...x, service_name: e.target.value } : x))} className="flex-1 h-9" />
                                        <Input type="number" value={r.amount} onChange={(e) => setScanRows((rows) => rows.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} className="w-24 h-9" placeholder="$" />
                                    </div>
                                ))}
                                <div className="flex justify-end gap-2 pt-1">
                                    <button onClick={() => setScanRows(null)} className="text-sm text-primary-k px-4 py-2 rounded-md hover:bg-primary-k/5">Start over</button>
                                    <Button onClick={saveScanRows} disabled={busy} data-testid="charge-scan-save">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add charges"}</Button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
