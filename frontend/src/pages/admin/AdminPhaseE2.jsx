import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { adminApi } from "./AdminAuthContext";

const fmtDate = (iso) => { if (!iso) return "—"; try { return new Date(iso).toLocaleString("en-AU", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };
const extractMsg = (e, f = "Error") => { const d = e?.response?.data?.detail; if (typeof d === "string") return d; if (d?.message) return d.message; return f; };
const Badge = ({ children, tone = "info" }) => <span className={`admin-badge admin-badge-${tone}`}>{children}</span>;

// ============================================================================
// ARTICLES
// ============================================================================

export function AdminArticles() {
    const [data, setData] = useState(null);
    const [q, setQ] = useState("");
    const [showPublished, setShowPublished] = useState("");
    const [editing, setEditing] = useState(null);
    const [creating, setCreating] = useState(false);

    const load = useCallback(() => {
        const params = { page_size: 100 };
        if (q) params.q = q;
        if (showPublished !== "") params.published = showPublished === "1";
        adminApi.get("/admin/cms/articles", { params })
            .then((r) => setData(r.data))
            .catch((e) => toast.error(extractMsg(e)));
    }, [q, showPublished]);
    useEffect(() => { load(); }, [load]);

    return (
        <div data-testid="admin-cms-articles">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>Articles <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({data?.total ?? 0})</span></h1>
                <button onClick={() => setCreating(true)} className="admin-btn" data-testid="article-new-btn">+ New article</button>
            </div>
            {(creating || editing) && (
                <ArticleEditor key={editing?.slug || "new"} slug={editing?.slug}
                    onClose={() => { setCreating(false); setEditing(null); }}
                    onSaved={() => { setCreating(false); setEditing(null); load(); }} />
            )}
            <div className="admin-card" style={{ padding: 12, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title / slug / tag…" className="admin-input" style={{ width: 280 }} data-testid="article-search" />
                <select value={showPublished} onChange={(e) => setShowPublished(e.target.value)} className="admin-input" style={{ width: 180 }} data-testid="article-filter-published">
                    <option value="">All</option>
                    <option value="1">Published only</option>
                    <option value="0">Drafts only</option>
                </select>
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Title</th><th>Slug</th><th>Status</th><th>Tags</th><th>Updated</th><th></th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No articles yet. Click <strong>New article</strong> to add your first.</td></tr>
                            : data.rows.map((a) => (
                                <tr key={a.slug} data-testid={`article-row-${a.slug}`}>
                                    <td><strong>{a.title}</strong><div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{a.excerpt?.slice(0, 100)}…</div></td>
                                    <td><code style={{ fontSize: 11 }}>{a.slug}</code></td>
                                    <td><Badge tone={a.published ? "active" : "muted"}>{a.published ? "published" : "draft"}</Badge></td>
                                    <td style={{ fontSize: 11, color: "var(--admin-muted)" }}>{(a.tags || []).join(", ") || "—"}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(a.updated_at)}</td>
                                    <td style={{ textAlign: "right" }}>
                                        <button onClick={() => setEditing(a)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }} data-testid={`article-edit-${a.slug}`}>Edit</button>
                                        <button onClick={async () => {
                                            if (!window.confirm(`Delete "${a.title}"?`)) return;
                                            try { await adminApi.delete(`/admin/cms/articles/${a.slug}`); toast.success("Deleted"); load(); }
                                            catch (e) { toast.error(extractMsg(e)); }
                                        }} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }} data-testid={`article-delete-${a.slug}`}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ArticleEditor({ slug, onClose, onSaved }) {
    const isEdit = !!slug;
    const [form, setForm] = useState({ slug: "", title: "", excerpt: "", body_md: "", tags: "", published: false });
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!slug) return;
        adminApi.get(`/admin/cms/articles/${slug}`)
            .then((r) => setForm({
                slug: r.data.slug, title: r.data.title, excerpt: r.data.excerpt,
                body_md: r.data.body_md || "", tags: (r.data.tags || []).join(", "),
                published: !!r.data.published,
            }))
            .catch((e) => toast.error(extractMsg(e)));
    }, [slug]);
    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const payload = {
                slug: form.slug || undefined,
                title: form.title, excerpt: form.excerpt, body_md: form.body_md,
                tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
                published: form.published,
            };
            if (isEdit) await adminApi.put(`/admin/cms/articles/${slug}`, payload);
            else await adminApi.post("/admin/cms/articles", payload);
            toast.success(isEdit ? "Article updated" : "Article created");
            onSaved();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };
    return (
        <form onSubmit={save} className="admin-card" style={{ padding: 16, marginBottom: 16 }} data-testid="article-editor">
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{isEdit ? `Edit "${form.title || slug}"` : "New article"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Title</label>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} className="admin-input" data-testid="article-title" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Slug (auto if blank)</label>
                    <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} disabled={isEdit} className="admin-input" data-testid="article-slug" />
                </div>
            </div>
            <label style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 12, display: "block" }}>Excerpt (10-400 chars)</label>
            <input value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} required minLength={10} maxLength={400} className="admin-input" data-testid="article-excerpt" />
            <label style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 12, display: "block" }}>Body (Markdown)</label>
            <textarea value={form.body_md} onChange={(e) => setForm({ ...form, body_md: e.target.value })} required minLength={20} rows={14} className="admin-input admin-mono" style={{ fontSize: 12 }} data-testid="article-body" />
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Tags (comma-separated)</label>
                    <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="admin-input" data-testid="article-tags" />
                </div>
                <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} data-testid="article-published" /> Published
                </label>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button type="submit" disabled={busy} className="admin-btn" data-testid="article-save">{busy ? "Saving…" : isEdit ? "Update" : "Create"}</button>
                <button type="button" onClick={onClose} className="admin-btn admin-btn-secondary">Cancel</button>
            </div>
        </form>
    );
}

