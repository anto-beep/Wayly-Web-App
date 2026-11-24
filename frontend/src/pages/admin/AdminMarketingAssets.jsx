import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
    Image as ImageIcon, FileText, Film, Upload, Download, Plus, Search,
    CheckCircle2, XCircle, Trash2, Copy, X, Layers,
} from "lucide-react";
import { adminApi } from "./AdminAuthContext";

const PLATFORMS = ["all", "facebook", "instagram", "linkedin"];
const TYPES = ["image", "video", "document"];
const APPROVALS = ["draft", "approved", "rejected"];

const badgeColor = (s) => ({
    approved: { bg: "#e6f4ea", fg: "#1e7e34" },
    draft: { bg: "#fff4e5", fg: "#9a6700" },
    rejected: { bg: "#fde8e8", fg: "#b42318" },
}[s] || { bg: "var(--admin-bg)", fg: "var(--admin-muted)" });

// Thumbnail: approved images use the public URL; unapproved fetch via admin raw endpoint.
function AssetThumb({ asset }) {
    const [src, setSrc] = useState(null);
    useEffect(() => {
        let url = null, alive = true;
        if (asset.asset_type === "image") {
            if (asset.approval_status === "approved") { setSrc(asset.media_url); return; }
            adminApi.get(`/mkt/assets/${asset.id}/raw`, { responseType: "blob" })
                .then((r) => { if (!alive) return; url = URL.createObjectURL(r.data); setSrc(url); })
                .catch(() => { });
        }
        return () => { alive = false; if (url) URL.revokeObjectURL(url); };
    }, [asset.id, asset.asset_type, asset.approval_status, asset.media_url]);

    if (asset.asset_type === "image" && src)
        return <img src={src} alt={asset.alt_text || asset.filename} style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />;
    const Icon = asset.asset_type === "video" ? Film : asset.asset_type === "document" ? FileText : ImageIcon;
    return (
        <div style={{ height: 130, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--admin-bg)", color: "var(--admin-muted)", flexDirection: "column", gap: 6 }}>
            <Icon size={30} />
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>{asset.asset_type}</span>
        </div>
    );
}

export default function AdminMarketingAssets() {
    const [stats, setStats] = useState(null);
    const [campaigns, setCampaigns] = useState([]);
    const [assets, setAssets] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ q: "", campaign_id: "", target_platform: "", asset_type: "", approval_status: "" });
    const [selected, setSelected] = useState(null);
    const [showCampaign, setShowCampaign] = useState(false);

    // upload form
    const [uCampaign, setUCampaign] = useState("");
    const [uTopic, setUTopic] = useState("");
    const [uPlatform, setUPlatform] = useState("all");
    const [uFiles, setUFiles] = useState([]);
    const [uploading, setUploading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
            const [s, c, a] = await Promise.all([
                adminApi.get("/mkt/stats"),
                adminApi.get("/mkt/campaigns"),
                adminApi.get("/mkt/assets", { params }),
            ]);
            setStats(s.data); setCampaigns(c.data);
            setAssets(a.data.assets); setTotal(a.data.total);
        } catch (e) {
            toast.error("Could not load marketing assets");
        } finally { setLoading(false); }
    }, [filters]);

    useEffect(() => { load(); }, [load]);

    const doUpload = async () => {
        if (!uCampaign.trim()) return toast.error("Choose or name a campaign first");
        if (!uFiles.length) return toast.error("Pick at least one file");
        setUploading(true);
        try {
            const fd = new FormData();
            uFiles.forEach((f) => fd.append("files", f));
            fd.append("campaign_id", uCampaign.trim());
            fd.append("content_topic", uTopic.trim());
            fd.append("target_platform", uPlatform);
            const r = await adminApi.post("/mkt/assets/bulk-upload", fd);
            const { created_count, errors } = r.data;
            toast.success(`Uploaded ${created_count} asset${created_count === 1 ? "" : "s"}`);
            if (errors?.length) toast.warning(`${errors.length} file(s) skipped — check types/paths`);
            setUFiles([]); setUTopic("");
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Upload failed");
        } finally { setUploading(false); }
    };

    const patchAsset = async (id, body) => {
        try {
            const r = await adminApi.patch(`/mkt/assets/${id}`, body);
            toast.success("Asset updated");
            setAssets((list) => list.map((x) => (x.id === id ? r.data : x)));
            if (selected?.id === id) setSelected(r.data);
            load();
        } catch (e) { toast.error(e?.response?.data?.detail || "Update failed"); }
    };

    const delAsset = async (id) => {
        try {
            await adminApi.delete(`/mkt/assets/${id}`);
            toast.success("Asset deleted");
            setSelected(null); setAssets((l) => l.filter((x) => x.id !== id)); load();
        } catch { toast.error("Delete failed"); }
    };

    const downloadManifest = async (kind) => {
        try {
            const r = await adminApi.get(`/mkt/manifest.${kind}`, { responseType: "blob" });
            const url = URL.createObjectURL(r.data);
            const link = document.createElement("a");
            link.href = url; link.download = `wayly-marketing-manifest.${kind}`;
            link.click(); URL.revokeObjectURL(url);
        } catch { toast.error("Only approved assets are in the manifest — approve some first"); }
    };

    return (
        <div data-testid="admin-marketing-assets">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 22 }}>Marketing Assets</h1>
                    <p style={{ margin: "4px 0 0", color: "var(--admin-muted)", fontSize: 13 }}>
                        Social creative library · permanent public media URLs · campaign manifest for Buffer &amp; ChatGPT
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="admin-btn admin-btn-secondary" onClick={() => downloadManifest("json")} data-testid="mkt-manifest-json"><Download size={14} /> JSON</button>
                    <button className="admin-btn admin-btn-secondary" onClick={() => downloadManifest("csv")} data-testid="mkt-manifest-csv"><Download size={14} /> CSV</button>
                    <button className="admin-btn admin-btn-primary" onClick={() => setShowCampaign(true)} data-testid="mkt-new-campaign"><Plus size={14} /> New campaign</button>
                </div>
            </div>

            {/* stats */}
            {stats && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                    {[["Total", stats.total], ["Approved", stats.approved], ["Draft", stats.draft], ["Campaigns", stats.campaigns]].map(([k, v]) => (
                        <div key={k} className="admin-card" style={{ padding: "10px 16px", minWidth: 96 }}>
                            <div style={{ fontSize: 20, fontWeight: 700 }} data-testid={`mkt-stat-${k.toLowerCase()}`}>{v}</div>
                            <div style={{ fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</div>
                        </div>
                    ))}
                </div>
            )}

            {/* upload */}
            <div className="admin-card" style={{ padding: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontWeight: 600 }}><Upload size={16} /> Upload creative (PNG · JPG · MP4 · PDF · ZIP)</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    <div>
                        <label className="admin-label">Campaign</label>
                        <input className="admin-input" list="mkt-campaigns" value={uCampaign} onChange={(e) => setUCampaign(e.target.value)} placeholder="campaign-id" data-testid="mkt-upload-campaign" />
                        <datalist id="mkt-campaigns">{campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}</datalist>
                    </div>
                    <div>
                        <label className="admin-label">Content topic</label>
                        <input className="admin-input" value={uTopic} onChange={(e) => setUTopic(e.target.value)} placeholder="e.g. Statement Decoder" data-testid="mkt-upload-topic" />
                    </div>
                    <div>
                        <label className="admin-label">Platform</label>
                        <select className="admin-input" value={uPlatform} onChange={(e) => setUPlatform(e.target.value)} data-testid="mkt-upload-platform">
                            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="admin-label">Files</label>
                        <input className="admin-input" type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.pdf,.zip"
                            onChange={(e) => setUFiles(Array.from(e.target.files || []))} data-testid="mkt-upload-files" />
                    </div>
                </div>
                <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
                    <button className="admin-btn admin-btn-primary" onClick={doUpload} disabled={uploading} data-testid="mkt-upload-submit">
                        {uploading ? "Uploading…" : `Upload ${uFiles.length || ""}`}
                    </button>
                    {uFiles.length > 0 && <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>{uFiles.length} file(s) selected</span>}
                </div>
            </div>

            {/* filters */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
                    <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--admin-muted)" }} />
                    <input className="admin-input" style={{ paddingLeft: 30 }} placeholder="Search topic, filename, alt text…"
                        value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} data-testid="mkt-search" />
                </div>
                <select className="admin-input" style={{ width: "auto" }} value={filters.campaign_id} onChange={(e) => setFilters((f) => ({ ...f, campaign_id: e.target.value }))} data-testid="mkt-filter-campaign">
                    <option value="">All campaigns</option>
                    {campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}
                </select>
                <select className="admin-input" style={{ width: "auto" }} value={filters.target_platform} onChange={(e) => setFilters((f) => ({ ...f, target_platform: e.target.value }))} data-testid="mkt-filter-platform">
                    <option value="">All platforms</option>{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select className="admin-input" style={{ width: "auto" }} value={filters.asset_type} onChange={(e) => setFilters((f) => ({ ...f, asset_type: e.target.value }))} data-testid="mkt-filter-type">
                    <option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="admin-input" style={{ width: "auto" }} value={filters.approval_status} onChange={(e) => setFilters((f) => ({ ...f, approval_status: e.target.value }))} data-testid="mkt-filter-approval">
                    <option value="">Any status</option>{APPROVALS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
            </div>

            {/* grid */}
            {loading ? (
                <div style={{ color: "var(--admin-muted)", padding: 40, textAlign: "center" }}>Loading…</div>
            ) : assets.length === 0 ? (
                <div className="admin-card" style={{ padding: 40, textAlign: "center", color: "var(--admin-muted)" }}>
                    <Layers size={28} style={{ marginBottom: 8 }} /><div>No assets yet. Upload creative above to get started.</div>
                </div>
            ) : (
                <>
                    <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 8 }}>{total} asset(s)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
                        {assets.map((a) => {
                            const bc = badgeColor(a.approval_status);
                            return (
                                <div key={a.id} className="admin-card" style={{ overflow: "hidden", cursor: "pointer" }} onClick={() => setSelected(a)} data-testid={`mkt-asset-${a.id}`}>
                                    <AssetThumb asset={a} />
                                    <div style={{ padding: "8px 10px" }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.content_topic || a.filename}</div>
                                        <div style={{ fontSize: 11, color: "var(--admin-muted)", marginTop: 2 }}>{a.campaign_id} · #{a.carousel_order}</div>
                                        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: bc.bg, color: bc.fg, fontWeight: 600 }}>{a.approval_status}</span>
                                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "var(--admin-bg)", color: "var(--admin-muted)" }}>{a.target_platform}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {selected && <AssetDrawer asset={selected} onClose={() => setSelected(null)} onPatch={patchAsset} onDelete={delAsset} campaigns={campaigns} />}
            {showCampaign && <CampaignModal onClose={() => setShowCampaign(false)} onCreated={() => { setShowCampaign(false); load(); }} />}
        </div>
    );
}

