import React, { useEffect, useState, useCallback, useMemo } from "react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Sparkles, X, Loader2, Check } from "lucide-react";

/**
 * <ProfileInlinePrompts where="budget_calculator" />
 *
 * Surfaces Tier 3 progressive-disclosure prompts for the user's primary
 * participant inside the relevant tool. Hides itself completely for
 * unauthenticated visitors. Saves edits via PATCH /api/participants/{pid}
 * and removes the prompt from the panel on success.
 *
 * `where` values supported by the backend:
 *   - "budget_calculator"      → applicable_supplements (+ enteral_feeding_type)
 *   - "contribution_estimator" → part_pension_actual_{independence,everyday}_pct
 *   - "reassessment_letter"    → mac_reference_number, care_manager_name, full_address
 *   - "profile"                → catch-all (rendered in the dashboard / settings)
 */
export default function ProfileInlinePrompts({ where }) {
    const { user } = useAuth();
    const [participant, setParticipant] = useState(null);
    const [prompts, setPrompts] = useState([]);
    const [dismissed, setDismissed] = useState({});

    const load = useCallback(async () => {
        try {
            const { data } = await api.get("/participants");
            const items = data?.items || [];
            // Prefer primary + ACTIVE; fall back to first
            const p = items.find((x) => x.is_primary && x.status === "ACTIVE")
                   || items.find((x) => x.is_primary)
                   || items[0];
            if (!p) return;
            setParticipant(p);
            const { data: pp } = await api.get(`/participants/${p.id}/profile-prompts`);
            setPrompts((pp?.prompts || []).filter((q) => q.where === where));
        } catch {
            /* unauthenticated or new user — surface nothing */
        }
    }, [where]);

    useEffect(() => {
        if (!user) return;
        load();
    }, [user, load]);

    const visible = (!user || !participant) ? [] : prompts.filter((q) => !dismissed[q.field]);
    if (visible.length === 0) return null;

    const onSaved = (field) => {
        setDismissed((d) => ({ ...d, [field]: true }));
        // Refresh the prompt list — saving one field may resolve others or
        // unlock new ones (e.g. supplements enable enteral_feeding_type).
        load();
    };

    return (
        <div
            data-testid={`profile-prompts-${where}`}
            className="rounded-xl border border-primary-k/30 bg-primary-k/5 px-4 py-3 space-y-3"
        >
            <div className="flex items-center gap-2 text-primary-k">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium">Sharpen this result</span>
            </div>
            {visible.map((q) => (
                <PromptRow
                    key={q.field}
                    participantId={participant.id}
                    prompt={q}
                    participant={participant}
                    onSaved={() => onSaved(q.field)}
                    onDismiss={() => setDismissed((d) => ({ ...d, [q.field]: true }))}
                />
            ))}
        </div>
    );
}


function PromptRow({ participantId, prompt, participant, onSaved, onDismiss }) {
    const [saving, setSaving] = useState(false);
    const renderer = useMemo(() => RENDERERS[prompt.field] || GenericText, [prompt.field]);

    const save = async (patch) => {
        setSaving(true);
        try {
            await api.patch(`/participants/${participantId}`, patch);
            toast.success("Saved to participant profile");
            onSaved();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not save"));
        } finally {
            setSaving(false);
        }
    };

    const FieldEditor = renderer;
    return (
        <div
            data-testid={`profile-prompt-${prompt.field}`}
            className="rounded-lg border border-kindred bg-surface p-3"
        >
            <div className="flex items-start gap-2">
                <p className="flex-1 text-xs text-primary-k leading-relaxed">{prompt.prompt}</p>
                <button
                    type="button"
                    onClick={onDismiss}
                    data-testid={`profile-prompt-${prompt.field}-dismiss`}
                    aria-label="Dismiss"
                    className="flex-none text-muted-k hover:text-primary-k"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="mt-2">
                <FieldEditor
                    save={save}
                    saving={saving}
                    participant={participant}
                    field={prompt.field}
                />
            </div>
        </div>
    );
}


/* ---------- field-specific editors ---------- */
function GenericText({ save, saving, field }) {
    const [v, setV] = useState("");
    return (
        <div className="flex items-center gap-2">
            <input
                value={v}
                onChange={(e) => setV(e.target.value)}
                data-testid={`profile-prompt-${field}-input`}
                className="flex-1 rounded-md border border-kindred px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
            />
            <SaveButton onClick={() => save({ [field]: v })} disabled={!v.trim() || saving} saving={saving} field={field} />
        </div>
    );
}

function NumberPct({ save, saving, field }) {
    const [v, setV] = useState("");
    return (
        <div className="flex items-center gap-2">
            <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={v}
                onChange={(e) => setV(e.target.value)}
                placeholder="e.g. 17.5"
                data-testid={`profile-prompt-${field}-input`}
                className="flex-1 rounded-md border border-kindred px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
            />
            <span className="text-sm text-muted-k">%</span>
            <SaveButton
                onClick={() => save({ [field]: parseFloat(v) })}
                disabled={v === "" || isNaN(parseFloat(v)) || saving}
                saving={saving}
                field={field}
            />
        </div>
    );
}

