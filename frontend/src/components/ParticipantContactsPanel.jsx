/**
 * Participant Contacts side panel, UI-1 §8.
 *
 * "Key Contacts", a focused rolodex for a participant: Emergency, GP,
 * specialists, care manager, providers, allied health, pharmacist, family,
 * friends, anyone in the care circle. Renders as a slide-in side panel.
 * All CRUD goes through `/participants/{id}/contacts`.
 */
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
    X, Plus, Phone, Mail, MapPin, Pencil, Trash2, Loader2, Search, ChevronDown, ChevronUp, Copy,
} from "lucide-react";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";

// UI-1 §8.2, display order:
// Emergency, GP, Specialists, Care Manager, Providers, Allied Health,
// Pharmacist, Family, Friends, Other.
const KIND_ORDER = [
    "emergency",
    "gp",
    "specialist",
    "care_manager",
    "provider_coordinator",
    "allied_health",
    "pharmacist",
    "family",
    "friend",
    "neighbour",
    "advocate",
    "other",
];

const KIND_LABEL = {
    emergency: "Emergency",
    gp: "GP",
    specialist: "Specialist",
    care_manager: "Care Manager",
    provider_coordinator: "Provider",
    allied_health: "Allied Health",
    pharmacist: "Pharmacist",
    family: "Family",
    friend: "Friend",
    neighbour: "Neighbour",
    advocate: "Advocate",
    other: "Other",
};

const KIND_PLURAL = {
    emergency: "Emergency",
    gp: "GP",
    specialist: "Specialists",
    care_manager: "Care Manager",
    provider_coordinator: "Providers",
    allied_health: "Allied Health",
    pharmacist: "Pharmacist",
    family: "Family",
    friend: "Friends",
    neighbour: "Neighbours",
    advocate: "Advocates",
    other: "Other",
};

const initialsOf = (name) => {
    if (!name) return "?";
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const matchesSearch = (c, q) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return [c.name, c.organisation, c.role_or_title, c.phone, c.email, c.notes, KIND_LABEL[c.kind]]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle));
};

