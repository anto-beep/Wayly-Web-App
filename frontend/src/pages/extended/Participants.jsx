/**
 * Participants management page — list, add, edit, archive, promote.
 */
import React, { useEffect, useState } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Users, Plus, Star, Trash2, Edit3, Crown, X } from "lucide-react";
import { useParticipants } from "@/context/ParticipantsContext";

const EMPTY_FORM = {
    name: "",
    classification: 4,
    provider_name: "",
    is_grandfathered: false,
    relationship: "parent",
    dob: "",
};

export default function ParticipantsPage() {
    const { items, refresh } = useParticipants();
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    useEffect(() => { refresh(); }, [refresh]);

    const openCreate = () => {
        setEditing(null);
        setForm(EMPTY_FORM);
        setShowForm(true);
    };

    const openEdit = (p) => {
        setEditing(p);
        setForm({
            name: p.name,
            classification: p.classification,
            provider_name: p.provider_name,
            is_grandfathered: !!p.is_grandfathered,
            relationship: p.relationship || "parent",
            dob: p.dob || "",
        });
        setShowForm(true);
    };

    const save = async () => {
        if (!form.name.trim() || !form.provider_name.trim()) {
            toast.error("Name and provider are required.");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                classification: Number(form.classification) || 4,
                provider_name: form.provider_name.trim(),
                is_grandfathered: form.is_grandfathered,
                relationship: form.relationship || "parent",
                dob: form.dob || null,
            };
            if (editing) {
                await api.patch(`/participants/${editing.id}`, payload);
                toast.success("Participant updated");
            } else {
                await api.post("/participants", payload);
                toast.success("Participant added");
            }
            setShowForm(false);
            setEditing(null);
            await refresh();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not save"));
        } finally {
            setSaving(false);
        }
    };

    const archive = async (p) => {
        if (!window.confirm(`Archive ${p.name}? Their history stays but they'll be hidden from the switcher.`)) return;
        try {
            await api.delete(`/participants/${p.id}`);
            toast.success("Archived");
            await refresh();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not archive"));
        }
    };

    const promote = async (p) => {
        try {
            await api.post(`/participants/${p.id}/promote`);
            toast.success(`${p.name} is now the primary participant`);
            await refresh();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not promote"));
        }
    };

    return (
        <div className="space-y-6" data-testid="participants-page">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="font-heading text-3xl text-primary-k tracking-tight">Participants</h1>
                    <p className="text-sm text-muted-k mt-1">Up to 4 people per household — useful if you care for both parents.</p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    disabled={items.length >= 4}
                    data-testid="participants-add-btn"
                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-4 py-2.5 text-sm hover:bg-[#16294a] disabled:opacity-50"
                >
                    <Plus className="h-4 w-4" /> Add participant {items.length >= 4 && "(max 4)"}
                </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
                {items.map((p) => (
                    <div key={p.id} className="bg-surface border border-kindred rounded-2xl p-5 space-y-3" data-testid={`participant-card-${p.id}`}>
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="font-heading text-xl text-primary-k truncate flex items-center gap-1.5">
                                    {p.name}
                                    {p.is_primary && (
                                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-gold/15 text-gold px-1.5 py-0.5 rounded">
                                            <Star className="h-2.5 w-2.5 fill-gold" /> primary
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-muted-k mt-1">
                                    Classification {p.classification} · {p.provider_name}
                                </div>
                                {p.is_grandfathered && (
                                    <div className="text-[10px] uppercase tracking-wider text-sage mt-1">Grandfathered</div>
                                )}
                            </div>
                            <div className="flex items-center gap-1.5">
                                {!p.is_primary && (
                                    <button onClick={() => promote(p)} title="Set as primary" className="text-muted-k hover:text-gold p-1.5 rounded hover:bg-surface-2" data-testid={`participant-promote-${p.id}`}>
                                        <Crown className="h-4 w-4" />
                                    </button>
                                )}
                                <button onClick={() => openEdit(p)} title="Edit" className="text-muted-k hover:text-primary-k p-1.5 rounded hover:bg-surface-2" data-testid={`participant-edit-${p.id}`}>
                                    <Edit3 className="h-4 w-4" />
                                </button>
                                {!p.is_primary && (
                                    <button onClick={() => archive(p)} title="Archive" className="text-muted-k hover:text-terracotta p-1.5 rounded hover:bg-surface-2" data-testid={`participant-archive-${p.id}`}>
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {items.length === 0 && (
                    <div className="col-span-full bg-surface-2 border border-dashed border-kindred rounded-2xl p-6 text-center text-sm text-muted-k">
                        <Users className="h-6 w-6 mx-auto mb-2" />
                        Add your first participant to get started.
                    </div>
                )}
            </div>

            {showForm && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" data-testid="participant-form-modal">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-5 py-3 border-b border-kindred flex items-center justify-between">
                            <h2 className="font-heading text-lg text-primary-k">{editing ? "Edit participant" : "Add a participant"}</h2>
                            <button onClick={() => setShowForm(false)} className="p-1 text-muted-k hover:text-primary-k">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="text-xs text-muted-k">Their first name</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    data-testid="participant-form-name"
                                    className="w-full mt-1 rounded-md border border-kindred px-3 py-2"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-muted-k">Classification (1-8)</label>
                                    <select
                                        value={form.classification}
                                        onChange={(e) => setForm({ ...form, classification: e.target.value })}
                                        data-testid="participant-form-classification"
                                        className="w-full mt-1 rounded-md border border-kindred px-3 py-2"
                                    >
                                        {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={n}>Class {n}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-muted-k">Relationship</label>
                                    <select
                                        value={form.relationship}
                                        onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                                        data-testid="participant-form-relationship"
                                        className="w-full mt-1 rounded-md border border-kindred px-3 py-2"
                                    >
                                        <option value="parent">Parent</option>
                                        <option value="grandparent">Grandparent</option>
                                        <option value="partner">Partner</option>
                                        <option value="spouse">Spouse</option>
                                        <option value="aunt_uncle">Aunt / Uncle</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-muted-k">Provider</label>
                                <input
                                    type="text"
                                    value={form.provider_name}
                                    onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
                                    data-testid="participant-form-provider"
                                    className="w-full mt-1 rounded-md border border-kindred px-3 py-2"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={form.is_grandfathered}
                                    onChange={(e) => setForm({ ...form, is_grandfathered: e.target.checked })}
                                    data-testid="participant-form-grandfathered"
                                />
                                Grandfathered to old lifetime cap ($84,571)
                            </label>
                        </div>
                        <div className="px-5 py-3 border-t border-kindred flex justify-end gap-2">
                            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-k hover:text-primary-k">Cancel</button>
                            <button
                                onClick={save}
                                disabled={saving}
                                data-testid="participant-form-save"
                                className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#16294a] disabled:opacity-60"
                            >
                                {saving ? "Saving…" : editing ? "Save changes" : "Add participant"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