function TextArea({ save, saving, field }) {
    const [v, setV] = useState("");
    return (
        <div className="space-y-2">
            <textarea
                value={v}
                onChange={(e) => setV(e.target.value)}
                rows={2}
                data-testid={`profile-prompt-${field}-input`}
                className="w-full rounded-md border border-kindred px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
            />
            <SaveButton onClick={() => save({ [field]: v.trim() })} disabled={!v.trim() || saving} saving={saving} field={field} />
        </div>
    );
}

const SUPPLEMENT_OPTIONS = [
    { v: "oxygen", label: "Oxygen", desc: "$14.66/day" },
    { v: "enteral", label: "Enteral feeding", desc: "Bolus $23.25 · Non-bolus $26.11" },
    { v: "veterans", label: "Veterans (DVA card)", desc: "11.5% of base individual daily" },
    { v: "dementia_cognition", label: "Dementia & cognition", desc: "11.5% (grandfathered HCP only)" },
    { v: "eachd_top_up", label: "EACHD top-up", desc: "$3.45 (grandfathered HCP only)" },
];

function SupplementsEditor({ save, saving, participant }) {
    const [sel, setSel] = useState(participant?.applicable_supplements || []);
    const [enteralType, setEnteralType] = useState(participant?.enteral_feeding_type || "");
    const toggle = (v) => setSel((arr) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    const includesEnteral = sel.includes("enteral");

    return (
        <div className="space-y-2">
            <div className="grid sm:grid-cols-2 gap-2">
                {SUPPLEMENT_OPTIONS.map((o) => (
                    <label
                        key={o.v}
                        data-testid={`supplement-${o.v}`}
                        className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors ${
                            sel.includes(o.v) ? "border-primary-k bg-primary-k/5" : "border-kindred hover:bg-surface-2"
                        }`}
                    >
                        <input
                            type="checkbox"
                            checked={sel.includes(o.v)}
                            onChange={() => toggle(o.v)}
                            className="mt-0.5 h-3.5 w-3.5 accent-[var(--kindred-primary)]"
                        />
                        <span className="text-xs">
                            <span className="text-primary-k font-medium">{o.label}</span>
                            <span className="block text-muted-k">{o.desc}</span>
                        </span>
                    </label>
                ))}
            </div>
            {includesEnteral && (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-k">Enteral type:</span>
                    {["bolus", "non_bolus"].map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setEnteralType(t)}
                            data-testid={`enteral-type-${t}`}
                            className={`rounded-full px-3 py-1 text-xs border capitalize ${
                                enteralType === t ? "bg-primary-k text-white border-primary-k" : "border-kindred text-primary-k hover:bg-surface-2"
                            }`}
                        >
                            {t.replace("_", "-")}
                        </button>
                    ))}
                </div>
            )}
            <SaveButton
                onClick={() => {
                    const patch = { applicable_supplements: sel };
                    if (includesEnteral && enteralType) patch.enteral_feeding_type = enteralType;
                    save(patch);
                }}
                disabled={saving}
                saving={saving}
                field="applicable_supplements"
            />
        </div>
    );
}

function HCPEditor({ save, saving }) {
    const [v, setV] = useState("");
    const [level, setLevel] = useState(null);
    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                {["yes", "no", "unsure"].map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => setV(opt)}
                        data-testid={`hcp-${opt}`}
                        className={`rounded-full px-3 py-1 text-xs border capitalize ${
                            v === opt ? "bg-primary-k text-white border-primary-k" : "border-kindred text-primary-k hover:bg-surface-2"
                        }`}
                    >
                        {opt}
                    </button>
                ))}
            </div>
            {v === "yes" && (
                <select
                    value={level || ""}
                    onChange={(e) => setLevel(e.target.value ? parseInt(e.target.value, 10) : null)}
                    className="w-full rounded-md border border-kindred px-3 py-2 text-xs bg-surface"
                >
                    <option value="">HCP level…</option>
                    {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Level {n}</option>)}
                </select>
            )}
            <SaveButton
                onClick={() => {
                    const patch = { is_grandfathered_hcp: v };
                    if (v === "yes" && level) patch.hcp_level = level;
                    save(patch);
                }}
                disabled={!v || saving}
                saving={saving}
                field="is_grandfathered_hcp"
            />
        </div>
    );
}

function SaveButton({ onClick, disabled, saving, field }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            data-testid={`profile-prompt-${field}-save`}
            className="inline-flex items-center gap-1 bg-primary-k text-white rounded-md px-3 py-1.5 text-xs hover:bg-[#091D33] disabled:opacity-50"
        >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {saving ? "Saving…" : "Save to profile"}
        </button>
    );
}


const RENDERERS = {
    applicable_supplements: SupplementsEditor,
    part_pension_actual_independence_pct: NumberPct,
    part_pension_actual_everyday_pct: NumberPct,
    full_address: TextArea,
    is_grandfathered_hcp: HCPEditor,
    // care_manager_name, mac_reference_number → GenericText (default)
};
