/**
 * CS-1 · Carer Handover Pack.
 *
 * Route: /app/carer/handover-pack
 *
 * A primary carer records routines, key info, emergency priorities, backup
 * contacts and who-helps-with-what, then downloads a print-ready PDF to hand
 * to a backup carer or respite provider.
 */
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import PageIntro from "@/components/PageIntro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Plus, Trash2, Save, FileText, ShieldAlert, Loader2 } from "lucide-react";
import { RequiredBadge } from "@/components/RequiredHint";

const BLANK = {
    id: null,
    emergency_priorities: "",
    my_routines: "",
    my_key_information: "",
    my_medical_needs: "",
    opt_in_medical: false,
    backup_contacts: [],
    who_can_help_with_what: [],
    shared_with_participant_handover_pack: false,
};

function Field({ label, hint, required = false, children }) {
    return (
        <label className="block space-y-1.5">
            <span className="text-sm font-medium text-primary-k inline-flex items-center gap-1.5">
                {label}
                {required && <RequiredBadge />}
            </span>
            {hint && <span className="block text-[11px] text-muted-k">{hint}</span>}
            {children}
        </label>
    );
}

// Minimal dropdown picker that lets the caregiver import an existing Key
// Contact into the current section. Native <select> keeps it accessible on
// mobile and screen readers. The first option acts as the label.
function KeyContactPicker({ contacts, label, testId, onPick }) {
    return (
        <select
            data-testid={testId}
            defaultValue=""
            onChange={(e) => {
                const kc = contacts.find((c) => c.id === e.target.value);
                if (kc) onPick(kc);
                e.target.value = "";
            }}
            className="text-xs rounded-full border border-primary-k/25 bg-white px-3 py-1.5 text-primary-k hover:bg-primary-k/[0.03]"
        >
            <option value="">{label}</option>
            {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                    {c.name}{c.role_or_title ? `, ${c.role_or_title}` : ""}
                </option>
            ))}
        </select>
    );
}

const taCls = "w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white min-h-[80px] leading-relaxed";