export default function ParticipantContactsPanel({ participantId, participantName, open, onClose }) {
    const [contacts, setContacts] = useState(null);
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [query, setQuery] = useState("");
    const [expanded, setExpanded] = useState({});
    const isExpired = useExpiredTrial();

    useEffect(() => {
        if (!open || !participantId) return;
        api.get(`/participants/${participantId}/contacts`)
            .then((r) => setContacts(r.data?.contacts || []))
            .catch(() => toast.error("Could not load contacts."));
    }, [open, participantId]);

    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    const grouped = useMemo(() => {
        if (!contacts) return [];
        const map = {};
        for (const c of contacts) {
            if (!matchesSearch(c, query)) continue;
            const k = c.kind || "other";
            if (!map[k]) map[k] = [];
            map[k].push(c);
        }
        // Return groups in spec order, primary first
        return KIND_ORDER
            .filter((k) => map[k]?.length)
            .map((k) => ({
                kind: k,
                label: KIND_PLURAL[k] || KIND_LABEL[k] || k,
                contacts: [...map[k]].sort((a, b) => {
                    if (!!b.is_primary - !!a.is_primary) return !!b.is_primary - !!a.is_primary;
                    return String(a.name || "").localeCompare(String(b.name || ""));
                }),
            }));
    }, [contacts, query]);

    if (!open) return null;

    const firstName = (participantName || "").trim().split(/\s+/)[0] || "this participant";

    const startNew = () => setEditing({
        id: null, name: "", kind: "gp", role_or_title: "", organisation: "",
        phone: "", email: "", address: "", notes: "", is_primary: false,
    });
    const startEdit = (c) => setEditing({ ...c });

    const save = async (e) => {
        e?.preventDefault?.();
        if (!editing?.name?.trim()) { toast.error("Name is required."); return; }
        setSaving(true);
        try {
            const payload = {
                name: editing.name.trim(),
                kind: editing.kind,
                role_or_title: editing.role_or_title || null,
                organisation: editing.organisation || null,
                phone: editing.phone || null,
                email: editing.email || null,
                address: editing.address || null,
                notes: editing.notes || null,
                is_primary: !!editing.is_primary,
            };
            if (editing.id) {
                const r = await api.patch(`/participants/${participantId}/contacts/${editing.id}`, payload);
                setContacts((cs) => cs.map((c) => c.id === editing.id ? r.data.contact : c));
                toast.success("Contact updated.");
            } else {
                const r = await api.post(`/participants/${participantId}/contacts`, payload);
                setContacts((cs) => [...(cs || []), r.data.contact]);
                toast.success("Contact added.");
            }
            setEditing(null);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not save the contact.");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id) => {
        if (!window.confirm("Remove this contact?")) return;
        try {
            await api.delete(`/participants/${participantId}/contacts/${id}`);
            setContacts((cs) => cs.filter((c) => c.id !== id));
            toast.success("Contact removed.");
        } catch (err) { toast.error(err?.response?.data?.detail || "Could not remove the contact."); }
    };

    const copyToClipboard = async (text, label = "Copied") => {
        try { await navigator.clipboard.writeText(text); toast.success(label); }
        catch (_e) { toast.error("Could not copy"); }
    };

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`Key Contacts for ${participantName || "this participant"}`}
            className="fixed inset-0 z-[100] flex justify-end bg-black/55 backdrop-blur-sm"
            onClick={onClose}
            data-testid="contacts-panel"
        >
            <div
                className="flex h-full w-full max-w-md flex-col bg-surface shadow-2xl border-l border-kindred animate-slide-in-right sm:max-w-lg"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-kindred px-6 py-4 shrink-0">
                    <h2 className="text-lg font-semibold text-primary-k" style={{ fontFamily: "Fraunces, serif" }}>
                        {editing ? (editing.id ? "Edit Contact" : "Add Contact") : "Key Contacts"}
                    </h2>
                    <button type="button" onClick={onClose} aria-label="Close" data-testid="contacts-close" className="rounded-full p-2 text-primary-k hover:bg-surface-2">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {editing ? (
                    isExpired ? (
                        <div className="p-6">
                            <p className="text-sm text-muted-k">Editing is unavailable on an expired trial.</p>
                        </div>
                    ) : (
                    <ContactForm
                        editing={editing}
                        setEditing={setEditing}
                        saving={saving}
                        onCancel={() => setEditing(null)}
                        onSave={save}
                    />
                    )
                ) : (
                    <div className="flex flex-1 flex-col overflow-hidden">
                        <div className="px-6 pt-3 pb-2 border-b border-kindred space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-xs text-muted-k">
                                    People to call or coordinate with for <strong className="text-primary-k">{participantName || "this participant"}</strong>.
                                </p>
                                {!isExpired && (
                                <button type="button" onClick={startNew} data-testid="contacts-add" className="inline-flex items-center gap-1.5 rounded-full bg-primary-k px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                                    <Plus className="h-3.5 w-3.5" /> Add Contact
                                </button>
                                )}
                            </div>
                            {/* Search */}
                            <label className="relative block">
                                <span className="sr-only">Search contacts</span>
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-k" aria-hidden="true" />
                                <input
                                    type="search"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={`Search contacts for ${firstName}…`}
                                    data-testid="contacts-search"
                                    className="w-full rounded-full border border-kindred bg-surface-2 pl-9 pr-3 py-2 text-sm text-primary-k placeholder:text-muted-k focus:outline-none focus:border-primary-k focus:ring-2 focus:ring-primary-k/30"
                                />
                            </label>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5" data-testid="contacts-list">
                            {contacts === null ? (
                                <div className="flex items-center gap-2 text-sm text-muted-k">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                                </div>
                            ) : contacts.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-kindred bg-surface-2 p-6 text-center" data-testid="contacts-empty">
                                    <p className="text-sm text-primary-k">
                                        Add the people who care for <strong>{firstName}</strong>. Start with their GP, your care manager, and an emergency contact.
                                    </p>
                                    {!isExpired && (
                                    <button
                                        type="button"
                                        onClick={startNew}
                                        data-testid="contacts-add-first"
                                        className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary-k px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Add First Contact
                                    </button>
                                    )}
                                </div>
                            ) : grouped.length === 0 ? (
                                <div className="text-sm text-muted-k text-center py-6" data-testid="contacts-empty-search">
                                    No contacts match &ldquo;{query}&rdquo;.
                                </div>
                            ) : (
                                grouped.map((g) => (
                                    <section key={g.kind} data-testid={`contacts-group-${g.kind}`}>
                                        <h3 className="text-[11px] uppercase tracking-wider text-muted-k font-semibold mb-2">
                                            {g.label}
                                        </h3>
                                        <ul className="space-y-2">
                                            {g.contacts.map((c) => (
                                                <ContactCard
                                                    key={c.id}
                                                    contact={c}
                                                    expanded={!!expanded[c.id]}
                                                    onToggle={() => setExpanded((e) => ({ ...e, [c.id]: !e[c.id] }))}
                                                    onEdit={() => startEdit(c)}
                                                    onRemove={() => remove(c.id)}
                                                    onCopy={copyToClipboard}
                                                    readOnly={isExpired}
                                                />
                                            ))}
                                        </ul>
                                    </section>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}

function ContactCard({ contact: c, expanded, onToggle, onEdit, onRemove, onCopy, readOnly }) {
    return (
        <li className="rounded-xl border border-kindred bg-surface" data-testid={`contact-row-${c.id}`}>
            <button
                type="button"
                onClick={onToggle}
                className="w-full text-left p-3 flex items-start gap-3 hover:bg-surface-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-k"
                data-testid={`contact-toggle-${c.id}`}
            >
                <div className="h-9 w-9 rounded-full bg-primary-k/10 text-primary-k flex items-center justify-center font-semibold text-sm shrink-0" aria-hidden="true">
                    {initialsOf(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-primary-k truncate">{c.name}</h4>
                        {c.is_primary && (
                            <span className="inline-flex items-center rounded-full bg-sage/15 text-sage text-[10px] font-medium px-1.5 py-0.5" aria-label="Primary contact">
                                Primary
                            </span>
                        )}
                    </div>
                    {(c.role_or_title || c.organisation) && (
                        <div className="text-xs text-muted-k truncate">
                            {[c.role_or_title, c.organisation].filter(Boolean).join(" · ")}
                        </div>
                    )}
                </div>
                {expanded ? <ChevronUp className="h-4 w-4 text-muted-k mt-1" /> : <ChevronDown className="h-4 w-4 text-muted-k mt-1" />}
            </button>
            {expanded && (
                <div className="px-3 pb-3 -mt-1 space-y-2" data-testid={`contact-expanded-${c.id}`}>
                    <dl className="text-sm text-primary-k space-y-1.5 pl-12">
                        {c.phone && (
                            <div className="flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 text-sage shrink-0" aria-hidden="true" />
                                <a href={`tel:${c.phone}`} className="hover:underline" data-testid={`contact-phone-${c.id}`}>{c.phone}</a>
                            </div>
                        )}
                        {c.email && (
                            <div className="flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5 text-sage shrink-0" aria-hidden="true" />
                                <a href={`mailto:${c.email}`} className="hover:underline" data-testid={`contact-email-${c.id}`}>{c.email}</a>
                            </div>
                        )}
                        {c.address && (
                            <div className="flex items-start gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-sage shrink-0 mt-0.5" aria-hidden="true" />
                                <span className="flex-1">{c.address}</span>
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onCopy(c.address, "Address copied"); }}
                                    className="text-muted-k hover:text-primary-k"
                                    data-testid={`contact-copy-address-${c.id}`}
                                    aria-label="Copy address"
                                >
                                    <Copy className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        )}
                        {c.notes && (
                            <p className="text-xs text-muted-k whitespace-pre-wrap mt-1">{c.notes}</p>
                        )}
                    </dl>
                    <div className="pl-12 pt-2 flex items-center gap-2">
                        {!readOnly && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} className="inline-flex items-center gap-1 text-xs text-primary-k border border-kindred rounded-full px-2.5 py-1 hover:bg-surface-2" data-testid={`contact-edit-${c.id}`}>
                            <Pencil className="h-3 w-3" /> Edit
                        </button>
                        )}
                        {!readOnly && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove(); }} className="inline-flex items-center gap-1 text-xs text-terracotta border border-terracotta/40 rounded-full px-2.5 py-1 hover:bg-terracotta/10" data-testid={`contact-remove-${c.id}`}>
                            <Trash2 className="h-3 w-3" /> Remove
                        </button>
                        )}
                    </div>
                </div>
            )}
        </li>
    );
}

