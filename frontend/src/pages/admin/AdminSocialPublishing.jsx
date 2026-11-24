import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
    Send, RefreshCw, CheckCircle2, XCircle, Calendar, Layers, AlertTriangle, Link2,
    Palette, PlugZap, Copy, PlayCircle, Download, Search,
} from "lucide-react";
import { adminApi } from "./AdminAuthContext";

const SERVICE_COLORS = {
    facebook: { bg: "#e7f0fe", fg: "#1877f2" },
    instagram: { bg: "#fdeef4", fg: "#c13584" },
    linkedin: { bg: "#e6f0f7", fg: "#0a66c2" },
};
const svcBadge = (s) => SERVICE_COLORS[s] || { bg: "var(--admin-bg)", fg: "var(--admin-muted)" };
const MASTER_DESIGN = "DAHatuJTlfQ";

/* ------------------------------------------------------------------ Canva */
function CanvaPanel({ campaigns, onIngested }) {
    const [st, setSt] = useState(null);
    const [designs, setDesigns] = useState([]);
    const [q, setQ] = useState("");
    const [sel, setSel] = useState(null);
    const [type, setType] = useState("png");
    const [campaign, setCampaign] = useState("");
    const [platform, setPlatform] = useState("all");
    const [busy, setBusy] = useState(false);

    const loadStatus = useCallback(async () => {
        try { setSt((await adminApi.get("/mkt/canva/status")).data); } catch { /* noop */ }
    }, []);
    useEffect(() => { loadStatus(); }, [loadStatus]);

    const connect = async () => {
        try { const r = await adminApi.get("/mkt/canva/oauth/url"); window.location.href = r.data.url; }
        catch (e) { toast.error(e?.response?.data?.detail || "Could not start Canva connect"); }
    };
    const disconnect = async () => {
        if (!window.confirm("Disconnect Canva?")) return;
        await adminApi.post("/mkt/canva/disconnect"); toast.success("Canva disconnected"); loadStatus();
    };
    const browse = async () => {
        setBusy(true);
        try { setDesigns((await adminApi.get("/mkt/canva/designs", { params: { query: q || undefined } })).data.items || []); }
        catch (e) { toast.error(e?.response?.data?.detail || "Could not list designs"); }
        finally { setBusy(false); }
    };
    const pollExport = async (id) => {
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 2500));
            const r = await adminApi.get(`/mkt/canva/export/${id}`);
            if (r.data.status === "success") return r.data;
            if (r.data.status === "failed") throw new Error("Canva export failed");
        }
        throw new Error("Export timed out");
    };
    const runExport = async () => {
        if (!sel) return toast.error("Pick a design first");
        if (!campaign) return toast.error("Choose a campaign");
        setBusy(true);
        try {
            const r = await adminApi.post("/mkt/canva/export", {
                design_id: sel.id, type, campaign_id: campaign, target_platform: platform,
                content_topic: sel.title || "",
            });
            toast.message(`Export started (${type.toUpperCase()}) — importing…`);
            const done = await pollExport(r.data.export_id);
            toast.success(`Imported ${done.asset_ids?.length || 0} asset(s) as DRAFT — approve them in Marketing Assets`);
            onIngested?.();
        } catch (e) { toast.error(e?.response?.data?.detail || e.message || "Export failed"); }
        finally { setBusy(false); }
    };

    return (
        <div className="admin-card" style={{ padding: 16 }} data-testid="canva-panel">
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 10 }}>
                <Palette size={16} /> Canva
                {st && (st.connected
                    ? <span style={{ fontSize: 12, color: "#1e7e34" }}><CheckCircle2 size={13} /> connected</span>
                    : st.configured
                        ? <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>not connected</span>
                        : <span style={{ fontSize: 12, color: "#b42318" }}><XCircle size={13} /> not configured</span>)}
            </div>

            {st && !st.connected && (
                <button className="admin-btn admin-btn-primary" onClick={connect} disabled={!st.configured} data-testid="canva-connect">
                    <PlugZap size={14} /> Connect Canva
                </button>
            )}

            {st?.connected && (
                <>
                    <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 10 }}>
                        Connected by {st.connected_by || "founder"} · <button className="admin-link" onClick={disconnect} data-testid="canva-disconnect" style={{ background: "none", border: "none", color: "#b42318", cursor: "pointer", padding: 0 }}>Disconnect</button>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
                            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--admin-muted)" }} />
                            <input className="admin-input" style={{ paddingLeft: 30 }} placeholder="Search your Canva designs…" value={q}
                                onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && browse()} data-testid="canva-search" />
                        </div>
                        <button className="admin-btn admin-btn-secondary" onClick={browse} disabled={busy} data-testid="canva-browse">Browse</button>
                        <button className="admin-btn admin-btn-secondary" onClick={() => setSel({ id: MASTER_DESIGN, title: "CRISP ORIGINAL MASTER" })} data-testid="canva-master">Use master design</button>
                    </div>

                    {sel && <div style={{ fontSize: 12, marginBottom: 8 }}>Selected: <strong>{sel.title}</strong> <span style={{ color: "var(--admin-muted)" }}>({sel.id})</span></div>}

                    {designs.length > 0 && (
                        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, marginBottom: 10 }}>
                            {designs.map((d) => (
                                <div key={d.id} onClick={() => setSel(d)} data-testid={`canva-design-${d.id}`}
                                    style={{ flexShrink: 0, width: 110, cursor: "pointer", border: sel?.id === d.id ? "2px solid var(--admin-primary, #0E4D52)" : "1px solid var(--admin-border,#e5e5e5)", borderRadius: 8, padding: 4 }}>
                                    {d.thumbnail_url
                                        ? <img src={d.thumbnail_url} alt={d.title} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 4 }} />
                                        : <div style={{ height: 80, background: "var(--admin-bg)", borderRadius: 4 }} />}
                                    <div style={{ fontSize: 10, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
                        <div><label className="admin-label">Format</label>
                            <select className="admin-input" value={type} onChange={(e) => setType(e.target.value)} data-testid="canva-type">
                                {["png", "jpg", "pdf", "mp4"].map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
                            </select></div>
                        <div><label className="admin-label">Campaign</label>
                            <select className="admin-input" value={campaign} onChange={(e) => setCampaign(e.target.value)} data-testid="canva-campaign">
                                <option value="">Select…</option>
                                {campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}
                            </select></div>
                        <div><label className="admin-label">Platform</label>
                            <select className="admin-input" value={platform} onChange={(e) => setPlatform(e.target.value)} data-testid="canva-platform">
                                {["all", "facebook", "instagram", "linkedin"].map((p) => <option key={p} value={p}>{p}</option>)}
                            </select></div>
                    </div>
                    <button className="admin-btn admin-btn-primary" style={{ marginTop: 10 }} onClick={runExport} disabled={busy || !sel} data-testid="canva-export">
                        <Download size={14} /> {busy ? "Working…" : "Export & import to library"}
                    </button>
                </>
            )}
        </div>
    );
}

