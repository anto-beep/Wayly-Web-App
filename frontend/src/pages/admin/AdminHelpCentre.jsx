import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    LifeBuoy, Plus, X, Pencil, Trash2, Send, CheckCircle2, Upload,
    EyeOff, Archive, RotateCcw, AlertTriangle, History, MessageSquare, Search, BarChart3,
} from "lucide-react";
import { adminApi } from "./AdminAuthContext";

const extractMsg = (e, f = "Error") => {
    const d = e?.response?.data?.detail;
    if (typeof d === "string") return d;
    return d?.message || f;
};
function fmtDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }); }
    catch { return String(iso); }
}

const STATUS_COLOR = {
    draft: "#6b6b6b", in_review: "#A5512B", approved: "#1565B8",
    published: "#2f7d4a", archived: "#9aa0a6",
};
const STATUS_LABEL = {
    draft: "Draft", in_review: "In review", approved: "Approved",
    published: "Published", archived: "Archived",
};

const EMPTY = {
    title: "", slug: "", category: "", summary: "", body_md: "",
    tags: "", meta_title: "", meta_description: "", tool_keys: "", related_slugs: "",
};

function Field({ label, children, hint }) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--admin-muted)", fontWeight: 600 }}>{label}</span>
            {children}
            {hint && <span style={{ color: "var(--admin-muted)", fontSize: 11 }}>{hint}</span>}
        </label>
    );
}

function ArticleModal({ open, onClose, onSaved, categories, editing }) {
    const [form, setForm] = useState(EMPTY);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) return;
        if (editing) {
            setForm({
                title: editing.title || "", slug: editing.slug || "", category: editing.category || "",
                summary: editing.summary || "", body_md: editing.body_md || "",
                tags: (editing.tags || []).join(", "), meta_title: editing.meta_title || "",
                meta_description: editing.meta_description || "",
                tool_keys: (editing.tool_keys || []).join(", "),
                related_slugs: (editing.related_slugs || []).join(", "),
            });
        } else setForm(EMPTY);
    }, [open, editing]);
    if (!open) return null;
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    const csv = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);

    const submit = async () => {
        if (!form.title || !form.summary || !form.body_md || !form.category) {
            toast.error("Title, category, summary and body are required."); return;
        }
        setBusy(true);
        const payload = {
            title: form.title, summary: form.summary, body_md: form.body_md, category: form.category,
            tags: csv(form.tags), tool_keys: csv(form.tool_keys), related_slugs: csv(form.related_slugs),
            meta_title: form.meta_title || undefined, meta_description: form.meta_description || undefined,
        };
        try {
            if (editing) {
                await adminApi.put(`/admin/help/articles/${editing.id}`, payload);
                toast.success("Article saved");
            } else {
                if (form.slug) payload.slug = form.slug;
                await adminApi.post("/admin/help/articles", payload);
                toast.success("Draft created");
            }
            onSaved(); onClose();
        } catch (e) { toast.error(extractMsg(e, "Could not save the article.")); }
        finally { setBusy(false); }
    };

    return (
        <div className="admin-cmdk-overlay" onClick={onClose} data-testid="help-article-modal">
            <div className="admin-card" onClick={(e) => e.stopPropagation()} style={{ width: 760, maxWidth: "95vw", maxHeight: "92vh", overflowY: "auto", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{editing ? `Edit: ${editing.title}` : "New help article (draft)"}</h2>
                    <button className="admin-btn" onClick={onClose} data-testid="help-article-modal-close"><X size={16} /></button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <Field label="Title *"><input className="admin-input" data-testid="help-f-title" value={form.title} onChange={set("title")} /></Field>
                    <Field label="Category *">
                        <select className="admin-input" data-testid="help-f-category" value={form.category} onChange={set("category")}>
                            <option value="">Select…</option>
                            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                        </select>
                    </Field>
                    {!editing && <Field label="Slug" hint="Auto-generated from the title if blank"><input className="admin-input" data-testid="help-f-slug" value={form.slug} onChange={set("slug")} placeholder="how-to-cancel" /></Field>}
                    <Field label="Tags (comma-separated)"><input className="admin-input" value={form.tags} onChange={set("tags")} placeholder="billing, trial" /></Field>
                </div>
                <div style={{ marginTop: 12 }}>
                    <Field label="Summary *" hint="One or two sentences shown on cards and in search"><textarea className="admin-input" rows={2} data-testid="help-f-summary" value={form.summary} onChange={set("summary")} /></Field>
                </div>
                <div style={{ marginTop: 12 }}>
                    <Field label="Body (Markdown) *"><textarea className="admin-input" rows={12} data-testid="help-f-body" value={form.body_md} onChange={set("body_md")} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }} /></Field>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                    <Field label="Meta title (SEO)"><input className="admin-input" value={form.meta_title} onChange={set("meta_title")} /></Field>
                    <Field label="Meta description (SEO)"><input className="admin-input" value={form.meta_description} onChange={set("meta_description")} /></Field>
                    <Field label="Tool keys" hint="Contextual help links on tools, e.g. statement-decoder"><input className="admin-input" value={form.tool_keys} onChange={set("tool_keys")} /></Field>
                    <Field label="Related slugs" hint="Comma-separated help article slugs"><input className="admin-input" value={form.related_slugs} onChange={set("related_slugs")} /></Field>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                    <button className="admin-btn" onClick={onClose}>Cancel</button>
                    <button className="admin-btn admin-btn-primary" data-testid="help-article-save" disabled={busy} onClick={submit}>{busy ? "Saving…" : editing ? "Save changes" : "Create draft"}</button>
                </div>
            </div>
        </div>
    );
}

