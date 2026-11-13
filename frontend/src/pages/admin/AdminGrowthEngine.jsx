import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
    LineChart, Plus, X, Sparkles, Send, CalendarDays, Search, Plug, FileText,
} from "lucide-react";
import { adminApi } from "./AdminAuthContext";

const extractMsg = (e, f = "Error") => {
    const d = e?.response?.data?.detail;
    return typeof d === "string" ? d : f;
};
const CHANNELS = ["blog", "facebook", "instagram", "linkedin", "newsletter", "resource", "landing_page", "press_release", "media_pitch", "video_script"];
const CONTENT_STATUS_COLOR = {
    idea: "#6b6b6b", brief: "#6b6b6b", draft: "#8A4423", internal_review: "#A5512B",
    pending_approval: "#A5512B", approved: "#0E4D52", scheduled: "#1565B8",
    published: "#2f7d4a", failed: "#B42318", archived: "#9aa0a6",
};

function Field({ label, children }) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--admin-muted)", fontWeight: 600 }}>{label}</span>
            {children}
        </label>
    );
}

function ContentModal({ open, onClose, onSaved }) {
    const [f, setF] = useState({ title: "", channel: "blog", content_format: "", topic: "", brief: "", body: "", campaign_id: "" });
    const [busy, setBusy] = useState(false);
    useEffect(() => { if (open) setF({ title: "", channel: "blog", content_format: "", topic: "", brief: "", body: "", campaign_id: "" }); }, [open]);
    if (!open) return null;
    const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
    const submit = async () => {
        if (!f.title) { toast.error("Title is required."); return; }
        setBusy(true);
        try {
            const payload = { ...f }; Object.keys(payload).forEach((k) => payload[k] === "" && delete payload[k]);
            await adminApi.post("/admin/growth/content", payload);
            toast.success("Content created"); onSaved(); onClose();
        } catch (e) { toast.error(extractMsg(e, "Could not create content.")); }
        finally { setBusy(false); }
    };
    return (
        <div className="admin-cmdk-overlay" onClick={onClose} data-testid="content-modal">
            <div className="admin-card" onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>New content</h2>
                    <button className="admin-btn" onClick={onClose}><X size={16} /></button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Title *"><input className="admin-input" data-testid="content-title" value={f.title} onChange={set("title")} /></Field>
                    <Field label="Channel">
                        <select className="admin-input" data-testid="content-channel" value={f.channel} onChange={set("channel")}>
                            {CHANNELS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                        </select>
                    </Field>
                    <Field label="Format"><input className="admin-input" value={f.content_format} onChange={set("content_format")} placeholder="how-to, listicle…" /></Field>
                    <Field label="Topic (for AI grounding)"><input className="admin-input" value={f.topic} onChange={set("topic")} /></Field>
                </div>
                <Field label="Brief"><textarea className="admin-input" rows={2} value={f.brief} onChange={set("brief")} /></Field>
                <Field label="Body (optional draft)"><textarea className="admin-input" rows={4} value={f.body} onChange={set("body")} /></Field>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                    <button className="admin-btn" onClick={onClose}>Cancel</button>
                    <button className="admin-btn admin-btn-primary" data-testid="content-save" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Create"}</button>
                </div>
            </div>
        </div>
    );
}

function AiDraftModal({ item, onClose, onApplied }) {
    const [busy, setBusy] = useState(true);
    const [draft, setDraft] = useState(null);
    useEffect(() => {
        (async () => {
            try {
                const r = await adminApi.post(`/admin/growth/content/${item.id}/ai-draft`, {});
                setDraft(r.data);
            } catch (e) { toast.error(extractMsg(e, "AI draft failed.")); onClose(); }
            finally { setBusy(false); }
        })();
    }, [item, onClose]);
    const apply = async () => {
        try {
            await adminApi.patch(`/admin/growth/content/${item.id}`, {
                body: draft.body, seo_title: draft.seo_title, meta_description: draft.meta_description, status: "draft",
            });
            toast.success("Draft saved to content (review before publishing)"); onApplied(); onClose();
        } catch (e) { toast.error(extractMsg(e)); }
    };
    return (
        <div className="admin-cmdk-overlay" onClick={onClose} data-testid="content-ai-modal">
            <div className="admin-card" onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={16} /> AI content draft</h2>
                    <button className="admin-btn" onClick={onClose}><X size={16} /></button>
                </div>
                {busy ? <div style={{ color: "var(--admin-muted)", padding: 20 }}>Drafting with approved Help Centre knowledge…</div> : draft && (
                    <>
                        {!draft.has_sufficient_knowledge && <div style={{ background: "rgba(165,81,43,0.08)", border: "1px solid #A5512B", borderRadius: 6, padding: "8px 10px", marginBottom: 10, fontSize: 12 }} data-testid="content-ai-lowknowledge">Limited approved knowledge matched — keep claims general and verify before publishing.</div>}
                        <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>SEO title</div>
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>{draft.seo_title || "—"}</div>
                        <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>Draft body</div>
                        <pre style={{ padding: 10, background: "#F4F1EA", color: "#0E4D52", borderRadius: 6, whiteSpace: "pre-wrap", fontSize: 12 }} data-testid="content-ai-body">{draft.body}</pre>
                        {draft.review_notes && <p style={{ fontSize: 12 }}><strong>Review notes:</strong> {draft.review_notes}</p>}
                        <div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{draft.model} · grounded on {draft.grounded_on?.length || 0} approved article(s). Nothing is published automatically.</div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                            <button className="admin-btn" onClick={onClose}>Close</button>
                            <button className="admin-btn admin-btn-primary" data-testid="content-ai-apply" onClick={apply}>Save as draft</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default function AdminGrowthEngine() {
    const [tab, setTab] = useState("content");
    const [content, setContent] = useState(null);
    const [calendar, setCalendar] = useState(null);
    const [seo, setSeo] = useState(null);
    const [connectors, setConnectors] = useState(null);
    const [modal, setModal] = useState(false);
    const [aiItem, setAiItem] = useState(null);

    const load = useCallback(async () => {
        try {
            const [c, cal, s, cn] = await Promise.all([
                adminApi.get("/admin/growth/content"),
                adminApi.get("/admin/growth/content/calendar"),
                adminApi.get("/admin/growth/seo/opportunities"),
                adminApi.get("/admin/growth/connectors"),
            ]);
            setContent(c.data); setCalendar(cal.data); setSeo(s.data); setConnectors(cn.data);
        } catch (e) { toast.error(extractMsg(e, "Could not load growth engine.")); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const submitContent = async (id) => {
        try { await adminApi.post(`/admin/growth/content/${id}/submit`, {}); toast.success("Submitted for approval"); load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    const scheduleContent = async (id) => {
        const d = window.prompt("Schedule date (YYYY-MM-DD):"); if (!d) return;
        try { await adminApi.post(`/admin/growth/content/${id}/schedule`, { scheduled_date: d }); toast.success("Scheduled"); load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    const markPublished = async (id) => {
        const url = window.prompt("Published URL (evidence):"); if (!url) return;
        try { await adminApi.post(`/admin/growth/content/${id}/mark-published`, { published_url: url }); toast.success("Marked published"); load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    const addSeo = async () => {
        const page = window.prompt("Page or topic:"); if (!page) return;
        const signal = window.prompt("Signal (e.g. low CTR, content gap):") || "content_gap";
        try { await adminApi.post("/admin/growth/seo/opportunities", { page_or_topic: page, signal }); toast.success("Opportunity added"); load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };

    const TABS = [["content", "Content", FileText], ["calendar", "Calendar", CalendarDays], ["seo", "SEO", Search], ["connectors", "Connectors", Plug]];

    return (
        <div data-testid="admin-growth-engine">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <LineChart size={22} /><h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Marketing & Brand Growth Engine</h1>
                </div>
                {tab === "content" && <button className="admin-btn admin-btn-primary" data-testid="ge-add-content" onClick={() => setModal(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> New content</button>}
                {tab === "seo" && <button className="admin-btn admin-btn-primary" data-testid="ge-add-seo" onClick={addSeo} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add opportunity</button>}
            </div>
            <p style={{ color: "var(--admin-muted)", marginTop: 0, fontSize: 13 }}>Content is never auto-published. AI drafts are grounded only in approved Help Centre knowledge. Marketing spend lives in the Marketing Register.</p>

            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }} data-testid="ge-tabs">
                {TABS.map(([k, l, Icon]) => (
                    <button key={k} data-testid={`ge-tab-${k}`} onClick={() => setTab(k)} className="admin-btn" style={{ fontSize: 13, padding: "6px 14px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6, background: tab === k ? "#0E4D52" : "transparent", color: tab === k ? "#fff" : "var(--admin-muted)", border: tab === k ? "none" : "1px solid var(--admin-border)" }}>
                        <Icon size={14} /> {l}
                    </button>
                ))}
            </div>

            {tab === "content" && (
                <div className="admin-card" style={{ overflowX: "auto" }}>
                    <table className="admin-table">
                        <thead><tr><th>Title</th><th>Channel</th><th>Status</th><th>Publish</th><th>Scheduled</th><th></th></tr></thead>
                        <tbody>
                            {!content ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                                : content.content.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 28, color: "var(--admin-muted)" }} data-testid="ge-content-empty">No content yet. Create your first idea or draft.</td></tr>
                                    : content.content.map((c) => (
                                        <tr key={c.id} data-testid={`content-row-${c.id}`}>
                                            <td style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</td>
                                            <td style={{ fontSize: 12 }}>{(c.channel || "").replace(/_/g, " ")}</td>
                                            <td><span style={{ fontSize: 11, fontWeight: 700, color: CONTENT_STATUS_COLOR[c.status] || "#0E4D52" }}>{(c.status || "").replace(/_/g, " ")}</span></td>
                                            <td style={{ fontSize: 11, color: "var(--admin-muted)" }}>{(c.publish_status || "").replace(/_/g, " ")}</td>
                                            <td style={{ fontSize: 11 }}>{c.scheduled_date || "—"}</td>
                                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                                <button className="admin-btn" data-testid={`content-ai-${c.id}`} onClick={() => setAiItem(c)} style={{ padding: "3px 8px", marginRight: 4 }}><Sparkles size={12} /></button>
                                                <button className="admin-btn" data-testid={`content-submit-${c.id}`} onClick={() => submitContent(c.id)} style={{ padding: "3px 8px", marginRight: 4 }}>Submit</button>
                                                <button className="admin-btn" onClick={() => scheduleContent(c.id)} style={{ padding: "3px 8px", marginRight: 4 }}>Schedule</button>
                                                <button className="admin-btn" onClick={() => markPublished(c.id)} style={{ padding: "3px 8px" }}>Published</button>
                                            </td>
                                        </tr>
                                    ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === "calendar" && (
                <div className="admin-card" style={{ padding: 16 }} data-testid="ge-calendar">
                    <p style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 0 }}>{calendar?.note}</p>
                    {!calendar?.items?.length ? <div style={{ color: "var(--admin-muted)", fontSize: 13 }}>Nothing scheduled yet.</div>
                        : calendar.items.map((c) => (
                            <div key={c.id} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--admin-border)", fontSize: 13 }}>
                                <span style={{ fontWeight: 700, minWidth: 100 }}>{c.scheduled_date}</span>
                                <span style={{ flex: 1 }}>{c.title}</span>
                                <span style={{ fontSize: 11, color: "var(--admin-muted)" }}>{(c.channel || "").replace(/_/g, " ")} · {(c.publish_status || "").replace(/_/g, " ")}</span>
                            </div>
                        ))}
                </div>
            )}

            {tab === "seo" && (
                <div className="admin-card" style={{ overflowX: "auto" }}>
                    <table className="admin-table">
                        <thead><tr><th>Page / topic</th><th>Signal</th><th>Source</th><th>Priority</th><th>Status</th></tr></thead>
                        <tbody>
                            {!seo ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                                : seo.opportunities.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--admin-muted)" }} data-testid="ge-seo-empty">No SEO opportunities recorded. Add evidence-based ones as you find them.</td></tr>
                                    : seo.opportunities.map((s) => (
                                        <tr key={s.id} data-testid={`seo-row-${s.id}`}>
                                            <td style={{ fontWeight: 600, fontSize: 13 }}>{s.page_or_topic}</td>
                                            <td style={{ fontSize: 12 }}>{s.signal}</td>
                                            <td style={{ fontSize: 11, color: "var(--admin-muted)" }}>{s.source}</td>
                                            <td style={{ fontSize: 12 }}>{s.priority}</td>
                                            <td style={{ fontSize: 12 }}>{s.status}</td>
                                        </tr>
                                    ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === "connectors" && (
                <div className="admin-card" style={{ padding: 16 }} data-testid="ge-connectors">
                    <p style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 0 }}>{connectors?.note}</p>
                    {connectors?.connectors?.map((c) => (
                        <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--admin-border)" }} data-testid={`connector-${c.key}`}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: c.status === "connected" ? "#2f7d4a" : "#9aa0a6" }} />
                            <span style={{ fontWeight: 600, fontSize: 13, minWidth: 180 }}>{c.name}</span>
                            <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>{(c.status || "").replace(/_/g, " ")} · {c.scope}</span>
                            <span style={{ fontSize: 11, color: "var(--admin-muted)", marginLeft: "auto" }}>{c.setup_note}</span>
                        </div>
                    ))}
                </div>
            )}

            <ContentModal open={modal} onClose={() => setModal(false)} onSaved={load} />
            {aiItem && <AiDraftModal item={aiItem} onClose={() => setAiItem(null)} onApplied={load} />}
        </div>
    );
}
