import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
    LifeBuoy, Plus, X, Sparkles, Newspaper, Handshake, FlaskConical, Share2, Lightbulb, Send,
} from "lucide-react";
import { adminApi } from "./AdminAuthContext";

const extractMsg = (e, f = "Error") => {
    const d = e?.response?.data?.detail;
    return typeof d === "string" ? d : f;
};

function Field({ label, children }) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
            <span style={{ color: "var(--admin-muted)", fontWeight: 600 }}>{label}</span>
            {children}
        </label>
    );
}

function SimpleModal({ title, fields, onClose, onSubmit, testid }) {
    const [f, setF] = useState(() => Object.fromEntries(fields.map((x) => [x.key, ""])));
    const [busy, setBusy] = useState(false);
    const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
    const submit = async () => {
        const required = fields.filter((x) => x.required && !f[x.key]);
        if (required.length) { toast.error(`${required[0].label} is required.`); return; }
        setBusy(true);
        try { await onSubmit(f); onClose(); } catch (e) { toast.error(extractMsg(e, "Could not save.")); }
        finally { setBusy(false); }
    };
    return (
        <div className="admin-cmdk-overlay" onClick={onClose} data-testid={testid}>
            <div className="admin-card" onClick={(e) => e.stopPropagation()} style={{ width: 600, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
                    <button className="admin-btn" onClick={onClose}><X size={16} /></button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {fields.map((x) => (
                        <div key={x.key} style={{ gridColumn: x.full ? "1 / -1" : "auto" }}>
                            <Field label={x.label + (x.required ? " *" : "")}>
                                {x.area ? <textarea className="admin-input" rows={2} value={f[x.key]} onChange={set(x.key)} data-testid={`${testid}-${x.key}`} />
                                    : <input className="admin-input" value={f[x.key]} onChange={set(x.key)} data-testid={`${testid}-${x.key}`} />}
                            </Field>
                        </div>
                    ))}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                    <button className="admin-btn" onClick={onClose}>Cancel</button>
                    <button className="admin-btn admin-btn-primary" data-testid={`${testid}-save`} disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save"}</button>
                </div>
            </div>
        </div>
    );
}

export default function AdminGrowthPipeline() {
    const [tab, setTab] = useState("publicity");
    const [pub, setPub] = useState(null);
    const [partners, setPartners] = useState(null);
    const [experiments, setExperiments] = useState(null);
    const [referrals, setReferrals] = useState(null);
    const [recs, setRecs] = useState(null);
    const [modal, setModal] = useState(null);

    const load = useCallback(async () => {
        try {
            const [p, pa, ex, rf, rc] = await Promise.all([
                adminApi.get("/admin/pipeline/publicity"),
                adminApi.get("/admin/pipeline/partnerships"),
                adminApi.get("/admin/pipeline/experiments"),
                adminApi.get("/admin/pipeline/referrals"),
                adminApi.get("/admin/pipeline/recommendations"),
            ]);
            setPub(p.data); setPartners(pa.data); setExperiments(ex.data); setReferrals(rf.data); setRecs(rc.data);
        } catch (e) { toast.error(extractMsg(e, "Could not load pipeline.")); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const aiPitch = async (id) => {
        try { const r = await adminApi.post(`/admin/pipeline/publicity/${id}/ai-pitch`, {}); toast.success("Pitch drafted — review before approval"); window.alert(`Subject: ${r.data.subject || ""}\n\n${r.data.pitch_body || ""}`); load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    const submitPub = async (id) => {
        try { await adminApi.post(`/admin/pipeline/publicity/${id}/submit`, {}); toast.success("Sent for approval"); load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };
    const markSent = async (id) => {
        try { await adminApi.post(`/admin/pipeline/publicity/${id}/mark-sent`, {}); toast.success("Marked sent"); load(); }
        catch (e) { toast.error(extractMsg(e, "Must be approved first.")); }
    };
    const generateRecs = async () => {
        try { const r = await adminApi.post("/admin/pipeline/recommendations/generate", {}); toast.success(`Generated ${r.data.created} recommendation(s)`); load(); }
        catch (e) { toast.error(extractMsg(e)); }
    };

    const TABS = [["publicity", "Publicity", Newspaper], ["partnerships", "Partnerships", Handshake], ["experiments", "Experiments", FlaskConical], ["referrals", "Referrals", Share2], ["recommendations", "Recommendations", Lightbulb]];

    return (
        <div data-testid="admin-growth-pipeline">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <LifeBuoy size={22} /><h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Publicity, Partnerships & Growth</h1>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    {tab === "publicity" && <button className="admin-btn admin-btn-primary" data-testid="gp-add-publicity" onClick={() => setModal("publicity")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add opportunity</button>}
                    {tab === "partnerships" && <button className="admin-btn admin-btn-primary" data-testid="gp-add-partnership" onClick={() => setModal("partnership")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add partner</button>}
                    {tab === "experiments" && <button className="admin-btn admin-btn-primary" data-testid="gp-add-experiment" onClick={() => setModal("experiment")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> New experiment</button>}
                    {tab === "referrals" && <button className="admin-btn admin-btn-primary" data-testid="gp-add-referral" onClick={() => setModal("referral")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add source</button>}
                    {tab === "recommendations" && <>
                        <button className="admin-btn" data-testid="gp-generate-recs" onClick={generateRecs} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Sparkles size={14} /> Generate</button>
                        <button className="admin-btn admin-btn-primary" data-testid="gp-add-rec" onClick={() => setModal("rec")} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Add</button>
                    </>}
                </div>
            </div>
            <p style={{ color: "var(--admin-muted)", marginTop: 0, fontSize: 13 }}>No outreach is ever sent automatically. Partnerships affecting Wayly's independence are flagged. The referral programme is OFF behind a feature flag.</p>

            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }} data-testid="gp-tabs">
                {TABS.map(([k, l, Icon]) => (
                    <button key={k} data-testid={`gp-tab-${k}`} onClick={() => setTab(k)} className="admin-btn" style={{ fontSize: 13, padding: "6px 14px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6, background: tab === k ? "#0E4D52" : "transparent", color: tab === k ? "#fff" : "var(--admin-muted)", border: tab === k ? "none" : "1px solid var(--admin-border)" }}>
                        <Icon size={14} /> {l}
                    </button>
                ))}
            </div>

            {tab === "publicity" && (
                <div className="admin-card" style={{ overflowX: "auto" }}>
                    <table className="admin-table">
                        <thead><tr><th>Outlet</th><th>Topic</th><th>Status</th><th>Priority</th><th></th></tr></thead>
                        <tbody>
                            {!pub ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                                : pub.opportunities.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--admin-muted)" }} data-testid="gp-publicity-empty">No publicity opportunities yet.</td></tr>
                                    : pub.opportunities.map((p) => (
                                        <tr key={p.id} data-testid={`publicity-row-${p.id}`}>
                                            <td style={{ fontWeight: 600, fontSize: 13 }}>{p.outlet}<div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{p.reference}</div></td>
                                            <td style={{ fontSize: 12 }}>{p.topic || "—"}</td>
                                            <td style={{ fontSize: 12 }}>{(p.status || "").replace(/_/g, " ")}</td>
                                            <td style={{ fontSize: 12 }}>{p.priority}</td>
                                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                                <button className="admin-btn" data-testid={`publicity-ai-${p.id}`} onClick={() => aiPitch(p.id)} style={{ padding: "3px 8px", marginRight: 4 }}><Sparkles size={12} /></button>
                                                <button className="admin-btn" data-testid={`publicity-submit-${p.id}`} onClick={() => submitPub(p.id)} style={{ padding: "3px 8px", marginRight: 4 }}>Submit</button>
                                                <button className="admin-btn" data-testid={`publicity-sent-${p.id}`} onClick={() => markSent(p.id)} style={{ padding: "3px 8px", display: "inline-flex", alignItems: "center", gap: 4 }}><Send size={11} /> Sent</button>
                                            </td>
                                        </tr>
                                    ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === "partnerships" && (
                <div className="admin-card" style={{ overflowX: "auto" }}>
                    <table className="admin-table">
                        <thead><tr><th>Organisation</th><th>Type</th><th>Status</th><th>Priority</th><th>Independence</th></tr></thead>
                        <tbody>
                            {!partners ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                                : partners.partnerships.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--admin-muted)" }} data-testid="gp-partnerships-empty">No partnerships yet.</td></tr>
                                    : partners.partnerships.map((p) => (
                                        <tr key={p.id} data-testid={`partnership-row-${p.id}`}>
                                            <td style={{ fontWeight: 600, fontSize: 13 }}>{p.organisation}</td>
                                            <td style={{ fontSize: 12 }}>{p.partnership_type || "—"}</td>
                                            <td style={{ fontSize: 12 }}>{(p.status || "").replace(/_/g, " ")}</td>
                                            <td style={{ fontSize: 12 }}>{p.priority}</td>
                                            <td>{p.independence_flag ? <span style={{ fontSize: 11, fontWeight: 700, color: "#B42318" }}>Review needed</span> : <span style={{ fontSize: 11, color: "#2f7d4a" }}>OK</span>}</td>
                                        </tr>
                                    ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === "experiments" && (
                <div className="admin-card" style={{ overflowX: "auto" }}>
                    <table className="admin-table">
                        <thead><tr><th>Title</th><th>Primary metric</th><th>Status</th><th>Sample</th></tr></thead>
                        <tbody>
                            {!experiments ? <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                                : experiments.experiments.length === 0 ? <tr><td colSpan={4} style={{ textAlign: "center", padding: 28, color: "var(--admin-muted)" }} data-testid="gp-experiments-empty">No experiments yet.</td></tr>
                                    : experiments.experiments.map((e) => (
                                        <tr key={e.id} data-testid={`experiment-row-${e.id}`}>
                                            <td style={{ fontWeight: 600, fontSize: 13 }}>{e.title}<div style={{ fontSize: 11, color: "var(--admin-muted)" }}>{e.hypothesis}</div></td>
                                            <td style={{ fontSize: 12 }}>{e.primary_metric}</td>
                                            <td style={{ fontSize: 12 }}>{e.status}</td>
                                            <td style={{ fontSize: 12 }}>{e.sample_size ?? "—"}</td>
                                        </tr>
                                    ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === "referrals" && (
                <div className="admin-card" style={{ padding: 16 }} data-testid="gp-referrals">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: referrals?.enabled ? "#2f7d4a" : "#9aa0a6", color: "#fff" }} data-testid="gp-referral-flag">
                            Programme {referrals?.enabled ? "ON" : "OFF"}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>{referrals?.note}</span>
                    </div>
                    {!referrals?.sources?.length ? <div style={{ color: "var(--admin-muted)", fontSize: 13 }}>No referral sources recorded.</div>
                        : referrals.sources.map((s) => (
                            <div key={s.id} style={{ display: "flex", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--admin-border)", fontSize: 13 }}>
                                <span style={{ fontWeight: 600, minWidth: 160 }}>{s.source_name}</span>
                                <span className="admin-mono" style={{ fontSize: 12 }}>{s.code}</span>
                                <span style={{ fontSize: 11, color: "var(--admin-muted)", marginLeft: "auto" }}>reg {s.recorded_registrations} · trial {s.recorded_trials} · paid {s.recorded_paid}</span>
                            </div>
                        ))}
                </div>
            )}

            {tab === "recommendations" && (
                <div className="admin-card" style={{ overflowX: "auto" }}>
                    <table className="admin-table">
                        <thead><tr><th>Title</th><th>Area</th><th>Evidence</th><th>Priority</th><th>Status</th></tr></thead>
                        <tbody>
                            {!recs ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--admin-muted)" }}>Loading…</td></tr>
                                : recs.recommendations.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center", padding: 28, color: "var(--admin-muted)" }} data-testid="gp-recs-empty">No recommendations yet. Generate from verified signals or add your own.</td></tr>
                                    : recs.recommendations.map((r) => (
                                        <tr key={r.id} data-testid={`rec-row-${r.id}`}>
                                            <td style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</td>
                                            <td style={{ fontSize: 12 }}>{r.area}</td>
                                            <td style={{ fontSize: 12, color: "var(--admin-muted)", maxWidth: 320 }}>{r.evidence}</td>
                                            <td style={{ fontSize: 12 }}>{r.priority}</td>
                                            <td style={{ fontSize: 12 }}>{r.status}</td>
                                        </tr>
                                    ))}
                        </tbody>
                    </table>
                </div>
            )}

            {modal === "publicity" && <SimpleModal title="New publicity opportunity" testid="publicity-modal" onClose={() => setModal(null)}
                onSubmit={async (f) => { await adminApi.post("/admin/pipeline/publicity", { outlet: f.outlet, opportunity_type: f.opportunity_type || undefined, topic: f.topic || undefined, target_audience: f.target_audience || undefined }); toast.success("Added"); load(); }}
                fields={[{ key: "outlet", label: "Outlet / publication", required: true }, { key: "opportunity_type", label: "Type" }, { key: "topic", label: "Topic", full: true }, { key: "target_audience", label: "Target audience", full: true }]} />}
            {modal === "partnership" && <SimpleModal title="New partnership" testid="partnership-modal" onClose={() => setModal(null)}
                onSubmit={async (f) => { const r = await adminApi.post("/admin/pipeline/partnerships", { organisation: f.organisation, partnership_type: f.partnership_type || undefined, description: f.description || undefined, strategic_fit: f.strategic_fit || undefined }); if (r.data.independence_flag) toast.warning("Flagged for founder review (independence)"); else toast.success("Added"); load(); }}
                fields={[{ key: "organisation", label: "Organisation", required: true }, { key: "partnership_type", label: "Type" }, { key: "strategic_fit", label: "Strategic fit", full: true, area: true }, { key: "description", label: "Description", full: true, area: true }]} />}
            {modal === "experiment" && <SimpleModal title="New experiment" testid="experiment-modal" onClose={() => setModal(null)}
                onSubmit={async (f) => { await adminApi.post("/admin/pipeline/experiments", { title: f.title, business_problem: f.business_problem, hypothesis: f.hypothesis, primary_metric: f.primary_metric }); toast.success("Added"); load(); }}
                fields={[{ key: "title", label: "Title", required: true, full: true }, { key: "business_problem", label: "Business problem", required: true, full: true, area: true }, { key: "hypothesis", label: "Hypothesis", required: true, full: true, area: true }, { key: "primary_metric", label: "Primary metric", required: true }]} />}
            {modal === "referral" && <SimpleModal title="New referral source" testid="referral-modal" onClose={() => setModal(null)}
                onSubmit={async (f) => { await adminApi.post("/admin/pipeline/referrals/sources", { source_name: f.source_name, campaign: f.campaign || undefined, code: f.code || undefined }); toast.success("Added"); load(); }}
                fields={[{ key: "source_name", label: "Source name", required: true }, { key: "campaign", label: "Campaign" }, { key: "code", label: "Code (optional)" }]} />}
            {modal === "rec" && <SimpleModal title="New recommendation" testid="rec-modal" onClose={() => setModal(null)}
                onSubmit={async (f) => { await adminApi.post("/admin/pipeline/recommendations", { title: f.title, area: f.area || "general", evidence: f.evidence, source: f.source || "admin" }); toast.success("Added"); load(); }}
                fields={[{ key: "title", label: "Title", required: true, full: true }, { key: "area", label: "Area" }, { key: "source", label: "Source" }, { key: "evidence", label: "Evidence", required: true, full: true, area: true }]} />}
        </div>
    );
}