function AssetDrawer({ asset, onClose, onPatch, onDelete, campaigns }) {
    const [topic, setTopic] = useState(asset.content_topic || "");
    const [alt, setAlt] = useState(asset.alt_text || "");
    const [order, setOrder] = useState(asset.carousel_order || 0);
    const [platform, setPlatform] = useState(asset.target_platform || "all");
    const [campaign, setCampaign] = useState(asset.campaign_id || "");

    const copyUrl = () => { navigator.clipboard?.writeText(asset.media_url); toast.success("Public URL copied"); };

    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", justifyContent: "flex-end" }} data-testid="mkt-asset-drawer">
            <div onClick={(e) => e.stopPropagation()} className="admin-root" style={{ width: 440, maxWidth: "100%", background: "var(--admin-surface)", height: "100%", overflowY: "auto", padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>Asset detail</h2>
                    <button className="admin-btn admin-btn-secondary" onClick={onClose} style={{ padding: 6 }}><X size={16} /></button>
                </div>
                <AssetThumb asset={asset} />
                <div style={{ fontSize: 12, color: "var(--admin-muted)", margin: "10px 0" }}>
                    {asset.asset_type} · {asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ""}{asset.pages ? `${asset.pages} pages · ` : ""}{Math.round((asset.file_size || 0) / 1024)} KB · v{asset.version}
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    <input className="admin-input" readOnly value={asset.media_url} data-testid="mkt-drawer-url" />
                    <button className="admin-btn admin-btn-secondary" onClick={copyUrl} style={{ padding: 8 }} data-testid="mkt-copy-url"><Copy size={14} /></button>
                </div>
                {asset.canva_design_id && <div style={{ fontSize: 12, color: "var(--admin-muted)", marginBottom: 6 }}>Canva ID: {asset.canva_design_id}</div>}
                <div style={{ fontSize: 11, color: "var(--admin-muted)", marginBottom: 12, wordBreak: "break-all" }}>sha256: {asset.checksum}</div>

                <label className="admin-label">Content topic</label>
                <input className="admin-input" value={topic} onChange={(e) => setTopic(e.target.value)} style={{ marginBottom: 10 }} data-testid="mkt-drawer-topic" />
                <label className="admin-label">Alt text (accessibility)</label>
                <textarea className="admin-input" value={alt} onChange={(e) => setAlt(e.target.value)} rows={2} style={{ marginBottom: 10 }} data-testid="mkt-drawer-alt" />
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                        <label className="admin-label">Carousel order</label>
                        <input className="admin-input" type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} data-testid="mkt-drawer-order" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label className="admin-label">Platform</label>
                        <select className="admin-input" value={platform} onChange={(e) => setPlatform(e.target.value)} data-testid="mkt-drawer-platform">
                            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                </div>
                <label className="admin-label">Campaign</label>
                <input className="admin-input" list="mkt-drawer-campaigns" value={campaign} onChange={(e) => setCampaign(e.target.value)} style={{ marginBottom: 14 }} data-testid="mkt-drawer-campaign" />
                <datalist id="mkt-drawer-campaigns">{campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}</datalist>

                <button className="admin-btn admin-btn-primary" style={{ width: "100%", marginBottom: 10 }}
                    onClick={() => onPatch(asset.id, { content_topic: topic, alt_text: alt, carousel_order: order, target_platform: platform, campaign_id: campaign })}
                    data-testid="mkt-drawer-save">Save changes</button>

                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button className="admin-btn admin-btn-secondary" style={{ flex: 1, color: "#1e7e34" }} onClick={() => onPatch(asset.id, { approval_status: "approved" })} data-testid="mkt-approve"><CheckCircle2 size={14} /> Approve</button>
                    <button className="admin-btn admin-btn-secondary" style={{ flex: 1, color: "#b42318" }} onClick={() => onPatch(asset.id, { approval_status: "rejected" })} data-testid="mkt-reject"><XCircle size={14} /> Reject</button>
                </div>
                <div style={{ fontSize: 11, color: "var(--admin-muted)", marginBottom: 10 }}>
                    Current: <b>{asset.approval_status}</b> · {asset.approval_status === "approved" ? "public URL is live" : "public URL stays private until approved"}
                </div>
                <button className="admin-btn admin-btn-secondary" style={{ width: "100%", color: "#b42318" }} onClick={() => onDelete(asset.id)} data-testid="mkt-delete"><Trash2 size={14} /> Delete asset</button>
            </div>
        </div>
    );
}

