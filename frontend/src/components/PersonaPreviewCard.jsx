/**
 * Admin-only Persona Preview card (PERSONA-1 dev tool).
 *
 * Lets a super admin eyeball copy as either persona without editing their
 * own account. Persists via ``localStorage["wayly.persona_preview"]``.
 * Tools that call `/api/persona/resolve` forward the override in their
 * request body; the backend applies it only when the caller has an
 * ``admin_role`` set (defense in depth).
 */
import React, { useEffect, useState } from "react";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { readPersonaPreview, setPersonaPreview } from "@/lib/persona";

const PERSONAS = [
    { v: "", label: "Use my account default" },
    { v: "participant", label: "Preview as participant (first person)" },
    { v: "caregiver", label: "Preview as caregiver (third person)" },
];

const PRONOUN_CHOICES = [
    { v: "unknown", label: "Prefer not to say" },
    { v: "she_her", label: "She / her" },
    { v: "he_him", label: "He / him" },
    { v: "they_them", label: "They / them" },
];

export default function PersonaPreviewCard() {
    const [persona, setPersona] = useState("");
    const [pronouns, setPronouns] = useState("unknown");
    const [firstName, setFirstName] = useState("");
    const [active, setActive] = useState(false);

    // Hydrate from localStorage on mount.
    useEffect(() => {
        const p = readPersonaPreview();
        if (p) {
            setPersona(p.persona || "");
            setPronouns(p.pronouns || "unknown");
            setFirstName(p.first_name || "");
            setActive(true);
        }
    }, []);

    const apply = () => {
        if (!persona) {
            setPersonaPreview(null);
            setActive(false);
            return;
        }
        setPersonaPreview({
            persona,
            pronouns: persona === "caregiver" ? pronouns : "unknown",
            first_name: persona === "caregiver" ? firstName.trim() : "",
        });
        setActive(true);
    };

    const clear = () => {
        setPersona("");
        setPronouns("unknown");
        setFirstName("");
        setPersonaPreview(null);
        setActive(false);
    };

    return (
        <section
            className="mt-8 rounded-2xl border border-dashed border-primary-k/40 bg-surface-2 p-5 max-w-md"
            data-testid="persona-preview-card"
        >
            <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-primary-k/10 flex items-center justify-center flex-none">
                    {active ? <Eye className="h-4 w-4 text-primary-k" /> : <EyeOff className="h-4 w-4 text-muted-k" />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-heading text-lg text-primary-k">Persona preview</h3>
                        <span className="text-[10px] uppercase tracking-wider bg-primary-k/10 text-primary-k rounded-full px-2 py-0.5">Admin only</span>
                        {active && (
                            <span
                                className="text-[10px] uppercase tracking-wider bg-sage/20 text-sage rounded-full px-2 py-0.5"
                                data-testid="persona-preview-active-badge"
                            >
                                Active
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-muted-k mt-1 leading-relaxed">
                        Eyeball copy across personas without editing your own account. Stored locally in your browser; other users are never affected.
                    </p>
                </div>
            </div>

            <div className="mt-4 space-y-3">
                <label className="block">
                    <span className="text-xs text-muted-k uppercase tracking-wider">Preview as</span>
                    <select
                        value={persona}
                        onChange={(e) => setPersona(e.target.value)}
                        data-testid="persona-preview-persona"
                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                    >
                        {PERSONAS.map((p) => <option key={p.v || "default"} value={p.v}>{p.label}</option>)}
                    </select>
                </label>

                {persona === "caregiver" && (
                    <>
                        <label className="block">
                            <span className="text-xs text-muted-k uppercase tracking-wider">Care recipient first name</span>
                            <input
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="e.g. Louisa (leave blank for 'the care recipient')"
                                data-testid="persona-preview-first-name"
                                className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs text-muted-k uppercase tracking-wider">Pronouns</span>
                            <select
                                value={pronouns}
                                onChange={(e) => setPronouns(e.target.value)}
                                data-testid="persona-preview-pronouns"
                                className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                            >
                                {PRONOUN_CHOICES.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}
                            </select>
                        </label>
                    </>
                )}
            </div>

            <div className="mt-4 flex items-center gap-2">
                <button
                    type="button"
                    onClick={apply}
                    data-testid="persona-preview-apply"
                    className="bg-primary-k text-white rounded-md px-4 py-2 text-sm hover:bg-[#091D33]"
                >
                    Apply preview
                </button>
                {active && (
                    <button
                        type="button"
                        onClick={clear}
                        data-testid="persona-preview-clear"
                        className="inline-flex items-center gap-1 text-xs text-muted-k hover:text-primary-k px-2 py-2"
                    >
                        <RotateCcw className="h-3.5 w-3.5" /> Clear
                    </button>
                )}
            </div>
        </section>
    );
}