function ContactForm({ editing, setEditing, saving, onCancel, onSave }) {
    return (
        <form onSubmit={onSave} className="flex flex-1 flex-col overflow-hidden" data-testid="contacts-form">
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                <label className="block">
                    <span className="text-xs text-muted-k">Full Name</span>
                    <input required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} data-testid="contacts-form-name" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k" />
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Contact Type</span>
                    <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })} data-testid="contacts-form-kind" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k">
                        {KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                    </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-xs text-muted-k">Role or Title</span>
                        <input value={editing.role_or_title || ""} onChange={(e) => setEditing({ ...editing, role_or_title: e.target.value })} placeholder="e.g. Cardiologist, Daughter" data-testid="contacts-form-role" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k" />
                    </label>
                    <label className="block">
                        <span className="text-xs text-muted-k">Organisation</span>
                        <input value={editing.organisation || ""} onChange={(e) => setEditing({ ...editing, organisation: e.target.value })} className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k" />
                    </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className="text-xs text-muted-k">Phone</span>
                        <input value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} placeholder="04XX XXX XXX" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k" />
                    </label>
                    <label className="block">
                        <span className="text-xs text-muted-k">Email</span>
                        <input type="email" value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k" />
                    </label>
                </div>
                <label className="block">
                    <span className="text-xs text-muted-k">Address</span>
                    <input value={editing.address || ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k" />
                </label>
                <label className="block">
                    <span className="text-xs text-muted-k">Notes</span>
                    <textarea rows={3} value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm text-primary-k" />
                </label>
                <label className="flex items-center gap-2">
                    <input type="checkbox" checked={!!editing.is_primary} onChange={(e) => setEditing({ ...editing, is_primary: e.target.checked })} data-testid="contacts-form-primary" />
                    <span className="text-sm text-primary-k">Mark as primary for this contact type</span>
                </label>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-kindred bg-surface-2 px-6 py-3">
                <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-medium text-primary-k hover:bg-surface">Cancel</button>
                <button type="submit" disabled={saving} data-testid="contacts-form-save" className="inline-flex items-center gap-2 rounded-full bg-primary-k px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Contact
                </button>
            </div>
        </form>
    );
}