// ============================================================================
// GLOSSARY
// ============================================================================

export function AdminGlossary() {
    const [data, setData] = useState(null);
    const [q, setQ] = useState("");
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState(null);
    const [importing, setImporting] = useState(false);

    const load = useCallback(() => {
        const params = {};
        if (q) params.q = q;
        adminApi.get("/admin/cms/glossary", { params })
            .then((r) => setData(r.data))
            .catch((e) => toast.error(extractMsg(e)));
    }, [q]);
    useEffect(() => { load(); }, [load]);

    return (
        <div data-testid="admin-cms-glossary">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>Glossary <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({data?.total ?? 0})</span></h1>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setImporting(true)} className="admin-btn admin-btn-secondary" data-testid="glossary-import-btn">Bulk import</button>
                    <button onClick={() => setCreating(true)} className="admin-btn" data-testid="glossary-new-btn">+ New term</button>
                </div>
            </div>
            {(creating || editing) && (
                <GlossaryEditor entry={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { setCreating(false); setEditing(null); load(); }} />
            )}
            {importing && <GlossaryImporter onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); }} />}
            <div className="admin-card" style={{ padding: 12, marginBottom: 16 }}>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search term or definition…" className="admin-input" style={{ width: 320 }} data-testid="glossary-search" />
            </div>
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Term</th><th>Definition</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No glossary terms yet.</td></tr>
                            : data.rows.map((g) => (
                                <tr key={g.id} data-testid={`glossary-row-${g.id}`}>
                                    <td><strong>{g.term}</strong></td>
                                    <td style={{ fontSize: 12, maxWidth: 540, color: "var(--admin-muted)" }}>{g.definition}</td>
                                    <td><Badge tone={g.published ? "active" : "muted"}>{g.published ? "live" : "draft"}</Badge></td>
                                    <td style={{ textAlign: "right" }}>
                                        <button onClick={() => setEditing(g)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }} data-testid={`glossary-edit-${g.id}`}>Edit</button>
                                        <button onClick={async () => {
                                            if (!window.confirm(`Delete "${g.term}"?`)) return;
                                            try { await adminApi.delete(`/admin/cms/glossary/${g.id}`); toast.success("Deleted"); load(); }
                                            catch (e) { toast.error(extractMsg(e)); }
                                        }} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function GlossaryEditor({ entry, onClose, onSaved }) {
    const isEdit = !!entry;
    const [form, setForm] = useState({ term: entry?.term || "", definition: entry?.definition || "", published: entry?.published ?? true });
    const [busy, setBusy] = useState(false);
    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            if (isEdit) await adminApi.put(`/admin/cms/glossary/${entry.id}`, form);
            else await adminApi.post("/admin/cms/glossary", form);
            toast.success(isEdit ? "Term updated" : "Term added");
            onSaved();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };
    return (
        <form onSubmit={save} className="admin-card" style={{ padding: 16, marginBottom: 16 }} data-testid="glossary-editor">
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{isEdit ? `Edit "${entry.term}"` : "New glossary term"}</h2>
            <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Term</label>
            <input value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} required minLength={1} maxLength={120} className="admin-input" data-testid="glossary-term" />
            <label style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 12, display: "block" }}>Definition</label>
            <textarea value={form.definition} onChange={(e) => setForm({ ...form, definition: e.target.value })} required minLength={3} rows={4} className="admin-input" data-testid="glossary-definition" />
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", marginTop: 12 }}>
                <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} data-testid="glossary-published" /> Published
            </label>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button type="submit" disabled={busy} className="admin-btn" data-testid="glossary-save">{busy ? "Saving…" : isEdit ? "Update" : "Add"}</button>
                <button type="button" onClick={onClose} className="admin-btn admin-btn-secondary">Cancel</button>
            </div>
        </form>
    );
}

