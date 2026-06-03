/**
 * Care Plan Amendment Generator — builds a formal amendment letter for the
 * caregiver to send to their provider.
 */
import React, { useEffect, useState, useCallback } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { FilePenLine, Plus, Trash2, Send, Copy, Mail, X } from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";
import { useAuth } from "@/context/AuthContext";
import VoiceInput from "@/components/VoiceInput";

const EMPTY_ITEM = { service_name: "", change_type: "increase", reason: "" };
const CHANGE_LABELS = {
    add: "Add a new service",
    increase: "Increase frequency / hours",
    decrease: "Decrease frequency / hours",
    remove: "Remove a service",
    swap: "Swap one service for another",
};

export default function CarePlanAmendments() {
    const { user } = useAuth();
    const { items: participants, active } = useParticipants();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    const [participantId, setParticipantId] = useState(active?.id || "");
    const [senderName, setSenderName] = useState(user?.name || "");
    const [senderRole, setSenderRole] = useState("primary caregiver");
    const [items, setItems] = useState([EMPTY_ITEM]);
    const [generating, setGenerating] = useState(false);
    const [preview, setPreview] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/amendments");
            setHistory(data.items || []);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not load amendments"));
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { if (!participantId && active?.id) setParticipantId(active.id); }, [active, participantId]);

    const setItem = (idx, patch) => {
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    };
    const addItem = () => setItems((prev) => [...prev, EMPTY_ITEM]);
    const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

    const generate = async () => {
        const cleaned = items.filter((it) => it.service_name.trim() && it.reason.trim());
        if (cleaned.length === 0) { toast.error("Add at least one change with a reason."); return; }
        if (!senderName.trim()) { toast.error("Your name is required."); return; }
        setGenerating(true);
        try {
            const { data } = await api.post("/amendments/generate", {
                participant_id: participantId,
                sender_name: senderName.trim(),
                sender_role: senderRole.trim() || "primary caregiver",
                items: cleaned,
            });
            setPreview(data);
            setItems([EMPTY_ITEM]);
            await load();
            toast.success("Amendment letter generated");
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not generate"));
        } finally { setGenerating(false); }
    };

    const copyLetter = (txt) => {
        try {
            navigator.clipboard.writeText(txt);
            toast.success("Letter copied to clipboard");
        } catch {
            toast.error("Copy failed");
        }
    };

    const mailLetter = (txt, providerName) => {
        const subject = `Request to amend the Support at Home care plan`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(txt)}`;
    };

    const setStatus = async (id, status) => {
        try {
            await api.post(`/amendments/${id}/status`, { status });
            await load();
            if (preview?.id === id) setPreview({ ...preview, status });
            toast.success(`Marked as ${status}`);
        } catch (e) {
            toast.error("Could not update status");
        }
    };

    return (
        <div className="space-y-6" data-testid="amendments-page">
            <div>
                <h1 className="font-heading text-3xl text-primary-k tracking-tight flex items-center gap-2">
                    <FilePenLine className="h-6 w-6 text-gold" /> Care Plan Amendments
                </h1>
                <p className="text-sm text-muted-k mt-1 max-w-2xl">
                    Build a clear, formal request to change the care plan — provider will receive the changes you actually need, in writing.
                </p>
            </div>

            {/* Builder */}
            <div className="bg-surface border border-kindred rounded-2xl p-5 space-y-4" data-testid="amendment-builder">
                <h2 className="font-heading text-lg text-primary-k">New amendment request</h2>
                <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                        <label className="text-xs text-muted-k">For</label>
                        <select value={participantId} onChange={(e) => setParticipantId(e.target.value)} data-testid="amendment-participant" className="w-full mt-1 rounded-md border border-kindred px-3 py-2">
                            {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-muted-k">Your name</label>
                        <input value={senderName} onChange={(e) => setSenderName(e.target.value)} data-testid="amendment-sender-name" className="w-full mt-1 rounded-md border border-kindred px-3 py-2" />
                    </div>
                    <div>
                        <label className="text-xs text-muted-k">Your role</label>
                        <input value={senderRole} onChange={(e) => setSenderRole(e.target.value)} data-testid="amendment-sender-role" className="w-full mt-1 rounded-md border border-kindred px-3 py-2" />
                    </div>
                </div>

                <div className="space-y-3">
                    {items.map((it, idx) => (
                        <div key={idx} className="bg-surface-2 border border-kindred rounded-xl p-3 space-y-2" data-testid={`amendment-item-${idx}`}>
                            <div className="grid sm:grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[11px] text-muted-k">Service</label>
                                    <input value={it.service_name} onChange={(e) => setItem(idx, { service_name: e.target.value })} placeholder="e.g. Domestic cleaning" className="w-full rounded-md border border-kindred px-3 py-1.5 text-sm" data-testid={`amendment-service-${idx}`} />
                                </div>
                                <div>
                                    <label className="text-[11px] text-muted-k">Change type</label>
                                    <select value={it.change_type} onChange={(e) => setItem(idx, { change_type: e.target.value })} className="w-full rounded-md border border-kindred px-3 py-1.5 text-sm" data-testid={`amendment-change-${idx}`}>
                                        {Object.entries(CHANGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] text-muted-k">Why this change?</label>
                                    <VoiceInput onResult={(t) => setItem(idx, { reason: t })} testId={`amendment-dictate-${idx}`} label="Dictate" />
                                </div>
                                <textarea rows={2} value={it.reason} onChange={(e) => setItem(idx, { reason: e.target.value })} placeholder="e.g. After her fall in May, she cannot manage the heavy cleaning safely on her own." className="w-full rounded-md border border-kindred px-3 py-1.5 text-sm resize-none" data-testid={`amendment-reason-${idx}`} />
                            </div>
                            {items.length > 1 && (
                                <button type="button" onClick={() => removeItem(idx)} className="text-xs text-terracotta hover:underline" data-testid={`amendment-remove-${idx}`}>
                                    <Trash2 className="h-3 w-3 inline mr-1" /> Remove this change
                                </button>
                            )}
                        </div>
                    ))}
                    <button type="button" onClick={addItem} disabled={items.length >= 10} data-testid="amendment-add-item" className="text-xs text-primary-k hover:underline inline-flex items-center gap-1">
                        <Plus className="h-3 w-3" /> Add another change
                    </button>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-kindred">
                    <button onClick={generate} disabled={generating} data-testid="amendment-generate-btn" className="bg-primary-k text-white rounded-md px-5 py-2 text-sm hover:bg-[#16294a] disabled:opacity-60">
                        {generating ? "Generating…" : "Generate letter"}
                    </button>
                </div>
            </div>

            {/* Preview modal */}
            {preview && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="amendment-preview-modal">
                    <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
                        <div className="px-5 py-3 border-b border-kindred flex items-center justify-between sticky top-0 bg-white">
                            <h2 className="font-heading text-lg text-primary-k">Your amendment letter</h2>
                            <button onClick={() => setPreview(null)} className="text-muted-k hover:text-primary-k"><X className="h-4 w-4" /></button>
                        </div>
                        <pre className="p-5 text-sm whitespace-pre-wrap font-mono text-primary-k bg-surface-2" data-testid="amendment-preview-body">{preview.generated_letter}</pre>
                        <div className="px-5 py-3 border-t border-kindred flex gap-2 flex-wrap">
                            <button onClick={() => copyLetter(preview.generated_letter)} className="inline-flex items-center gap-1.5 bg-surface-2 border border-kindred text-primary-k rounded-md px-3 py-2 text-sm" data-testid="amendment-copy-btn">
                                <Copy className="h-3.5 w-3.5" /> Copy
                            </button>
                            <button onClick={() => mailLetter(preview.generated_letter, preview.provider_name)} className="inline-flex items-center gap-1.5 bg-surface-2 border border-kindred text-primary-k rounded-md px-3 py-2 text-sm" data-testid="amendment-mail-btn">
                                <Mail className="h-3.5 w-3.5" /> Open email
                            </button>
                            <button onClick={() => setStatus(preview.id, "sent")} className="inline-flex items-center gap-1.5 bg-primary-k text-white rounded-md px-3 py-2 text-sm hover:bg-[#16294a]" data-testid="amendment-mark-sent">
                                <Send className="h-3.5 w-3.5" /> Mark as sent
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* History */}
            <section data-testid="amendment-history">
                <h2 className="font-heading text-lg text-primary-k mb-3">Past requests</h2>
                {loading && <div className="text-sm text-muted-k">Loading…</div>}
                {!loading && history.length === 0 && (
                    <div className="bg-surface-2 border border-dashed border-kindred rounded-2xl p-6 text-sm text-muted-k text-center">No amendments yet.</div>
                )}
                <div className="space-y-2">
                    {history.map((h) => (
                        <button key={h.id} type="button" onClick={() => setPreview(h)} className="w-full text-left bg-surface border border-kindred rounded-xl p-4 hover:bg-surface-2 transition-colors flex items-center justify-between gap-3" data-testid={`amendment-row-${h.id}`}>
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-primary-k truncate">{(h.items || []).map((it) => it.service_name).join(", ") || "Amendment"}</div>
                                <div className="text-[11px] text-muted-k">{new Date(h.created_at).toLocaleString()} · to {h.provider_name || "provider"}</div>
                            </div>
                            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${h.status === "sent" ? "bg-primary-k/10 text-primary-k" : h.status === "accepted" ? "bg-sage/15 text-sage" : "bg-surface-2 text-muted-k"}`}>{h.status}</span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}