export default function HandoverPack() {
    const { activeId, active } = useParticipants();
    const pid = activeId || active?.id;

    const [packs, setPacks] = useState([]);
    const [form, setForm] = useState(BLANK);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [downloadingId, setDownloadingId] = useState(null);
    // Key Contacts loaded once for the active participant so caregivers can
    // pull an existing person into the Backup Contacts / Who Can Help sections
    // and, on save, mirror any newly-entered person back into Key Contacts.
    const [keyContacts, setKeyContacts] = useState([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/cs1/handover-packs");
            setPacks(data.packs || []);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, []);

    // Load key contacts for the currently-active participant, if any.
    useEffect(() => {
        if (!pid) return;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get(`/participants/${pid}/contacts`);
                if (!cancelled) setKeyContacts(data?.contacts || []);
            } catch {
                if (!cancelled) setKeyContacts([]);
            }
        })();
        return () => { cancelled = true; };
    }, [pid]);

    useEffect(() => { load(); }, [load]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const editPack = (p) => {
        setForm({
            id: p.id,
            emergency_priorities: p.emergency_priorities || "",
            my_routines: p.my_routines || "",
            my_key_information: p.my_key_information || "",
            my_medical_needs: p.my_medical_needs || "",
            opt_in_medical: !!p.my_medical_needs,
            backup_contacts: p.backup_contacts || [],
            who_can_help_with_what: p.who_can_help_with_what || [],
            shared_with_participant_handover_pack: !!p.shared_with_participant_handover_pack,
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const newPack = () => setForm(BLANK);

    const addContact = () => set("backup_contacts", [...form.backup_contacts, { name: "", relationship: "", phone: "", save_as_key_contact: true }]);
    const updateContact = (i, k, v) => set("backup_contacts", form.backup_contacts.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
    const removeContact = (i) => set("backup_contacts", form.backup_contacts.filter((_, idx) => idx !== i));

    const addHelper = () => set("who_can_help_with_what", [...form.who_can_help_with_what, { who: "", what: "", save_as_key_contact: true }]);
    const updateHelper = (i, k, v) => set("who_can_help_with_what", form.who_can_help_with_what.map((h, idx) => idx === i ? { ...h, [k]: v } : h));
    const removeHelper = (i) => set("who_can_help_with_what", form.who_can_help_with_what.filter((_, idx) => idx !== i));

    // Import an existing Key Contact into the specified section without any
    // manual re-typing. The Key Contact stays authoritative in its own list.
    const importKeyContactAsBackup = (kc) => {
        if (!kc) return;
        const alreadyThere = form.backup_contacts.some((c) => (c.name || "").trim() === (kc.name || "").trim());
        if (alreadyThere) { toast.info("That contact is already in the backup list."); return; }
        set("backup_contacts", [
            ...form.backup_contacts,
            {
                name: kc.name || "",
                relationship: kc.role_or_title || kc.kind || "",
                phone: kc.phone || "",
                save_as_key_contact: false,
                source_key_contact_id: kc.id,
            },
        ]);
    };
    const importKeyContactAsHelper = (kc) => {
        if (!kc) return;
        set("who_can_help_with_what", [
            ...form.who_can_help_with_what,
            {
                who: kc.name || "",
                what: kc.role_or_title || "",
                save_as_key_contact: false,
                source_key_contact_id: kc.id,
            },
        ]);
    };

    const save = async () => {
        setSaving(true);
        // Any new person the caregiver ticked "save as key contact" for
        // will be mirrored into the Key Contacts collection so they never
        // have to enter them twice. Existing key contacts (imported via the
        // picker) are skipped, and blank rows are ignored.
        const contactsToMirror = [];
        form.backup_contacts.forEach((c) => {
            if (c.save_as_key_contact && !c.source_key_contact_id && (c.name || "").trim()) {
                contactsToMirror.push({
                    name: c.name.trim(),
                    kind: "family",
                    role_or_title: (c.relationship || "").trim() || undefined,
                    phone: (c.phone || "").trim() || undefined,
                });
            }
        });
        form.who_can_help_with_what.forEach((h) => {
            if (h.save_as_key_contact && !h.source_key_contact_id && (h.who || "").trim()) {
                contactsToMirror.push({
                    name: h.who.trim(),
                    kind: "family",
                    role_or_title: (h.what || "").trim() || undefined,
                });
            }
        });
        if (pid && contactsToMirror.length > 0) {
            const existingNames = new Set(keyContacts.map((k) => (k.name || "").trim().toLowerCase()));
            const newlyCreated = [];
            for (const c of contactsToMirror) {
                if (existingNames.has(c.name.toLowerCase())) continue;
                try {
                    const { data } = await api.post(`/participants/${pid}/contacts`, c);
                    if (data?.contact) newlyCreated.push(data.contact);
                } catch { /* non-fatal: we still save the pack */ }
            }
            if (newlyCreated.length > 0) {
                setKeyContacts((prev) => [...prev, ...newlyCreated]);
                toast.success(`Also saved ${newlyCreated.length} new key contact${newlyCreated.length === 1 ? "" : "s"}.`);
            }
        }
        const payload = {
            participant_context_id: pid || null,
            emergency_priorities: form.emergency_priorities,
            my_routines: form.my_routines,
            my_key_information: form.my_key_information,
            my_medical_needs: form.my_medical_needs,
            opt_in_medical: form.opt_in_medical,
            backup_contacts: form.backup_contacts
                .filter((c) => c.name || c.phone)
                .map(({ save_as_key_contact, source_key_contact_id, ...rest }) => rest),
            who_can_help_with_what: form.who_can_help_with_what
                .filter((h) => h.who || h.what)
                .map(({ save_as_key_contact, source_key_contact_id, ...rest }) => rest),
            shared_with_participant_handover_pack: form.shared_with_participant_handover_pack,
        };
        try {
            let saved;
            if (form.id) {
                ({ data: saved } = await api.patch(`/cs1/handover-packs/${form.id}`, payload));
            } else {
                ({ data: saved } = await api.post("/cs1/handover-packs", payload));
            }
            toast.success("Handover pack saved");
            setForm((f) => ({ ...f, id: saved.pack.id }));
            load();
            return saved.pack.id;
        } catch {
            toast.error("Could not save the handover pack.");
            return null;
        } finally {
            setSaving(false);
        }
    };

    const download = async (packId) => {
        let id = packId;
        if (!id) {
            // Save the current form first so the PDF reflects the latest edits.
            id = await save();
            if (!id) return;
        }
        setDownloadingId(id);
        try {
            const res = await api.get(`/cs1/handover-packs/${id}/export.pdf`, { responseType: "blob" });
            const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `carer-handover-pack-${id.slice(0, 8)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            toast.error("Could not generate the PDF.");
        } finally {
            setDownloadingId(null);
            load();
        }
    };

    return (
        <div className="max-w-4xl space-y-6" data-testid="handover-pack-page">
            <PageIntro
                eyebrow="Carer support"
                title="Carer Handover Pack"
                description="Write down everything a backup carer or respite provider needs to keep care running smoothly, then download it as a one-page PDF."
                whatItDoes="Captures routines, key information, emergency priorities and contacts in one place, ready to hand over."
                howToUse={["Fill in the sections that matter most", "Add backup contacts and who helps with what", "Download the PDF and give it to your backup carer"]}
                whatYouGet={["A print-ready handover PDF", "A saved pack you can update any time"]}
            />

            <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-5" data-testid="handover-pack-form">
                <div className="flex items-center justify-between">
                    <h2 className="font-heading text-lg text-primary-k flex items-center gap-2">
                        <FileText className="w-4 h-4" /> {form.id ? "Editing pack" : "New handover pack"}
                    </h2>
                    {form.id && (
                        <button onClick={newPack} data-testid="handover-new-btn"
                            className="text-xs text-primary-k underline">Start a new pack</button>
                    )}
                </div>

                <Field label="If something goes wrong, do this first" required hint="The most important thing a backup carer should know.">
                    <textarea className={taCls} value={form.emergency_priorities} data-testid="handover-emergency"
                        onChange={(e) => set("emergency_priorities", e.target.value)}
                        placeholder="e.g. Call Dr Nguyen on 03 9000 0000. Medication list is on the fridge." />
                </Field>

                <Field label="Daily routines" hint="Meals, medication times, sleep, mobility, likes and dislikes.">
                    <textarea className={taCls} value={form.my_routines} data-testid="handover-routines"
                        onChange={(e) => set("my_routines", e.target.value)} />
                </Field>

                <Field label="Key information" hint="Anything else that helps, e.g. where things are kept, house access.">
                    <textarea className={taCls} value={form.my_key_information} data-testid="handover-key-info"
                        onChange={(e) => set("my_key_information", e.target.value)} />
                </Field>

                {/* Medical needs, opt-in */}
                <div className="rounded-xl border border-primary-k/10 p-3 bg-primary-k/[0.02]">
                    <label className="flex items-center gap-2 text-sm text-primary-k">
                        <input type="checkbox" checked={form.opt_in_medical} data-testid="handover-medical-optin"
                            onChange={(e) => set("opt_in_medical", e.target.checked)} className="accent-[#0E4D52]" />
                        <ShieldAlert className="w-4 h-4 text-clay" />
                        Include medical needs in this pack
                    </label>
                    {form.opt_in_medical && (
                        <textarea className={`${taCls} mt-3`} value={form.my_medical_needs} data-testid="handover-medical"
                            onChange={(e) => set("my_medical_needs", e.target.value)}
                            placeholder="Conditions, medications, allergies, dosage times." />
                    )}
                </div>

                {/* Backup contacts */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm font-medium text-primary-k">Backup contacts</span>
                        <div className="flex items-center gap-2">
                            {keyContacts.length > 0 && (
                                <KeyContactPicker
                                    contacts={keyContacts}
                                    label="Add from Key Contacts"
                                    testId="handover-backup-picker"
                                    onPick={importKeyContactAsBackup}
                                />
                            )}
                            <button onClick={addContact} data-testid="handover-add-contact"
                                className="text-xs inline-flex items-center gap-1 text-primary-k hover:underline">
                                <Plus className="w-3 h-3" /> Add new
                            </button>
                        </div>
                    </div>
                    {keyContacts.length === 0 && (
                        <p className="text-[11px] text-muted-k">
                            Tip, contacts you save here can be re-used across Wayly. Tick &ldquo;Also save as Key Contact&rdquo; to remember them.
                        </p>
                    )}
                    {form.backup_contacts.map((c, i) => (
                        <div key={i} className="space-y-1.5" data-testid={`handover-contact-${i}`}>
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
                                <Input value={c.name} placeholder="Name" onChange={(e) => updateContact(i, "name", e.target.value)} data-testid={`handover-contact-name-${i}`} />
                                <Input value={c.relationship} placeholder="Relationship" onChange={(e) => updateContact(i, "relationship", e.target.value)} data-testid={`handover-contact-rel-${i}`} />
                                <Input value={c.phone} placeholder="Phone" onChange={(e) => updateContact(i, "phone", e.target.value)} data-testid={`handover-contact-phone-${i}`} />
                                <button onClick={() => removeContact(i)} className="text-muted-k hover:text-red-600 justify-self-start sm:justify-self-center" aria-label="Remove contact">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            {!c.source_key_contact_id && (
                                <label className="flex items-center gap-2 text-[11px] text-muted-k pl-1">
                                    <input
                                        type="checkbox"
                                        checked={!!c.save_as_key_contact}
                                        onChange={(e) => updateContact(i, "save_as_key_contact", e.target.checked)}
                                        data-testid={`handover-contact-save-key-${i}`}
                                        className="accent-[#0E4D52]"
                                    />
                                    Also save as Key Contact for this participant
                                </label>
                            )}
                            {c.source_key_contact_id && (
                                <p className="text-[11px] text-muted-k pl-1">Linked to Key Contacts</p>
                            )}
                        </div>
                    ))}
                </div>

                {/* Who can help with what */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className="text-sm font-medium text-primary-k">Who can help with what</span>
                        <div className="flex items-center gap-2">
                            {keyContacts.length > 0 && (
                                <KeyContactPicker
                                    contacts={keyContacts}
                                    label="Add from Key Contacts"
                                    testId="handover-helper-picker"
                                    onPick={importKeyContactAsHelper}
                                />
                            )}
                            <button onClick={addHelper} data-testid="handover-add-helper"
                                className="text-xs inline-flex items-center gap-1 text-primary-k hover:underline">
                                <Plus className="w-3 h-3" /> Add new
                            </button>
                        </div>
                    </div>
                    {form.who_can_help_with_what.map((h, i) => (
                        <div key={i} className="space-y-1.5" data-testid={`handover-helper-${i}`}>
                            <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
                                <Input value={h.who} placeholder="Who" onChange={(e) => updateHelper(i, "who", e.target.value)} data-testid={`handover-helper-who-${i}`} />
                                <Input value={h.what} placeholder="What they help with" onChange={(e) => updateHelper(i, "what", e.target.value)} data-testid={`handover-helper-what-${i}`} />
                                <button onClick={() => removeHelper(i)} className="text-muted-k hover:text-red-600 justify-self-start sm:justify-self-center" aria-label="Remove helper">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                            {!h.source_key_contact_id && (
                                <label className="flex items-center gap-2 text-[11px] text-muted-k pl-1">
                                    <input
                                        type="checkbox"
                                        checked={!!h.save_as_key_contact}
                                        onChange={(e) => updateHelper(i, "save_as_key_contact", e.target.checked)}
                                        data-testid={`handover-helper-save-key-${i}`}
                                        className="accent-[#0E4D52]"
                                    />
                                    Also save as Key Contact for this participant
                                </label>
                            )}
                            {h.source_key_contact_id && (
                                <p className="text-[11px] text-muted-k pl-1">Linked to Key Contacts</p>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                    <Button onClick={save} disabled={saving} data-testid="handover-save-btn" variant="outline">
                        <Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button onClick={() => download(form.id)} disabled={saving || downloadingId} data-testid="handover-download-btn">
                        {downloadingId ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
                        Download PDF
                    </Button>
                </div>
            </div>

            {/* Existing packs */}
            {!loading && packs.length > 0 && (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-3" data-testid="handover-pack-list">
                    <h2 className="font-heading text-lg text-primary-k">Your saved packs</h2>
                    {packs.map((p) => (
                        <div key={p.id} className="flex items-center justify-between rounded-lg border border-primary-k/10 p-3" data-testid={`handover-saved-${p.id}`}>
                            <div className="min-w-0">
                                <p className="text-sm text-primary-k truncate">
                                    {p.emergency_priorities || p.my_routines || "Handover pack"}
                                </p>
                                <p className="text-[11px] text-muted-k">
                                    {(p.backup_contacts || []).length} contact(s)
                                    {p.last_generated_at ? " · PDF generated" : ""}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => editPack(p)} data-testid={`handover-edit-${p.id}`}
                                    className="text-xs text-primary-k underline">Edit</button>
                                <Button size="sm" variant="outline" onClick={() => download(p.id)}
                                    disabled={downloadingId === p.id} data-testid={`handover-download-${p.id}`}>
                                    {downloadingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