function GlossaryImporter({ onClose, onDone }) {
    const [raw, setRaw] = useState("");
    const [busy, setBusy] = useState(false);
    const submit = async (e) => {
        e.preventDefault();
        const items = raw.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
            const idx = line.indexOf(":");
            if (idx < 0) return null;
            return { term: line.slice(0, idx).trim(), definition: line.slice(idx + 1).trim(), published: true };
        }).filter((x) => x && x.term && x.definition.length >= 3);
        if (!items.length) { toast.error("Add at least one valid line"); return; }
        setBusy(true);
        try {
            const r = await adminApi.post("/admin/cms/glossary/bulk-import", { items });
            toast.success(`Imported ${r.data.added} (skipped ${r.data.skipped} duplicates)`);
            onDone();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };
    return (
        <form onSubmit={submit} className="admin-card" style={{ padding: 16, marginBottom: 16 }} data-testid="glossary-importer">
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Bulk import glossary</h2>
            <p style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 12 }}>One term per line, in the format <code>Term: definition</code>. Duplicates (case-insensitive) are skipped.</p>
            <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={14} placeholder="ACAT: Aged Care Assessment Team. Conducts the assessment.&#10;OPAN: Older Persons Advocacy Network. 1800 700 600." className="admin-input admin-mono" style={{ fontSize: 12 }} data-testid="glossary-import-text" />
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button type="submit" disabled={busy} className="admin-btn" data-testid="glossary-import-submit">{busy ? "Importing…" : "Import"}</button>
                <button type="button" onClick={onClose} className="admin-btn admin-btn-secondary">Cancel</button>
            </div>
        </form>
    );
}

// ============================================================================
// TEMPLATES LIBRARY
// ============================================================================

