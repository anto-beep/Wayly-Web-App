/**
 * LCA-1 v1 · Admin editorial surface (staff only).
 *
 * Route: /admin/lca1
 *
 * Lists all legislative_changes, lets staff draft, edit, preview-impact,
 * publish, and cancel. Non-staff users see a not-authorised message (backend
 * returns 404 on all /api/lca1/admin/* endpoints for them).
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { formatDate } from "@/lib/formatDate";
import { AlertOctagon, Plus, Eye, Send, X as XIcon, ChevronLeft } from "lucide-react";

const CATEGORIES = [
    "classification", "contribution", "budget_cap", "care_type_definition",
    "provider_pricing", "at_hm", "chsp", "restorative_care", "end_of_life",
    "program_manual_change", "quarterly_indexation", "other",
];

const BLANK = {
    slug: "",
    title: "",
    category: "care_type_definition",
    short_summary_tokens: { caregiver: "", participant_self: "" },
    detailed_explanation_tokens: { caregiver: "", participant_self: "" },
    effective_date: "",
    announced_date: "",
    source: { url: "", document_title: "" },
    affected_profile_signals: { all_users: true },
    recommended_actions: [],
    auto_case_creation: { creates_cases: false },
    affects_wayly_tools: [],
};

export default function LCA1Admin() {
    const [changes, setChanges] = useState(null);
    const [selected, setSelected] = useState(null);
    const [editing, setEditing] = useState(null);
    const [statusFilter, setStatusFilter] = useState("");
    const [notAuth, setNotAuth] = useState(false);
    const [impact, setImpact] = useState(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState("");

    async function load() {
        setChanges(null);
        try {
            const q = statusFilter ? `?status=${statusFilter}` : "";
            const r = await api.get(`/lca1/admin/changes${q}`);
            setChanges(r.data.changes || []);
        } catch (e) {
            if (e?.response?.status === 404) setNotAuth(true);
        }
    }

    useEffect(() => { load(); }, [statusFilter]);

    async function selectChange(cid) {
        try {
            const r = await api.get(`/lca1/admin/changes/${cid}`);
            setSelected(r.data);
            setEditing(null);
            setImpact(null);
        } catch { /* noop */ }
    }

    async function saveDraft() {
        setBusy(true); setMsg("");
        try {
            const isNew = !editing.id;
            const url = isNew ? "/lca1/admin/changes" : `/lca1/admin/changes/${editing.id}`;
            const method = isNew ? "post" : "patch";
            const r = await api[method](url, editing);
            setSelected(r.data);
            setEditing(null);
            setMsg(isNew ? "Draft created." : "Saved.");
            await load();
        } catch (e) {
            setMsg(e?.response?.data?.detail || e?.message || "Save failed");
        }
        setBusy(false);
    }

    async function runPreview() {
        if (!selected?.id) return;
        setBusy(true);
        try {
            const r = await api.post(`/lca1/admin/changes/${selected.id}/preview-impact`, {});
            setImpact(r.data);
        } finally { setBusy(false); }
    }

    async function publish() {
        if (!selected?.id) return;
        if (!window.confirm(`Publish "${selected.title}"? This delivers alerts to all matched users immediately.`)) return;
        setBusy(true); setMsg("");
        try {
            const r = await api.post(`/lca1/admin/changes/${selected.id}/publish`, { reviewer_acknowledgement: "reviewing_my_own_draft" });
            setSelected(r.data);
            setMsg(`Published, ${r.data.delivery_summary?.match_total || 0} alerts fired.`);
            await load();
        } catch (e) {
            setMsg(e?.response?.data?.detail || "Publish failed");
        }
        setBusy(false);
    }

    async function cancelChange() {
        if (!selected?.id) return;
        const reason = window.prompt("Cancellation reason:");
        if (!reason) return;
        setBusy(true);
        try {
            await api.post(`/lca1/admin/changes/${selected.id}/cancel`, { cancellation_reason: reason });
            setMsg("Cancelled; alerts revoked.");
            await selectChange(selected.id);
            await load();
        } catch (e) {
            setMsg(e?.response?.data?.detail || "Cancel failed");
        }
        setBusy(false);
    }

    if (notAuth) {
        return (
            <div className="max-w-2xl mx-auto p-8 text-center" data-testid="lca1-admin-not-authorised">
                <AlertOctagon className="w-8 h-8 text-primary-k/40 mx-auto mb-3" />
                <p className="text-sm text-primary-k/70">This page is for Wayly editorial staff only.</p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-6" data-testid="lca1-admin-page">
            <h1 className="text-2xl font-heading text-primary-k mb-4">Legislative Change Alerts, Editorial</h1>
            {msg && <div className="mb-3 text-sm text-primary-k bg-primary-k/[0.04] border border-primary-k/10 rounded-lg px-3 py-2" data-testid="lca1-admin-msg">{msg}</div>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* List */}
                <aside className="rounded-2xl border border-primary-k/10 bg-white p-3 md:col-span-1">
                    <div className="flex items-center justify-between mb-2">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="text-xs border border-primary-k/15 rounded-full px-2 py-1 bg-white"
                            data-testid="lca1-admin-status-filter"
                        >
                            <option value="">All</option>
                            <option value="draft">Drafts</option>
                            <option value="published">Published</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="superseded">Superseded</option>
                        </select>
                        <button
                            onClick={() => { setEditing({ ...BLANK }); setSelected(null); setImpact(null); }}
                            data-testid="lca1-admin-new-draft"
                            className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary-k text-white"
                        >
                            <Plus className="w-3 h-3" /> New draft
                        </button>
                    </div>
                    {changes === null ? <Skeleton className="h-32" /> : changes.length === 0 ? (
                        <p className="text-xs text-primary-k/50 p-3">No changes.</p>
                    ) : (
                        <ul className="divide-y divide-primary-k/5">
                            {changes.map((c) => (
                                <li key={c.id}>
                                    <button
                                        onClick={() => selectChange(c.id)}
                                        data-testid={`lca1-admin-change-${c.id}`}
                                        className={`w-full text-left p-2 hover:bg-primary-k/[0.03] rounded-md ${selected?.id === c.id ? "bg-primary-k/[0.05]" : ""}`}
                                    >
                                        <div className="text-sm font-medium text-primary-k line-clamp-1">{c.title}</div>
                                        <div className="text-[10px] uppercase tracking-wide text-primary-k/50 mt-0.5">{c.status} · v{c.version} · {c.category?.replace(/_/g, " ")}</div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </aside>

                {/* Detail / editor */}
                <section className="md:col-span-2 rounded-2xl border border-primary-k/10 bg-white p-4">
                    {editing ? (
                        <ChangeEditor
                            data={editing}
                            setData={setEditing}
                            onCancel={() => setEditing(null)}
                            onSave={saveDraft}
                            busy={busy}
                        />
                    ) : selected ? (
                        <ChangeDetail
                            data={selected}
                            impact={impact}
                            busy={busy}
                            onEdit={() => setEditing({ ...selected })}
                            onPreview={runPreview}
                            onPublish={publish}
                            onCancel={cancelChange}
                        />
                    ) : (
                        <p className="text-sm text-primary-k/50 text-center py-8">Select a change or start a new draft.</p>
                    )}
                </section>
            </div>
        </div>
    );
}

function ChangeEditor({ data, setData, onCancel, onSave, busy }) {
    const set = (k, v) => setData({ ...data, [k]: v });
    const setToken = (field, persona, v) =>
        setData({ ...data, [field]: { ...(data[field] || {}), [persona]: v } });
    return (
        <div data-testid="lca1-admin-editor" className="space-y-3">
            <div className="flex items-center gap-2">
                <button onClick={onCancel} className="text-primary-k/60 hover:text-primary-k text-sm inline-flex items-center gap-1" data-testid="lca1-admin-editor-cancel">
                    <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <h2 className="text-lg font-heading text-primary-k">{data.id ? "Edit change" : "New change"}</h2>
            </div>
            <Field label="Slug" required>
                <input data-testid="lca1-admin-editor-slug" value={data.slug} onChange={(e) => set("slug", e.target.value)} className="w-full input" />
            </Field>
            <Field label="Title" required>
                <input data-testid="lca1-admin-editor-title" value={data.title} onChange={(e) => set("title", e.target.value)} className="w-full input" />
            </Field>
            <Field label="Category" required>
                <select data-testid="lca1-admin-editor-category" value={data.category} onChange={(e) => set("category", e.target.value)} className="w-full input">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                </select>
            </Field>
            <Field label="Effective date" required>
                <input data-testid="lca1-admin-editor-effective-date" type="date" value={data.effective_date || ""} onChange={(e) => set("effective_date", e.target.value)} className="w-full input" />
            </Field>
            <Field label="Announced date">
                <input type="date" value={data.announced_date || ""} onChange={(e) => set("announced_date", e.target.value)} className="w-full input" />
            </Field>
            <Field label="Short summary (caregiver)" required>
                <textarea data-testid="lca1-admin-editor-short-caregiver" rows={2} value={data.short_summary_tokens?.caregiver || ""} onChange={(e) => setToken("short_summary_tokens", "caregiver", e.target.value)} className="w-full input" />
            </Field>
            <Field label="Short summary (participant_self)" required>
                <textarea data-testid="lca1-admin-editor-short-self" rows={2} value={data.short_summary_tokens?.participant_self || ""} onChange={(e) => setToken("short_summary_tokens", "participant_self", e.target.value)} className="w-full input" />
            </Field>
            <Field label="Detailed explanation (caregiver)" required>
                <textarea data-testid="lca1-admin-editor-detail-caregiver" rows={4} value={data.detailed_explanation_tokens?.caregiver || ""} onChange={(e) => setToken("detailed_explanation_tokens", "caregiver", e.target.value)} className="w-full input" />
            </Field>
            <Field label="Detailed explanation (participant_self)" required>
                <textarea data-testid="lca1-admin-editor-detail-self" rows={4} value={data.detailed_explanation_tokens?.participant_self || ""} onChange={(e) => setToken("detailed_explanation_tokens", "participant_self", e.target.value)} className="w-full input" />
            </Field>
            <Field label="All users (universal)">
                <input type="checkbox" data-testid="lca1-admin-editor-universal" checked={!!data.affected_profile_signals?.all_users}
                    onChange={(e) => set("affected_profile_signals", { ...(data.affected_profile_signals || {}), all_users: e.target.checked })} />
                <span className="text-xs text-primary-k/50 ml-2">Everyone will receive this alert. Uncheck to define profile signals in JSON below.</span>
            </Field>
            {!data.affected_profile_signals?.all_users && (
                <Field label="Profile signals (JSON)">
                    <textarea rows={4} value={JSON.stringify(data.affected_profile_signals, null, 2)}
                        onChange={(e) => { try { set("affected_profile_signals", JSON.parse(e.target.value)); } catch { /* keep raw */ } }}
                        className="w-full input font-mono text-xs" />
                </Field>
            )}
            <div className="flex justify-end gap-2 pt-2">
                <button onClick={onCancel} className="px-3 py-1.5 rounded-full border border-primary-k/20 text-sm text-primary-k" disabled={busy}>Cancel</button>
                <button onClick={onSave} disabled={busy} data-testid="lca1-admin-editor-save" className="px-4 py-1.5 rounded-full bg-primary-k text-white text-sm disabled:opacity-50">Save draft</button>
            </div>
            <style>{`.input { border: 1px solid rgba(26, 58, 46, 0.15); border-radius: 8px; padding: 6px 10px; font-size: 14px; }`}</style>
        </div>
    );
}

function Field({ label, required, children }) {
    return (
        <label className="block">
            <div className="text-xs uppercase tracking-wide text-primary-k/60 mb-1">{label}{required && " *"}</div>
            {children}
        </label>
    );
}

function ChangeDetail({ data, impact, busy, onEdit, onPreview, onPublish, onCancel }) {
    return (
        <div data-testid="lca1-admin-detail" className="space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[10px] uppercase tracking-wide text-primary-k/50">{data.category?.replace(/_/g, " ")} · v{data.version} · {data.status}</div>
                    <h2 className="text-lg font-heading text-primary-k">{data.title}</h2>
                    <div className="text-xs text-primary-k/50 mt-1">Effective {formatDate(data.effective_date)}</div>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0">
                    {data.status === "draft" && (
                        <>
                            <button onClick={onEdit} className="text-xs px-2 py-1 rounded-full border border-primary-k/20 text-primary-k">Edit</button>
                            <button onClick={onPreview} disabled={busy} data-testid="lca1-admin-preview-impact" className="text-xs px-2 py-1 rounded-full border border-primary-k/20 text-primary-k inline-flex items-center gap-1"><Eye className="w-3 h-3" /> Preview impact</button>
                            <button onClick={onPublish} disabled={busy} data-testid="lca1-admin-publish" className="text-xs px-2 py-1 rounded-full bg-primary-k text-white inline-flex items-center gap-1"><Send className="w-3 h-3" /> Publish</button>
                        </>
                    )}
                    {data.status === "published" && (
                        <>
                            <button onClick={onEdit} className="text-xs px-2 py-1 rounded-full border border-primary-k/20 text-primary-k">Edit (new version)</button>
                            <button onClick={onCancel} data-testid="lca1-admin-cancel" className="text-xs px-2 py-1 rounded-full border border-clay/40 text-clay inline-flex items-center gap-1"><XIcon className="w-3 h-3" /> Cancel</button>
                        </>
                    )}
                </div>
            </div>
            <div className="rounded-lg bg-primary-k/[0.04] p-3">
                <div className="text-xs uppercase tracking-wide text-primary-k/60 mb-1">Caregiver summary</div>
                <p className="text-sm text-primary-k">{data.short_summary_tokens?.caregiver}</p>
            </div>
            <div className="rounded-lg bg-primary-k/[0.04] p-3">
                <div className="text-xs uppercase tracking-wide text-primary-k/60 mb-1">Participant-self summary</div>
                <p className="text-sm text-primary-k">{data.short_summary_tokens?.participant_self}</p>
            </div>
            <details>
                <summary className="text-xs text-primary-k/60 cursor-pointer hover:underline">Detailed explanations</summary>
                <div className="mt-2 space-y-2">
                    <p className="text-sm text-primary-k/80"><strong>Caregiver:</strong> {data.detailed_explanation_tokens?.caregiver}</p>
                    <p className="text-sm text-primary-k/80"><strong>Participant-self:</strong> {data.detailed_explanation_tokens?.participant_self}</p>
                </div>
            </details>
            {impact && (
                <div className="rounded-lg bg-primary-k/[0.06] p-3" data-testid="lca1-admin-impact-result">
                    <div className="text-xs uppercase tracking-wide text-primary-k/60">Impact preview</div>
                    <div className="text-sm text-primary-k mt-1">Estimated matches: <strong>{impact.estimated_user_count}</strong></div>
                    <pre className="text-[10px] mt-1 text-primary-k/60">{JSON.stringify(impact.match_breakdown_by_reason, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