/* -------------------------------------------------------------- Recovery */
function RecoveryPanel({ onDone }) {
    const [plan, setPlan] = useState(null);
    const [busy, setBusy] = useState(false);
    const preview = async () => {
        setBusy(true);
        try { setPlan((await adminApi.get("/mkt/buffer/recover/plan")).data); }
        catch (e) { toast.error(e?.response?.data?.detail || "Could not build recovery plan"); }
        finally { setBusy(false); }
    };
    const run = async (live) => {
        if (live && !window.confirm("Attach media to ALL linked drafts in your real Buffer account? (stays as drafts — not scheduled)")) return;
        setBusy(true);
        try {
            const r = await adminApi.post("/mkt/buffer/recover/execute", { dry_run: !live });
            const attached = r.data.results.filter((x) => x.status === "attached").length;
            toast.success(live ? `Attached media to ${attached} draft(s)` : `Dry-run: ${r.data.count} draft(s) ready`);
            onDone?.(); preview();
        } catch (e) { toast.error(e?.response?.data?.detail || "Recovery failed"); }
        finally { setBusy(false); }
    };
    return (
        <div className="admin-card" style={{ padding: 16 }} data-testid="recovery-panel">
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 6 }}>
                <PlayCircle size={16} /> Bulk recovery
            </div>
            <p style={{ fontSize: 12, color: "var(--admin-muted)", margin: "0 0 10px" }}>
                Attaches approved assets to the exact drafts they're linked to (by Buffer draft ID). Scheduling stays OFF until live tests pass.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="admin-btn admin-btn-secondary" onClick={preview} disabled={busy} data-testid="recovery-preview">Preview</button>
                <button className="admin-btn admin-btn-secondary" onClick={() => run(false)} disabled={busy || !plan?.ready} data-testid="recovery-dryrun">Dry-run</button>
                <button className="admin-btn admin-btn-primary" onClick={() => run(true)} disabled={busy || !plan?.ready} data-testid="recovery-live">Attach all (LIVE)</button>
            </div>
            {plan && (
                <div style={{ marginTop: 10, fontSize: 13 }} data-testid="recovery-summary">
                    Linked drafts: <strong>{plan.linked_draft_count}</strong> · ready: <strong style={{ color: "#1e7e34" }}>{plan.ready}</strong> · blocked: <strong style={{ color: "#b42318" }}>{plan.blocked}</strong>
                    {plan.linked_draft_count === 0 && <div style={{ color: "var(--admin-muted)", marginTop: 4 }}>No approved assets are linked to a Buffer draft yet. Set a draft ID on assets (or let ChatGPT align them via the manifest).</div>}
                </div>
            )}
        </div>
    );
}