export function AdminTemplatesLibrary() {
    const [data, setData] = useState(null);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState(null);
    const load = useCallback(() => {
        adminApi.get("/admin/cms/templates").then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, []);
    useEffect(() => { load(); }, [load]);
    return (
        <div data-testid="admin-cms-templates">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>Templates Library <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({data?.total ?? 0})</span></h1>
                <button onClick={() => setCreating(true)} className="admin-btn" data-testid="template-new-btn">+ New template</button>
            </div>
            {(creating || editing) && (
                <TemplateEditor entry={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { setCreating(false); setEditing(null); load(); }} />
            )}
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Title</th><th>Slug</th><th>CTA</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No templates yet.</td></tr>
                            : data.rows.map((t) => (
                                <tr key={t.slug} data-testid={`template-row-${t.slug}`}>
                                    <td><strong>{t.title}</strong><div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{t.description?.slice(0, 120)}</div></td>
                                    <td><code style={{ fontSize: 11 }}>{t.slug}</code></td>
                                    <td style={{ fontSize: 11 }}>{t.cta_label} → <code>{t.cta_href}</code></td>
                                    <td><Badge tone={t.published ? "active" : "muted"}>{t.published ? "live" : "draft"}</Badge></td>
                                    <td style={{ textAlign: "right" }}>
                                        <button onClick={() => setEditing(t)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }} data-testid={`template-edit-${t.slug}`}>Edit</button>
                                        <button onClick={async () => {
                                            if (!window.confirm(`Delete "${t.title}"?`)) return;
                                            try { await adminApi.delete(`/admin/cms/templates/${t.slug}`); toast.success("Deleted"); load(); }
                                            catch (e) { toast.error(extractMsg(e)); }
                                        }} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function TemplateEditor({ entry, onClose, onSaved }) {
    const isEdit = !!entry;
    const [form, setForm] = useState({
        slug: entry?.slug || "", title: entry?.title || "", description: entry?.description || "",
        cta_label: entry?.cta_label || "Use this template", cta_href: entry?.cta_href || "",
        body_md: entry?.body_md || "", published: entry?.published ?? true,
    });
    const [busy, setBusy] = useState(false);
    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const payload = { ...form, slug: form.slug || undefined };
            if (isEdit) await adminApi.put(`/admin/cms/templates/${entry.slug}`, payload);
            else await adminApi.post("/admin/cms/templates", payload);
            toast.success(isEdit ? "Template updated" : "Template created");
            onSaved();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };
    return (
        <form onSubmit={save} className="admin-card" style={{ padding: 16, marginBottom: 16 }} data-testid="template-editor">
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{isEdit ? `Edit "${entry.title}"` : "New template"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Title</label>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="admin-input" data-testid="template-title" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Slug (auto if blank)</label>
                    <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} disabled={isEdit} className="admin-input" data-testid="template-slug" />
                </div>
            </div>
            <label style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 12, display: "block" }}>Short description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required minLength={10} className="admin-input" data-testid="template-desc" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginTop: 12 }}>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>CTA label</label>
                    <input value={form.cta_label} onChange={(e) => setForm({ ...form, cta_label: e.target.value })} required className="admin-input" data-testid="template-cta-label" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>CTA href</label>
                    <input value={form.cta_href} onChange={(e) => setForm({ ...form, cta_href: e.target.value })} required placeholder="/ai-tools/reassessment-letter" className="admin-input" data-testid="template-cta-href" />
                </div>
            </div>
            <label style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 12, display: "block" }}>Body (Markdown — optional)</label>
            <textarea value={form.body_md} onChange={(e) => setForm({ ...form, body_md: e.target.value })} rows={8} className="admin-input admin-mono" style={{ fontSize: 12 }} data-testid="template-body" />
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", marginTop: 12 }}>
                <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} data-testid="template-published" /> Published
            </label>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button type="submit" disabled={busy} className="admin-btn" data-testid="template-save">{busy ? "Saving…" : isEdit ? "Update" : "Create"}</button>
                <button type="button" onClick={onClose} className="admin-btn admin-btn-secondary">Cancel</button>
            </div>
        </form>
    );
}

// ============================================================================
// CHANGELOG
// ============================================================================