function CampaignModal({ onClose, onCreated }) {
    const [cid, setCid] = useState("");
    const [name, setName] = useState("");
    const [topic, setTopic] = useState("");
    const [busy, setBusy] = useState(false);
    const create = async () => {
        if (!cid.trim() || !name.trim()) return toast.error("Campaign ID and name are required");
        setBusy(true);
        try {
            await adminApi.post("/mkt/campaigns", { campaign_id: cid.trim(), name: name.trim(), topic: topic.trim() });
            toast.success("Campaign created");
            onCreated();
        } catch (e) { toast.error(e?.response?.data?.detail || "Could not create campaign"); }
        finally { setBusy(false); }
    };
    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }} data-testid="mkt-campaign-modal">
            <div onClick={(e) => e.stopPropagation()} className="admin-root" style={{ width: 400, background: "var(--admin-surface)", borderRadius: 10, padding: 20 }}>
                <h2 style={{ marginTop: 0, fontSize: 18 }}>New campaign</h2>
                <label className="admin-label">Campaign ID (unique)</label>
                <input className="admin-input" value={cid} onChange={(e) => setCid(e.target.value)} placeholder="nov-launch-week-1" style={{ marginBottom: 10 }} data-testid="mkt-campaign-id" />
                <label className="admin-label">Name</label>
                <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="November Launch — Week 1" style={{ marginBottom: 10 }} data-testid="mkt-campaign-name" />
                <label className="admin-label">Topic</label>
                <input className="admin-input" value={topic} onChange={(e) => setTopic(e.target.value)} style={{ marginBottom: 16 }} data-testid="mkt-campaign-topic" />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="admin-btn admin-btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="admin-btn admin-btn-primary" onClick={create} disabled={busy} data-testid="mkt-campaign-create">{busy ? "Creating…" : "Create"}</button>
                </div>
            </div>
        </div>
    );
}