/* --------------------------------------------------------------- Manifest */
function ManifestLink() {
    const [data, setData] = useState(null);
    useEffect(() => { adminApi.get("/mkt/manifest-link").then((r) => setData(r.data)).catch(() => { }); }, []);
    const copy = (v) => { navigator.clipboard.writeText(v); toast.success("Copied"); };
    if (!data) return null;
    return (
        <div className="admin-card" style={{ padding: 16 }} data-testid="manifest-link">
            <div style={{ fontWeight: 600, marginBottom: 6 }}>ChatGPT asset manifest</div>
            <p style={{ fontSize: 12, color: "var(--admin-muted)", margin: "0 0 10px" }}>Secure, approved-only. Share with ChatGPT's Buffer automation.</p>
            {[["JSON", data.json_url], ["CSV", data.csv_url]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, width: 36, color: "var(--admin-muted)" }}>{k}</span>
                    <input className="admin-input" readOnly value={v} style={{ flex: 1, fontSize: 11 }} data-testid={`manifest-${k.toLowerCase()}`} />
                    <button className="admin-btn admin-btn-secondary" onClick={() => copy(v)}><Copy size={13} /></button>
                </div>
            ))}
        </div>
    );
}

/* ------------------------------------------------------------------ Page */
export default function AdminSocialPublishing() {
    const [status, setStatus] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [draftStatus, setDraftStatus] = useState("draft");
    const [drafts, setDrafts] = useState([]);
    const [byService, setByService] = useState({});
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [channelFilter, setChannelFilter] = useState("");

    const [selected, setSelected] = useState(null);
    const [planCampaign, setPlanCampaign] = useState("");
    const [planDue, setPlanDue] = useState("");
    const [plan, setPlan] = useState(null);
    const [busy, setBusy] = useState(false);

    const loadDrafts = useCallback(async (st, ch) => {
        try {
            const r = await adminApi.get("/mkt/buffer/drafts", { params: { status: st, channel: ch || undefined } });
            setDrafts(r.data.drafts || []); setByService(r.data.by_service || {});
        } catch (e) { setDrafts([]); toast.error(e?.response?.data?.detail || "Could not load Buffer drafts"); }
    }, []);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [s, c, j] = await Promise.all([
                adminApi.get("/mkt/buffer/status"),
                adminApi.get("/mkt/campaigns"),
                adminApi.get("/mkt/buffer/jobs"),
            ]);
            setStatus(s.data); setCampaigns(c.data); setJobs(j.data.jobs || []);
            await loadDrafts(draftStatus, channelFilter);
        } catch (e) { toast.error(e?.response?.data?.detail || "Could not reach Buffer"); }
        finally { setLoading(false); }
    }, [draftStatus, channelFilter, loadDrafts]);

    useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Canva OAuth return handling
    useEffect(() => {
        const p = new URLSearchParams(window.location.search).get("canva");
        if (!p) return;
        if (p === "connected") toast.success("Canva connected");
        else if (p === "expired") toast.error("Canva connect expired — try again");
        else if (p === "error") toast.error("Canva connection failed");
        window.history.replaceState({}, "", window.location.pathname);
    }, []);

    const openPlanner = (d) => { setSelected(d); setPlan(null); setPlanDue(""); setPlanCampaign(campaigns[0]?.campaign_id || ""); };

    const buildPlan = async () => {
        if (!planCampaign) return toast.error("Choose a campaign first");
        setBusy(true); setPlan(null);
        try {
            const r = await adminApi.post("/mkt/buffer/plan", { buffer_post_id: selected.id, campaign_id: planCampaign, due_at_local: planDue || null });
            setPlan(r.data);
            if (!r.data.asset_count) toast.warning("No approved assets matched this campaign + platform");
        } catch (e) { toast.error(e?.response?.data?.detail || "Could not build plan"); }
        finally { setBusy(false); }
    };

    const runAttach = async (live) => {
        if (!plan || !plan.asset_count) return toast.error("Build a plan with assets first");
        if (live && !window.confirm(`Attach ${plan.asset_count} asset(s) to this ${plan.platform} draft${plan.due_at_utc ? " and SCHEDULE to the live Buffer queue" : ""}?\n\nThis writes to your real Buffer account.`)) return;
        setBusy(true);
        try {
            const r = await adminApi.post("/mkt/buffer/attach", {
                buffer_post_id: selected.id, campaign_id: planCampaign, due_at_local: planDue || null,
                dry_run: !live, idempotency_key: live ? `${selected.id}:${planCampaign}:${planDue || "nodate"}` : null,
            });
            if (live) { toast.success(`Live: ${r.data.result} — ${r.data?.verify?.asset_count ?? plan.asset_count} asset(s) on the draft`); setSelected(null); setPlan(null); await loadAll(); }
            else toast.success("Dry-run OK — media validated, payload ready. No write made.");
        } catch (e) { toast.error(e?.response?.data?.detail || "Attach failed"); }
        finally { setBusy(false); }
    };

    return (
        <div data-testid="admin-social-publishing">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22 }}>Social Publishing</h1>
                    <p style={{ margin: "4px 0 0", color: "var(--admin-muted)", fontSize: 13 }}>
                        Canva → approved media → your <strong>existing</strong> Buffer drafts (Australia/Sydney). Never creates new posts.
                    </p>
                </div>
                <button className="admin-btn admin-btn-secondary" onClick={loadAll} data-testid="buffer-refresh"><RefreshCw size={14} /> Refresh</button>
            </div>

            {/* connection row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12, marginBottom: 16 }}>
                <div className="admin-card" style={{ padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 10 }}>
                        <Link2 size={16} /> Buffer
                        {status && (status.configured
                            ? <span style={{ fontSize: 12, color: "#1e7e34" }}><CheckCircle2 size={13} /> connected</span>
                            : <span style={{ fontSize: 12, color: "#b42318" }}><XCircle size={13} /> not configured</span>)}
                    </div>
                    {status?.configured && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {status.channels.map((c) => (
                                <div key={c.service} style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--admin-border,#eee)", borderRadius: 8 }} data-testid={`buffer-channel-${c.service}`}>
                                    <span style={{ ...svcBadge(c.service), padding: "2px 8px", borderRadius: 6, fontSize: 11, textTransform: "capitalize", fontWeight: 600 }}>{c.service}</span>
                                    {c.connected && c.matches ? <CheckCircle2 size={14} color="#1e7e34" /> : <XCircle size={14} color="#b42318" />}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <CanvaPanel campaigns={campaigns} onIngested={loadAll} />
            </div>

            {/* tools row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12, marginBottom: 20 }}>
                <RecoveryPanel onDone={loadAll} />
                <ManifestLink />
            </div>

            {/* drafts */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>Existing posts</strong>
                <select className="admin-input" style={{ width: "auto" }} value={draftStatus}
                    onChange={(e) => { setDraftStatus(e.target.value); loadDrafts(e.target.value, channelFilter); }} data-testid="buffer-status-filter">
                    <option value="draft">Drafts</option><option value="scheduled">Scheduled</option><option value="sent">Sent</option>
                </select>
                <select className="admin-input" style={{ width: "auto" }} value={channelFilter}
                    onChange={(e) => { setChannelFilter(e.target.value); loadDrafts(draftStatus, e.target.value); }} data-testid="buffer-channel-filter">
                    <option value="">All channels</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="linkedin">LinkedIn</option>
                </select>
                <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>
                    {drafts.length} shown · {Object.entries(byService).map(([k, v]) => `${k} ${v}`).join(" · ")}
                </span>
            </div>

            {loading ? <div style={{ color: "var(--admin-muted)", padding: 20 }}>Loading…</div>
                : drafts.length === 0 ? (
                    <div className="admin-card" style={{ padding: 24, textAlign: "center", color: "var(--admin-muted)" }} data-testid="buffer-empty">No {draftStatus} posts on your connected channels.</div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 20 }}>
                        {drafts.map((d) => (
                            <div key={d.id} className="admin-card" style={{ padding: 14 }} data-testid={`buffer-draft-${d.id}`}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                    <span style={{ ...svcBadge(d.service), padding: "2px 8px", borderRadius: 6, fontSize: 11, textTransform: "capitalize", fontWeight: 600 }}>{d.service}</span>
                                    <span style={{ fontSize: 11, color: "var(--admin-muted)" }}>{d.status}</span>
                                </div>
                                <div style={{ fontSize: 13, color: "var(--admin-text)", minHeight: 54, whiteSpace: "pre-wrap", overflow: "hidden" }}>{d.text || <em style={{ color: "var(--admin-muted)" }}>(no caption)</em>}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, fontSize: 12, color: "var(--admin-muted)" }}>
                                    <span><Layers size={12} /> {d.asset_count} media</span>
                                    {d.due_at && <span><Calendar size={12} /> {new Date(d.due_at).toLocaleString()}</span>}
                                </div>
                                <button className="admin-btn admin-btn-primary" style={{ marginTop: 12, width: "100%" }} onClick={() => openPlanner(d)} data-testid={`buffer-plan-${d.id}`}>
                                    <Send size={14} /> Attach media
                                </button>
                            </div>
                        ))}
                    </div>
                )}

            {/* planner drawer */}
            {selected && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "flex-end", zIndex: 50 }} onClick={() => setSelected(null)}>
                    <div className="admin-card" style={{ width: "min(560px, 100%)", height: "100%", overflowY: "auto", borderRadius: 0, padding: 20 }} onClick={(e) => e.stopPropagation()} data-testid="buffer-planner">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                            <h2 style={{ margin: 0, fontSize: 18 }}>Attach to {selected.service} draft</h2>
                            <button className="admin-btn admin-btn-secondary" onClick={() => setSelected(null)}>Close</button>
                        </div>
                        <label className="admin-label">Campaign</label>
                        <select className="admin-input" value={planCampaign} onChange={(e) => { setPlanCampaign(e.target.value); setPlan(null); }} data-testid="buffer-plan-campaign">
                            <option value="">Select campaign…</option>
                            {campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name} ({c.asset_count})</option>)}
                        </select>
                        <label className="admin-label" style={{ marginTop: 10 }}>Schedule (Australia/Sydney) — blank = attach as draft</label>
                        <input className="admin-input" type="datetime-local" value={planDue} onChange={(e) => { setPlanDue(e.target.value); setPlan(null); }} data-testid="buffer-plan-due" />
                        <button className="admin-btn admin-btn-primary" style={{ marginTop: 12, width: "100%" }} onClick={buildPlan} disabled={busy} data-testid="buffer-build-plan">{busy ? "Working…" : "Build plan"}</button>

                        {plan && (
                            <div style={{ marginTop: 16 }} data-testid="buffer-plan-result">
                                <div style={{ fontSize: 13, marginBottom: 6 }}>
                                    <strong>{plan.asset_count}</strong> asset(s) · {plan.schedule}
                                    {plan.media_ok ? <span style={{ color: "#1e7e34", marginLeft: 8 }}><CheckCircle2 size={13} /> media reachable</span>
                                        : <span style={{ color: "#b42318", marginLeft: 8 }}><XCircle size={13} /> media NOT reachable</span>}
                                </div>
                                {plan.warnings?.map((w, i) => (
                                    <div key={i} style={{ fontSize: 12, color: "#9a6700", background: "#fff4e5", padding: "6px 10px", borderRadius: 6, marginBottom: 6, display: "flex", gap: 6 }}><AlertTriangle size={14} /> {w}</div>
                                ))}
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
                                    {plan.matched_assets.map((m) => (
                                        <div key={m.asset_id} style={{ width: 84 }} title={m.filename}>
                                            <img src={m.thumbnail_url || m.media_url} alt={m.alt_text} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 6, display: "block", background: "var(--admin-bg)" }} />
                                            <div style={{ fontSize: 10, color: "var(--admin-muted)", marginTop: 2 }}>#{m.carousel_order} · {m.asset_type}</div>
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                    <button className="admin-btn admin-btn-secondary" style={{ flex: 1 }} onClick={() => runAttach(false)} disabled={busy || !plan.asset_count} data-testid="buffer-dryrun">Dry-run</button>
                                    <button className="admin-btn admin-btn-primary" style={{ flex: 1 }} onClick={() => runAttach(true)} disabled={busy || !plan.asset_count || !plan.media_ok} data-testid="buffer-attach-live">{plan.due_at_utc ? "Attach & schedule (LIVE)" : "Attach to draft (LIVE)"}</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* job history */}
            <div style={{ fontSize: 14, fontWeight: 600, margin: "6px 0 10px" }}>Recent actions</div>
            {jobs.length === 0 ? <div style={{ fontSize: 13, color: "var(--admin-muted)" }}>No attach/schedule actions yet.</div> : (
                <div className="admin-card" style={{ overflowX: "auto" }}>
                    <table className="admin-table" style={{ width: "100%", fontSize: 12 }} data-testid="buffer-jobs">
                        <thead><tr><th>When</th><th>Campaign</th><th>Platform</th><th>Assets</th><th>Scheduled</th><th>Result</th></tr></thead>
                        <tbody>
                            {jobs.map((j) => (
                                <tr key={j.id}>
                                    <td>{new Date(j.created_at).toLocaleString()}</td>
                                    <td>{j.campaign_id || "—"}</td>
                                    <td style={{ textTransform: "capitalize" }}>{j.platform}</td>
                                    <td>{j.verified_asset_count ?? j.asset_count}</td>
                                    <td>{j.due_at_utc ? new Date(j.due_at_utc).toLocaleString() : "—"}</td>
                                    <td style={{ color: j.result === "success" ? "#1e7e34" : "#b42318" }}>{j.result}{j.error_message ? `: ${j.error_message}` : ""}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