export function AdminChangelog() {
    const [data, setData] = useState(null);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState(null);
    const load = useCallback(() => {
        adminApi.get("/admin/cms/changelog").then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, []);
    useEffect(() => { load(); }, [load]);
    return (
        <div data-testid="admin-cms-changelog">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h1 style={{ fontSize: 28, fontWeight: 600 }}>Changelog <span style={{ fontSize: 14, color: "var(--admin-muted)", fontWeight: 400 }}>({data?.total ?? 0})</span></h1>
                <button onClick={() => setCreating(true)} className="admin-btn" data-testid="changelog-new-btn">+ New release</button>
            </div>
            {(creating || editing) && (
                <ChangelogEditor entry={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { setCreating(false); setEditing(null); load(); }} />
            )}
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Version</th><th>Title</th><th>Released</th><th>Tags</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.rows.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No changelog entries yet.</td></tr>
                            : data.rows.map((c) => (
                                <tr key={c.id} data-testid={`changelog-row-${c.id}`}>
                                    <td><strong>{c.version}</strong></td>
                                    <td style={{ maxWidth: 380 }}>{c.title}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{c.release_date}</td>
                                    <td style={{ fontSize: 11, color: "var(--admin-muted)" }}>{(c.tags || []).join(", ") || "—"}</td>
                                    <td><Badge tone={c.published ? "active" : "muted"}>{c.published ? "live" : "draft"}</Badge></td>
                                    <td style={{ textAlign: "right" }}>
                                        <button onClick={() => setEditing(c)} className="admin-btn admin-btn-secondary" style={{ fontSize: 11, padding: "4px 8px", marginRight: 4 }} data-testid={`changelog-edit-${c.id}`}>Edit</button>
                                        <button onClick={async () => {
                                            if (!window.confirm(`Delete release ${c.version}?`)) return;
                                            try { await adminApi.delete(`/admin/cms/changelog/${c.id}`); toast.success("Deleted"); load(); }
                                            catch (e) { toast.error(extractMsg(e)); }
                                        }} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ChangelogEditor({ entry, onClose, onSaved }) {
    const isEdit = !!entry;
    const [form, setForm] = useState({
        version: entry?.version || "", title: entry?.title || "",
        body_md: entry?.body_md || "", tags: (entry?.tags || []).join(", "),
        release_date: entry?.release_date || new Date().toISOString().slice(0, 10),
        published: entry?.published ?? true,
    });
    const [busy, setBusy] = useState(false);
    const save = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const payload = {
                ...form,
                tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
            };
            if (isEdit) await adminApi.put(`/admin/cms/changelog/${entry.id}`, payload);
            else await adminApi.post("/admin/cms/changelog", payload);
            toast.success(isEdit ? "Release updated" : "Release added");
            onSaved();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };
    return (
        <form onSubmit={save} className="admin-card" style={{ padding: 16, marginBottom: 16 }} data-testid="changelog-editor">
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{isEdit ? `Edit ${entry.version}` : "New release"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 12 }}>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Version</label>
                    <input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} required className="admin-input" placeholder="1.2.0" data-testid="changelog-version" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Title</label>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} className="admin-input" data-testid="changelog-title" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Release date</label>
                    <input type="date" value={form.release_date} onChange={(e) => setForm({ ...form, release_date: e.target.value })} className="admin-input" data-testid="changelog-date" />
                </div>
            </div>
            <label style={{ fontSize: 12, color: "var(--admin-muted)", marginTop: 12, display: "block" }}>Notes (Markdown)</label>
            <textarea value={form.body_md} onChange={(e) => setForm({ ...form, body_md: e.target.value })} required minLength={10} rows={10} className="admin-input admin-mono" style={{ fontSize: 12 }} data-testid="changelog-body" />
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Tags (e.g. feature, fix, improvement)</label>
                    <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="admin-input" data-testid="changelog-tags" />
                </div>
                <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} data-testid="changelog-published" /> Published
                </label>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button type="submit" disabled={busy} className="admin-btn" data-testid="changelog-save">{busy ? "Saving…" : isEdit ? "Update" : "Add"}</button>
                <button type="button" onClick={onClose} className="admin-btn admin-btn-secondary">Cancel</button>
            </div>
        </form>
    );
}

// ============================================================================
// ADMIN INVITE — UI helpers used by AdminAccounts
// ============================================================================

