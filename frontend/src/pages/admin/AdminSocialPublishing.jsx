import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
    Send, RefreshCw, CheckCircle2, XCircle, Calendar, Layers, AlertTriangle, Link2,
} from "lucide-react";
import { adminApi } from "./AdminAuthContext";

const SERVICE_COLORS = {
    facebook: { bg: "#e7f0fe", fg: "#1877f2" },
    instagram: { bg: "#fdeef4", fg: "#c13584" },
    linkedin: { bg: "#e6f0f7", fg: "#0a66c2" },
};

const svcBadge = (s) => SERVICE_COLORS[s] || { bg: "var(--admin-bg)", fg: "var(--admin-muted)" };

export default function AdminSocialPublishing() {
    const [status, setStatus] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [draftStatus, setDraftStatus] = useState("draft");
    const [drafts, setDrafts] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);

    const [selected, setSelected] = useState(null); // draft being planned
    const [planCampaign, setPlanCampaign] = useState("");
    const [planDue, setPlanDue] = useState("");
    const [plan, setPlan] = useState(null);
    const [busy, setBusy] = useState(false);

    const loadDrafts = useCallback(async (st) => {
        try {
            const r = await adminApi.get("/mkt/buffer/drafts", { params: { status: st } });
            setDrafts(r.data.drafts || []);
        } catch (e) {
            setDrafts([]);
            toast.error(e?.response?.data?.detail || "Could not load Buffer drafts");
        }
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
            await loadDrafts(draftStatus);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not reach Buffer");
        } finally { setLoading(false); }
    }, [draftStatus, loadDrafts]);

    useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const openPlanner = (d) => {
        setSelected(d); setPlan(null); setPlanDue("");
        setPlanCampaign(campaigns[0]?.campaign_id || "");
    };

    const buildPlan = async () => {
        if (!planCampaign) return toast.error("Choose a campaign first");
        setBusy(true); setPlan(null);
        try {
            const r = await adminApi.post("/mkt/buffer/plan", {
                buffer_post_id: selected.id, campaign_id: planCampaign,
                due_at_local: planDue || null,
            });
            setPlan(r.data);
            if (!r.data.asset_count) toast.warning("No approved assets matched this campaign + platform");
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not build plan");
        } finally { setBusy(false); }
    };

    const runAttach = async (live) => {
        if (!plan || !plan.asset_count) return toast.error("Build a plan with assets first");
        if (live && !window.confirm(
            `Attach ${plan.asset_count} asset(s) to this ${plan.platform} draft` +
            `${plan.due_at_utc ? " and SCHEDULE it to the live Buffer queue" : ""}?\n\nThis writes to your real Buffer account.`)) return;
        setBusy(true);
        try {
            const r = await adminApi.post("/mkt/buffer/attach", {
                buffer_post_id: selected.id, campaign_id: planCampaign,
                due_at_local: planDue || null, dry_run: !live,
                idempotency_key: live ? `${selected.id}:${planCampaign}:${planDue || "nodate"}` : null,
            });
            if (live) {
                toast.success(`Live: ${r.data.result} — ${r.data?.verify?.asset_count ?? plan.asset_count} asset(s) on the draft`);
                setSelected(null); setPlan(null);
                await loadAll();
            } else {
                toast.success("Dry-run OK — media validated, payload ready. No write made.");
            }
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Attach failed");
        } finally { setBusy(false); }
    };

    return (
        <div data-testid="admin-social-publishing">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22 }}>Social Publishing</h1>
                    <p style={{ margin: "4px 0 0", color: "var(--admin-muted)", fontSize: 13 }}>
                        Attach approved media to your <strong>existing</strong> Buffer drafts &amp; schedule (Australia/Sydney). Never creates new posts.
                    </p>
                </div>
                <button className="admin-btn admin-btn-secondary" onClick={loadAll} data-testid="buffer-refresh"><RefreshCw size={14} /> Refresh</button>
            </div>

            {/* connection */}
            <div className="admin-card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, marginBottom: 10 }}>
                    <Link2 size={16} /> Buffer connection
                    {status && (status.configured
                        ? <span style={{ fontSize: 12, color: "#1e7e34" }}><CheckCircle2 size={13} /> connected</span>
                        : <span style={{ fontSize: 12, color: "#b42318" }}><XCircle size={13} /> not configured</span>)}
                </div>
                {status?.configured && (
                    <>
                        <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 8 }}>Organisation: {status.organization_id}</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {status.channels.map((c) => (
                                <div key={c.service} className="admin-card" style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }} data-testid={`buffer-channel-${c.service}`}>
                                    <span style={{ ...svcBadge(c.service), padding: "2px 8px", borderRadius: 6, fontSize: 11, textTransform: "capitalize", fontWeight: 600 }}>{c.service}</span>
                                    {c.connected && c.matches
                                        ? <CheckCircle2 size={15} color="#1e7e34" />
                                        : <XCircle size={15} color="#b42318" />}
                                    <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>{c.live_name || "not connected"}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* drafts */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <strong style={{ fontSize: 14 }}>Existing posts</strong>
                <select className="admin-input" style={{ width: "auto" }} value={draftStatus}
                    onChange={(e) => { setDraftStatus(e.target.value); loadDrafts(e.target.value); }} data-testid="buffer-status-filter">
                    <option value="draft">Drafts</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="sent">Sent</option>
                </select>
                <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>{drafts.length} post(s)</span>
            </div>

            {loading ? <div style={{ color: "var(--admin-muted)", padding: 20 }}>Loading…</div>
                : drafts.length === 0 ? (
                    <div className="admin-card" style={{ padding: 24, textAlign: "center", color: "var(--admin-muted)" }} data-testid="buffer-empty">
                        No {draftStatus} posts on your connected channels.
                    </div>
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

                        <label className="admin-label" style={{ marginTop: 10 }}>Schedule (Australia/Sydney) — leave blank to attach as draft only</label>
                        <input className="admin-input" type="datetime-local" value={planDue} onChange={(e) => { setPlanDue(e.target.value); setPlan(null); }} data-testid="buffer-plan-due" />

                        <button className="admin-btn admin-btn-primary" style={{ marginTop: 12, width: "100%" }} onClick={buildPlan} disabled={busy} data-testid="buffer-build-plan">
                            {busy ? "Working…" : "Build plan"}
                        </button>

                        {plan && (
                            <div style={{ marginTop: 16 }} data-testid="buffer-plan-result">
                                <div style={{ fontSize: 13, marginBottom: 6 }}>
                                    <strong>{plan.asset_count}</strong> asset(s) · {plan.schedule}
                                    {plan.media_ok ? <span style={{ color: "#1e7e34", marginLeft: 8 }}><CheckCircle2 size={13} /> media reachable</span>
                                        : <span style={{ color: "#b42318", marginLeft: 8 }}><XCircle size={13} /> media NOT reachable</span>}
                                </div>

                                {plan.warnings?.map((w, i) => (
                                    <div key={i} style={{ fontSize: 12, color: "#9a6700", background: "#fff4e5", padding: "6px 10px", borderRadius: 6, marginBottom: 6, display: "flex", gap: 6 }}>
                                        <AlertTriangle size={14} /> {w}
                                    </div>
                                ))}

                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
                                    {plan.matched_assets.map((m) => (
                                        <div key={m.asset_id} style={{ width: 84 }} title={m.filename}>
                                            {m.asset_type === "image"
                                                ? <img src={m.media_url} alt={m.alt_text} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 6, display: "block" }} />
                                                : <div style={{ width: 84, height: 84, borderRadius: 6, background: "var(--admin-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase" }}>{m.asset_type}</div>}
                                            <div style={{ fontSize: 10, color: "var(--admin-muted)", marginTop: 2 }}>#{m.carousel_order}</div>
                                        </div>
                                    ))}
                                </div>

                                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                                    <button className="admin-btn admin-btn-secondary" style={{ flex: 1 }} onClick={() => runAttach(false)} disabled={busy || !plan.asset_count} data-testid="buffer-dryrun">
                                        Dry-run (validate only)
                                    </button>
                                    <button className="admin-btn admin-btn-primary" style={{ flex: 1 }} onClick={() => runAttach(true)} disabled={busy || !plan.asset_count || !plan.media_ok} data-testid="buffer-attach-live">
                                        {plan.due_at_utc ? "Attach & schedule (LIVE)" : "Attach to draft (LIVE)"}
                                    </button>
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
                                    <td>{j.campaign_id}</td>
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