function DetailModal({ articleId, onClose, onChanged }) {
    const [data, setData] = useState(null);
    useEffect(() => {
        if (!articleId) return;
        adminApi.get(`/admin/help/articles/${articleId}`).then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, [articleId]);
    if (!articleId) return null;
    const a = data?.article;
    return (
        <div className="admin-cmdk-overlay" onClick={onClose} data-testid="help-detail-modal">
            <div className="admin-card" onClick={(e) => e.stopPropagation()} style={{ width: 680, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 17 }}>{a?.title || "Loading…"}</h2>
                    <button className="admin-btn" onClick={onClose}><X size={16} /></button>
                </div>
                {!data ? <p style={{ color: "var(--admin-muted)" }}>Loading…</p> : (
                    <>
                        <div style={{ fontSize: 13, color: "var(--admin-muted)", marginBottom: 12 }}>
                            Status <strong style={{ color: STATUS_COLOR[a.status] }}>{STATUS_LABEL[a.status]}</strong> · v{a.version} · {a.category_label} · slug <code>{a.slug}</code>
                        </div>
                        <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
                            <div><div style={{ fontSize: 11, color: "var(--admin-muted)" }}>👍 Helpful</div><div style={{ fontSize: 20, fontWeight: 700 }}>{data.feedback.helpful}</div></div>
                            <div><div style={{ fontSize: 11, color: "var(--admin-muted)" }}>👎 Not helpful</div><div style={{ fontSize: 20, fontWeight: 700 }}>{data.feedback.not_helpful}</div></div>
                            <div><div style={{ fontSize: 11, color: "var(--admin-muted)" }}>Views</div><div style={{ fontSize: 20, fontWeight: 700 }}>{a.view_count || 0}</div></div>
                        </div>
                        <h3 style={{ fontSize: 14, margin: "8px 0", display: "flex", alignItems: "center", gap: 6 }}><MessageSquare size={14} /> Private feedback comments</h3>
                        {(data.feedback.comments || []).length === 0 ? (
                            <p style={{ fontSize: 13, color: "var(--admin-muted)" }}>No comments yet.</p>
                        ) : (data.feedback.comments || []).map((c) => (
                            <div key={c.id} style={{ border: "1px solid var(--admin-border)", borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 13 }}>
                                <span style={{ fontWeight: 700, color: c.helpful ? "#2f7d4a" : "#A5512B" }}>{c.helpful ? "Helpful" : "Not helpful"}</span>
                                <span style={{ color: "var(--admin-muted)", marginLeft: 8, fontSize: 11 }}>{fmtDate(c.ts)}</span>
                                <div style={{ marginTop: 4 }}>{c.comment}</div>
                            </div>
                        ))}
                        <h3 style={{ fontSize: 14, margin: "14px 0 8px", display: "flex", alignItems: "center", gap: 6 }}><History size={14} /> Version history</h3>
                        {(data.versions || []).map((v) => (
                            <div key={v.id} style={{ fontSize: 12, color: "var(--admin-muted)", padding: "4px 0", borderBottom: "1px solid var(--admin-border)" }}>
                                v{v.version} · {v.status} · {v.note} · {fmtDate(v.snapshot_at)} {v.snapshot_by_email ? `· ${v.snapshot_by_email}` : ""}
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}

function Reporting() {
    const [rep, setRep] = useState(null);
    const [kq, setKq] = useState("");
    const [kres, setKres] = useState(null);
    useEffect(() => { adminApi.get("/admin/help/reporting").then((r) => setRep(r.data)).catch((e) => toast.error(extractMsg(e))); }, []);
    const previewKnowledge = async () => {
        if (!kq.trim()) return;
        try { const r = await adminApi.get("/admin/help/knowledge-search", { params: { q: kq } }); setKres(r.data.results || []); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    if (!rep) return <p style={{ color: "var(--admin-muted)" }}>Loading…</p>;
    const m = rep.metrics;
    const cards = [
        ["Published", m.published_articles], ["Pending approval", m.pending_approval],
        ["Approved (unpublished)", m.approved_unpublished], ["Outdated", m.outdated_articles],
        ["Searches (30d)", m.searches_30d], ["Unanswered (30d)", m.unanswered_searches_30d],
        ["Helpful % (30d)", m.feedback_helpful_pct_30d != null ? `${m.feedback_helpful_pct_30d}%` : "—"],
        ["Not-helpful (30d)", m.feedback_not_helpful_30d],
    ];
    return (
        <div data-testid="help-reporting">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                {cards.map(([l, v]) => (
                    <div key={l} className="admin-card" style={{ padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{l}</div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>{v}</div>
                    </div>
                ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="admin-card" style={{ padding: 16 }}>
                    <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Knowledge gaps — top unanswered searches (30d)</h3>
                    {(m.knowledge_gaps || []).length === 0 ? <p style={{ fontSize: 13, color: "var(--admin-muted)" }}>No unanswered searches.</p> :
                        (m.knowledge_gaps || []).map((g, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--admin-border)" }}>
                                <span>{g.query}</span><span style={{ fontWeight: 700 }}>{g.count}</span>
                            </div>
                        ))}
                </div>
                <div className="admin-card" style={{ padding: 16 }}>
                    <h3 style={{ margin: "0 0 10px", fontSize: 14 }}>Popular articles</h3>
                    {(m.popular_articles || []).length === 0 ? <p style={{ fontSize: 13, color: "var(--admin-muted)" }}>No views yet.</p> :
                        (m.popular_articles || []).map((p) => (
                            <div key={p.slug} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--admin-border)" }}>
                                <span>{p.title}</span><span style={{ fontWeight: 700 }}>{p.views}</span>
                            </div>
                        ))}
                </div>
            </div>
            <div className="admin-card" style={{ padding: 16, marginTop: 14 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}><Search size={14} /> AI grounding preview</h3>
                <p style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 0 }}>Preview exactly which approved/published articles would ground an AI support draft. Drafts never appear here.</p>
                <div style={{ display: "flex", gap: 8 }}>
                    <input className="admin-input" data-testid="help-knowledge-q" value={kq} onChange={(e) => setKq(e.target.value)} placeholder="e.g. cancel my subscription" style={{ flex: 1 }} onKeyDown={(e) => e.key === "Enter" && previewKnowledge()} />
                    <button className="admin-btn admin-btn-primary" data-testid="help-knowledge-search" onClick={previewKnowledge}>Preview</button>
                </div>
                {kres && (
                    <div style={{ marginTop: 10 }} data-testid="help-knowledge-results">
                        {kres.length === 0 ? <p style={{ fontSize: 13, color: "var(--admin-muted)" }}>No approved articles match. (Approve/publish articles to make them groundable.)</p> :
                            kres.map((k) => (
                                <div key={k.slug} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--admin-border)" }}>
                                    <strong>{k.title}</strong> <span style={{ fontSize: 11, color: "var(--admin-muted)" }}>({k.status})</span>
                                    <div style={{ fontSize: 12, color: "var(--admin-muted)" }}>{k.summary}</div>
                                </div>
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function FeedbackInbox() {
    const [data, setData] = useState(null);
    const [filter, setFilter] = useState("comments");
    const load = useCallback(() => {
        const params = filter === "comments" ? { with_comment: true } : filter === "helpful" ? { helpful: true } : filter === "not" ? { helpful: false } : {};
        adminApi.get("/admin/help/feedback", { params: { ...params, page_size: 100 } }).then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, [filter]);
    useEffect(() => { load(); }, [load]);
    const rows = data?.rows || [];
    return (
        <div data-testid="help-feedback-inbox">
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[["comments", "With comments"], ["helpful", "Helpful"], ["not", "Not helpful"], ["all", "All"]].map(([k, l]) => (
                    <button key={k} className="admin-btn" data-testid={`help-fb-filter-${k}`} onClick={() => setFilter(k)}
                        style={{ fontSize: 12, padding: "5px 12px", borderRadius: 999, background: filter === k ? "var(--admin-fg,#0E4D52)" : "transparent", color: filter === k ? "#fff" : "var(--admin-muted)", border: filter === k ? "none" : "1px solid var(--admin-border)" }}>{l}</button>
                ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--admin-muted)" }}>Comments are private to admins. Readers are warned not to include personal information.</p>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Article</th><th>Rating</th><th>Comment</th><th>When</th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : rows.length === 0 ? <tr><td colSpan={4} style={{ padding: 20, textAlign: "center", color: "var(--admin-muted)" }} data-testid="help-fb-empty">No feedback yet.</td></tr>
                                : rows.map((f) => (
                                    <tr key={f.id} data-testid={`help-fb-row-${f.id}`}>
                                        <td style={{ fontSize: 12 }}>{f.article_slug}</td>
                                        <td><span style={{ fontWeight: 700, color: f.helpful ? "#2f7d4a" : "#A5512B" }}>{f.helpful ? "Helpful" : "Not helpful"}</span></td>
                                        <td style={{ fontSize: 13, maxWidth: 420 }}>{f.comment || <span style={{ color: "var(--admin-muted)" }}>—</span>}</td>
                                        <td className="admin-mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(f.ts)}</td>
                                    </tr>
                                ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function AdminHelpCentre() {
    const [tab, setTab] = useState("articles");
    const [categories, setCategories] = useState([]);
    const [data, setData] = useState(null);
    const [status, setStatus] = useState("");
    const [category, setCategory] = useState("");
    const [q, setQ] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [detailId, setDetailId] = useState(null);

    useEffect(() => { adminApi.get("/admin/help/categories").then((r) => setCategories(r.data.categories || [])).catch(() => {}); }, []);

    const load = useCallback(async () => {
        try {
            const r = await adminApi.get("/admin/help/articles", { params: { status: status || undefined, category: category || undefined, q: q || undefined, page_size: 200 } });
            setData(r.data);
        } catch (e) { toast.error(extractMsg(e, "Could not load articles.")); }
    }, [status, category, q]);
    useEffect(() => { if (tab === "articles") load(); }, [load, tab]);

    const act = async (id, path, label) => {
        try { await adminApi.post(`/admin/help/articles/${id}/${path}`, path === "review" ? {} : undefined); toast.success(label); load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    const markOutdated = async (id) => { try { await adminApi.post(`/admin/help/articles/${id}/review`, { is_outdated: true }); toast.success("Flagged as outdated"); load(); } catch (e) { toast.error(extractMsg(e)); } };
    const del = async (a) => {
        if (!window.confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
        try { await adminApi.delete(`/admin/help/articles/${a.id}`); toast.success("Deleted"); load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };

    const rows = data?.rows || [];
    const counts = data?.status_counts || {};
    const statusTabs = [["", "All"], ["draft", "Draft"], ["in_review", "In review"], ["approved", "Approved"], ["published", "Published"], ["archived", "Archived"]];

    const workflowButtons = (a) => {
        const btns = [];
        if (a.status === "draft") { btns.push(["submit", "Submit for review", Send]); btns.push(["approve", "Approve", CheckCircle2]); }
        else if (a.status === "in_review") { btns.push(["approve", "Approve", CheckCircle2]); btns.push(["reopen", "Reopen", RotateCcw]); }
        else if (a.status === "approved") { btns.push(["publish", "Publish", Upload]); }
        else if (a.status === "published") { btns.push(["unpublish", "Unpublish", EyeOff]); }
        else if (a.status === "archived") { btns.push(["reopen", "Reopen", RotateCcw]); }
        if (a.status !== "archived") btns.push(["archive", "Archive", Archive]);
        return btns;
    };

    return (
        <div data-testid="admin-help-centre">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <LifeBuoy size={22} />
                    <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Help Centre</h1>
                </div>
                {tab === "articles" && (
                    <button className="admin-btn admin-btn-primary" data-testid="help-add-article" onClick={() => { setEditing(null); setModalOpen(true); }} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> New article</button>
                )}
            </div>
            <p style={{ color: "var(--admin-muted)", marginTop: 0, fontSize: 13 }}>Product-support knowledge base at <code>/help</code>. Nothing is public until Published. Only approved/published articles ground AI support replies.</p>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }} data-testid="help-tabs">
                {[["articles", "Articles", LifeBuoy], ["feedback", "Feedback", MessageSquare], ["reporting", "Reporting", BarChart3]].map(([k, l, Icon]) => (
                    <button key={k} data-testid={`help-tab-${k}`} onClick={() => setTab(k)} className="admin-btn"
                        style={{ fontSize: 13, padding: "6px 14px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6, background: tab === k ? "var(--admin-fg,#0E4D52)" : "transparent", color: tab === k ? "#fff" : "var(--admin-muted)", border: tab === k ? "none" : "1px solid var(--admin-border)" }}>
                        <Icon size={14} /> {l}
                    </button>
                ))}
            </div>

            {tab === "articles" && (
                <>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }} data-testid="help-status-tabs">
                        {statusTabs.map(([k, l]) => (
                            <button key={k} data-testid={`help-status-${k || "all"}`} onClick={() => setStatus(k)} className="admin-btn"
                                style={{ fontSize: 12, padding: "5px 12px", borderRadius: 999, background: status === k ? "var(--admin-fg,#0E4D52)" : "transparent", color: status === k ? "#fff" : "var(--admin-muted)", border: status === k ? "none" : "1px solid var(--admin-border)" }}>
                                {l}{k && counts[k] != null ? ` (${counts[k]})` : ""}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                        <select className="admin-input" data-testid="help-filter-category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ fontSize: 13, padding: "6px 10px" }}>
                            <option value="">All categories</option>
                            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                        </select>
                        <input className="admin-input" data-testid="help-filter-search" placeholder="Search title, slug, tags…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontSize: 13, padding: "6px 10px", flex: 1, minWidth: 180 }} />
                    </div>

                    <div className="admin-card" style={{ overflowX: "auto" }}>
                        <table className="admin-table">
                            <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Ver</th><th>Feedback</th><th>Updated</th><th></th></tr></thead>
                            <tbody>
                                {!data ? <tr><td colSpan={7} style={{ padding: 24, textAlign: "center", color: "var(--admin-muted)" }}>Loading…</td></tr>
                                    : rows.length === 0 ? <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "var(--admin-muted)" }} data-testid="help-articles-empty">No articles. Click <strong>New article</strong> to create a draft.</td></tr>
                                        : rows.map((a) => (
                                            <tr key={a.id} data-testid={`help-row-${a.slug}`}>
                                                <td style={{ fontWeight: 600, fontSize: 13, maxWidth: 280 }}>
                                                    {a.title}
                                                    {a.is_outdated && <span title="Outdated" style={{ marginLeft: 6, color: "#B42318" }}><AlertTriangle size={12} style={{ verticalAlign: "middle" }} /></span>}
                                                    <div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{a.slug}</div>
                                                </td>
                                                <td style={{ fontSize: 12 }}>{a.category_label}</td>
                                                <td><span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[a.status] }}>{STATUS_LABEL[a.status]}</span></td>
                                                <td style={{ fontSize: 12 }}>v{a.version}</td>
                                                <td style={{ fontSize: 12 }}>👍 {a.helpful_count || 0} · 👎 {a.not_helpful_count || 0}</td>
                                                <td className="admin-mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{fmtDate(a.updated_at)}</td>
                                                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                                    <div style={{ display: "inline-flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                                        <button className="admin-btn" title="Details / versions / comments" data-testid={`help-detail-${a.slug}`} onClick={() => setDetailId(a.id)} style={{ padding: "4px 8px" }}><History size={12} /></button>
                                                        <button className="admin-btn" title="Edit" data-testid={`help-edit-${a.slug}`} onClick={() => { setEditing(a); setModalOpen(true); }} style={{ padding: "4px 8px" }}><Pencil size={12} /></button>
                                                        {workflowButtons(a).map(([path, label, Icon]) => (
                                                            <button key={path} className="admin-btn" title={label} data-testid={`help-${path}-${a.slug}`} onClick={() => act(a.id, path, label)} style={{ padding: "4px 8px" }}><Icon size={12} /></button>
                                                        ))}
                                                        {a.status === "published" && <button className="admin-btn" title="Mark reviewed" data-testid={`help-reviewed-${a.slug}`} onClick={() => act(a.id, "review", "Marked reviewed")} style={{ padding: "4px 8px" }}><CheckCircle2 size={12} /></button>}
                                                        {!a.is_outdated && <button className="admin-btn" title="Flag outdated" data-testid={`help-outdated-${a.slug}`} onClick={() => markOutdated(a.id)} style={{ padding: "4px 8px", color: "#A5512B" }}><AlertTriangle size={12} /></button>}
                                                        <button className="admin-btn" title="Delete" data-testid={`help-delete-${a.slug}`} onClick={() => del(a)} style={{ padding: "4px 8px", color: "#B42318" }}><Trash2 size={12} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                            </tbody>
                        </table>
                    </div>
                    {data && <div style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 8 }}>{data.total} article(s)</div>}
                </>
            )}

            {tab === "feedback" && <FeedbackInbox />}
            {tab === "reporting" && <Reporting />}

            <ArticleModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} categories={categories} editing={editing} />
            <DetailModal articleId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
        </div>
    );
}