export function AdminInvitesPanel() {
    const [data, setData] = useState(null);
    const [inviting, setInviting] = useState(false);
    const load = useCallback(() => {
        adminApi.get("/admin/admins/invites").then((r) => setData(r.data)).catch((e) => toast.error(extractMsg(e)));
    }, []);
    useEffect(() => { load(); }, [load]);
    const revoke = async (id) => {
        if (!window.confirm("Revoke this pending invite?")) return;
        try { await adminApi.delete(`/admin/admins/invites/${id}`); toast.success("Invite revoked"); load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    const copyUrl = (url) => {
        navigator.clipboard.writeText(url).then(() => toast.success("Accept link copied"));
    };
    return (
        <div data-testid="admin-invites-panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32, marginBottom: 12 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600 }}>Admin invites <span style={{ fontSize: 12, color: "var(--admin-muted)", fontWeight: 400 }}>({data?.total ?? 0})</span></h2>
                <button onClick={() => setInviting(true)} className="admin-btn" data-testid="invite-new-btn">+ Invite admin</button>
            </div>
            {inviting && <InviteForm onClose={() => setInviting(false)} onSent={() => { setInviting(false); load(); }} onCopy={copyUrl} />}
            <div className="admin-card" style={{ overflowX: "auto" }}>
                <table className="admin-table">
                    <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Created</th><th>Expires</th><th></th></tr></thead>
                    <tbody>
                        {!data ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                            : data.invites.length === 0 ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>No invites yet.</td></tr>
                            : data.invites.map((inv) => (
                                <tr key={inv.id} data-testid={`invite-row-${inv.id}`}>
                                    <td>{inv.email}</td>
                                    <td>{inv.name}</td>
                                    <td><Badge tone="info">{inv.admin_role?.replace("_", " ")}</Badge></td>
                                    <td><Badge tone={inv.status === "accepted" ? "active" : inv.status === "pending" ? "trial" : "muted"}>{inv.status}</Badge></td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(inv.created_at)}</td>
                                    <td className="admin-mono" style={{ fontSize: 11 }}>{fmtDate(inv.expires_at)}</td>
                                    <td style={{ textAlign: "right" }}>
                                        {inv.status === "pending" && (
                                            <button onClick={() => revoke(inv.id)} className="admin-btn" style={{ fontSize: 11, padding: "4px 8px" }} data-testid={`invite-revoke-${inv.id}`}>Revoke</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function InviteForm({ onClose, onSent, onCopy }) {
    const [form, setForm] = useState({ email: "", name: "", admin_role: "support_admin", expires_hours: 72 });
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const send = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await adminApi.post("/admin/admins/invite", form);
            setResult(r.data);
            toast.success(r.data.mailed ? "Invite emailed" : "Invite created (email delivery unavailable — copy the link)");
            onSent();
        } catch (e) { toast.error(extractMsg(e)); }
        finally { setBusy(false); }
    };
    if (result) {
        return (
            <div className="admin-card" style={{ padding: 16, marginBottom: 16 }} data-testid="invite-result">
                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Invite ready</h2>
                <p style={{ fontSize: 13, color: "var(--admin-muted)", marginBottom: 12 }}>
                    {result.mailed ? "Email sent to the recipient." : "Email delivery failed — copy this link and send it to the recipient yourself."}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                    <input readOnly value={result.accept_url} className="admin-input admin-mono" style={{ fontSize: 11, flex: 1 }} data-testid="invite-result-url" />
                    <button onClick={() => onCopy(result.accept_url)} className="admin-btn admin-btn-secondary" data-testid="invite-result-copy">Copy</button>
                    <button onClick={onClose} className="admin-btn">Done</button>
                </div>
            </div>
        );
    }
    return (
        <form onSubmit={send} className="admin-card" style={{ padding: 16, marginBottom: 16 }} data-testid="invite-form">
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Invite a new admin</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Email</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="admin-input" data-testid="invite-email" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Name</label>
                    <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} className="admin-input" data-testid="invite-name" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Role</label>
                    <select value={form.admin_role} onChange={(e) => setForm({ ...form, admin_role: e.target.value })} className="admin-input" data-testid="invite-role">
                        <option value="super_admin">Super admin</option>
                        <option value="operations_admin">Operations admin</option>
                        <option value="support_admin">Support admin</option>
                        <option value="content_admin">Content admin</option>
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 12, color: "var(--admin-muted)" }}>Link valid for (hours)</label>
                    <input type="number" min={1} max={336} value={form.expires_hours} onChange={(e) => setForm({ ...form, expires_hours: parseInt(e.target.value || 72, 10) })} className="admin-input" data-testid="invite-expires" />
                </div>
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button type="submit" disabled={busy} className="admin-btn" data-testid="invite-send">{busy ? "Sending…" : "Send invite"}</button>
                <button type="button" onClick={onClose} className="admin-btn admin-btn-secondary">Cancel</button>
            </div>
        </form>
    );
}
