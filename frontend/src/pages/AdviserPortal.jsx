import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Briefcase, Users, UserPlus, Trash2, Loader2, ShieldCheck, ArrowUpRight, FileText, Eye, Link2, X, AlertCircle } from "lucide-react";

import SeoHead from "@/seo/SeoHead";

function StatusPill({ status }) {
    const styles = {
        invited: "bg-gold/20 text-primary-k",
        active: "bg-sage/20 text-primary-k",
        inactive: "bg-surface-2 text-muted-k",
        archived: "bg-surface-2 text-muted-k line-through",
    };
    return (
        <span
            data-testid={`adviser-client-status-${status}`}
            className={`inline-block text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 ${styles[status] || styles.inactive}`}
        >
            {status}
        </span>
    );
}

function SnapshotModal({ client, onClose, onDownloadPdf, downloading }) {
    const [snap, setSnap] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { data } = await api.get(`/adviser/clients/${client.id}/snapshot`);
                if (alive) setSnap(data);
            } catch (err) {
                if (alive) setError(err?.response?.data?.detail || err);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [client.id]);

    return (
        <div className="fixed inset-0 z-50 bg-primary-k/60 backdrop-blur-sm flex items-center justify-center px-4" data-testid="adviser-snapshot-modal" onClick={onClose}>
            <div className="bg-surface w-full max-w-3xl rounded-2xl border border-kindred shadow-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
                <header className="sticky top-0 bg-surface border-b border-kindred px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="text-xs uppercase tracking-wider text-muted-k">Client snapshot</div>
                        <h3 className="font-heading text-xl text-primary-k mt-0.5">{client.client_name}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="adviser-snapshot-close"
                        className="p-2 hover:bg-surface-2 rounded-md"
                    >
                        <X className="h-4 w-4 text-muted-k" />
                    </button>
                </header>
                <div className="p-6">
                    {loading && (
                        <div className="py-10 text-center text-muted-k">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                            <div className="mt-2 text-sm">Loading snapshot…</div>
                        </div>
                    )}
                    {!loading && error && (
                        <div className="bg-terra/10 border border-terra/30 rounded-lg p-5" data-testid="adviser-snapshot-error">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="h-5 w-5 text-terra flex-shrink-0 mt-0.5" />
                                <div>
                                    <div className="font-medium text-primary-k">
                                        {error?.error === "client_not_linked" ? "Client hasn't signed up yet" : "Could not load snapshot"}
                                    </div>
                                    <p className="text-sm text-muted-k mt-1 leading-relaxed">
                                        {typeof error === "string" ? error : error?.message || "Try again in a moment."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                    {!loading && snap && (
                        <div className="space-y-5">
                            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                                <div className="bg-surface-2 rounded-lg p-4">
                                    <div className="text-xs uppercase tracking-wider text-muted-k">Participant</div>
                                    <div className="mt-1 font-medium text-primary-k">{snap.household.participant_name || "—"}</div>
                                </div>
                                <div className="bg-surface-2 rounded-lg p-4">
                                    <div className="text-xs uppercase tracking-wider text-muted-k">Classification</div>
                                    <div className="mt-1 font-medium text-primary-k">{snap.household.classification ?? "—"}</div>
                                </div>
                                <div className="bg-surface-2 rounded-lg p-4">
                                    <div className="text-xs uppercase tracking-wider text-muted-k">Provider</div>
                                    <div className="mt-1 font-medium text-primary-k">{snap.household.provider_name || "—"}</div>
                                </div>
                                <div className="bg-surface-2 rounded-lg p-4">
                                    <div className="text-xs uppercase tracking-wider text-muted-k">Status</div>
                                    <div className="mt-1 font-medium text-primary-k capitalize">{snap.client.status}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-3 text-center">
                                {[
                                    { label: "Statements", value: snap.metrics.statements_count },
                                    { label: "Line items", value: snap.metrics.line_items_total },
                                    { label: "Anomalies", value: snap.metrics.anomalies_total },
                                    { label: "Spent (AUD)", value: `$${(snap.metrics.spent_total_aud || 0).toLocaleString()}` },
                                ].map((m) => (
                                    <div key={m.label} className="bg-primary-k text-white rounded-lg p-3">
                                        <div className="text-[10px] uppercase tracking-wider text-white/70">{m.label}</div>
                                        <div className="font-heading text-xl tabular-nums mt-1">{m.value}</div>
                                    </div>
                                ))}
                            </div>

                            {snap.recent_statements?.length > 0 && (
                                <div>
                                    <div className="text-xs uppercase tracking-wider text-muted-k">Recent statements</div>
                                    <div className="mt-2 bg-surface-2 rounded-lg overflow-hidden border border-kindred">
                                        <table className="w-full text-sm" data-testid="adviser-snapshot-statements">
                                            <thead className="text-muted-k">
                                                <tr>
                                                    <th className="text-left px-4 py-2 font-medium">Period</th>
                                                    <th className="text-left px-4 py-2 font-medium">Uploaded</th>
                                                    <th className="text-right px-4 py-2 font-medium">Anomalies</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {snap.recent_statements.map((s) => (
                                                    <tr key={s.id} className="border-t border-kindred">
                                                        <td className="px-4 py-2 text-primary-k">{s.period || "—"}</td>
                                                        <td className="px-4 py-2 text-muted-k">{(s.uploaded_at || "").split("T")[0]}</td>
                                                        <td className="px-4 py-2 text-right tabular-nums">{s.anomalies}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="border-t border-kindred pt-5 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-muted-k max-w-md leading-relaxed">
                                    Read-only · You're viewing this client's data under your Adviser subscription. Treat as confidential.
                                </p>
                                <button
                                    type="button"
                                    onClick={onDownloadPdf}
                                    disabled={downloading}
                                    data-testid="adviser-download-pdf-modal"
                                    className="inline-flex items-center gap-2 bg-gold text-primary-k rounded-full px-5 py-2.5 text-sm font-semibold hover:brightness-95 disabled:opacity-60"
                                >
                                    {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                                    {downloading ? "Generating…" : "Download review pack PDF"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function AdviserPortal() {
    const { user, loading: authLoading } = useAuth();
    const [summary, setSummary] = useState(null);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ client_name: "", client_email: "", notes: "" });
    const [openClient, setOpenClient] = useState(null);
    const [downloadingPdfFor, setDownloadingPdfFor] = useState(null);

    const refresh = async () => {
        try {
            setLoading(true);
            const [{ data: s }, { data: c }] = await Promise.all([
                api.get("/adviser/summary"),
                api.get("/adviser/clients"),
            ]);
            setSummary(s);
            setClients(c || []);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not load Adviser portal."));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) refresh();
    }, [user]);

    if (authLoading) return <div className="min-h-screen flex items-center justify-center text-muted-k">Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (user.plan !== "adviser") {
        return (
            <div className="min-h-screen bg-kindred px-6 py-16">
                <div className="mx-auto max-w-2xl bg-surface border border-kindred rounded-2xl p-10 text-center" data-testid="adviser-locked">
                    <Briefcase className="h-10 w-10 text-gold mx-auto" />
                    <h1 className="font-heading text-3xl text-primary-k mt-4 tracking-tight">The Adviser portal is for financial advisers</h1>
                    <p className="text-sm text-muted-k mt-3 max-w-md mx-auto leading-relaxed">
                        Manage up to 25 clients, run lifetime-cap forecasts, export review packs and more. Start the 7-day free trial — no card needed.
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-3">
                        <Link
                            to="/signup?plan=adviser"
                            data-testid="adviser-upgrade-cta"
                            className="bg-gold text-primary-k font-semibold rounded-full px-5 py-2.5 text-sm hover:brightness-95"
                        >
                            Start free trial
                        </Link>
                        <Link to="/pricing" className="text-sm text-primary-k underline">See pricing</Link>
                    </div>
                </div>
            </div>
        );
    }

    const addClient = async (e) => {
        e.preventDefault();
        if (!form.client_name.trim() || !form.client_email.trim()) {
            toast.error("Client name and email are required.");
            return;
        }
        setAdding(true);
        try {
            const { data } = await api.post("/adviser/clients", form);
            setClients((c) => [data, ...c]);
            setForm({ client_name: "", client_email: "", notes: "" });
            setShowAdd(false);
            toast.success(`Added ${data.client_name}`);
            refresh();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not add client."));
        } finally {
            setAdding(false);
        }
    };

    const removeClient = async (cid, name) => {
        if (!window.confirm(`Remove ${name} from your roster? Their household data is not affected.`)) return;
        try {
            await api.delete(`/adviser/clients/${cid}`);
            setClients((cs) => cs.filter((c) => c.id !== cid));
            toast.success("Client removed");
            refresh();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not remove client."));
        }
    };

    const downloadPdf = async (client) => {
        setDownloadingPdfFor(client.id);
        try {
            const res = await api.get(`/adviser/clients/${client.id}/review-pack.pdf`, { responseType: "blob" });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `wayly-review-pack-${client.client_name.replace(/\s+/g, "_")}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            toast.success(`Review pack downloaded for ${client.client_name}`);
        } catch (err) {
            const detail = err?.response?.data;
            // Axios with responseType:'blob' gives a Blob for error bodies too — try to parse it.
            let parsed = detail;
            if (detail instanceof Blob) {
                try {
                    const txt = await detail.text();
                    parsed = JSON.parse(txt);
                } catch (_e) { /* leave parsed as-is */ }
            }
            const msg = parsed?.detail?.message || parsed?.message || "Client hasn't signed up yet or hasn't finished onboarding.";
            toast.error(msg);
        } finally {
            setDownloadingPdfFor(null);
        }
    };

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead title="Adviser portal — Wayly" description="Manage your aged-care clients in one place." canonical="/adviser" noindex />
            <header className="border-b border-kindred bg-surface">
                <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-primary-k" />
                        <span className="font-heading text-lg text-primary-k">Wayly · Adviser</span>
                    </Link>
                    <div className="text-xs text-muted-k">
                        Signed in as <span className="text-primary-k font-medium">{user.email}</span>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-6 py-10">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <span className="overline">Adviser portal</span>
                        <h1 className="font-heading text-3xl sm:text-4xl text-primary-k mt-2 tracking-tight">Your clients</h1>
                        <p className="text-sm text-muted-k mt-2 max-w-xl leading-relaxed">
                            One-click read-only access to every client who's signed up via your invite — snapshot view + downloadable PDF review pack.
                        </p>
                    </div>
                    <button
                        type="button"
                        data-testid="adviser-add-client-btn"
                        onClick={() => setShowAdd((s) => !s)}
                        className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2.5 text-sm font-medium hover:bg-[#16294a]"
                    >
                        <UserPlus className="h-4 w-4" /> Add client
                    </button>
                </div>

                {/* Summary cards */}
                <section className="mt-8 grid sm:grid-cols-3 gap-4" data-testid="adviser-summary">
                    <div className="bg-surface border border-kindred rounded-xl p-5">
                        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-k">
                            <span>Active</span><Users className="h-4 w-4" />
                        </div>
                        <div className="mt-2 font-heading text-3xl text-primary-k tabular-nums">
                            {summary?.clients_active ?? "—"}
                        </div>
                    </div>
                    <div className="bg-surface border border-kindred rounded-xl p-5">
                        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-k">
                            <span>Invited</span><UserPlus className="h-4 w-4" />
                        </div>
                        <div className="mt-2 font-heading text-3xl text-primary-k tabular-nums">
                            {summary?.clients_invited ?? "—"}
                        </div>
                    </div>
                    <div className="bg-surface border border-kindred rounded-xl p-5">
                        <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-k">
                            <span>Seats remaining</span><ShieldCheck className="h-4 w-4" />
                        </div>
                        <div className="mt-2 font-heading text-3xl text-primary-k tabular-nums">
                            {summary?.seats_remaining ?? "—"} <span className="text-sm text-muted-k">/ {summary?.max_clients ?? "—"}</span>
                        </div>
                    </div>
                </section>

                {/* Add form */}
                {showAdd && (
                    <form onSubmit={addClient} className="mt-6 bg-surface border border-kindred rounded-xl p-5" data-testid="adviser-add-form">
                        <div className="grid sm:grid-cols-3 gap-3">
                            <label className="block">
                                <span className="text-xs text-muted-k">Client name</span>
                                <input
                                    value={form.client_name}
                                    onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                                    data-testid="adviser-form-name"
                                    required
                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs text-muted-k">Email</span>
                                <input
                                    type="email"
                                    value={form.client_email}
                                    onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                                    data-testid="adviser-form-email"
                                    required
                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs text-muted-k">Notes (optional)</span>
                                <input
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                    data-testid="adviser-form-notes"
                                    placeholder="Class 4 · BlueBerry Care"
                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                />
                            </label>
                        </div>
                        <div className="mt-4 flex gap-3">
                            <button
                                type="submit"
                                disabled={adding}
                                data-testid="adviser-form-submit"
                                className="bg-primary-k text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-[#16294a] inline-flex items-center gap-2 disabled:opacity-60"
                            >
                                {adding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                {adding ? "Adding…" : "Add to roster"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowAdd(false)}
                                className="text-sm text-muted-k hover:text-primary-k"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                )}

                {/* Client list */}
                <section className="mt-8">
                    {loading ? (
                        <div className="bg-surface border border-kindred rounded-xl p-10 text-center text-muted-k">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                            <div className="mt-2 text-sm">Loading clients…</div>
                        </div>
                    ) : clients.length === 0 ? (
                        <div className="bg-surface border border-kindred rounded-xl p-10 text-center" data-testid="adviser-empty">
                            <Users className="h-8 w-8 text-muted-k mx-auto" />
                            <h2 className="mt-3 font-heading text-xl text-primary-k">No clients yet</h2>
                            <p className="mt-2 text-sm text-muted-k">Add your first client above — invite them by email and we'll link their household automatically when they sign up.</p>
                        </div>
                    ) : (
                        <div className="bg-surface border border-kindred rounded-xl overflow-hidden" data-testid="adviser-client-list">
                            <table className="w-full text-sm">
                                <thead className="bg-surface-2 text-muted-k">
                                    <tr>
                                        <th className="text-left px-5 py-3 font-medium">Client</th>
                                        <th className="text-left px-4 py-3 font-medium">Email</th>
                                        <th className="text-left px-4 py-3 font-medium">Status</th>
                                        <th className="text-left px-4 py-3 font-medium">Linked</th>
                                        <th className="text-right px-5 py-3 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clients.map((c) => {
                                        const linked = !!c.linked_household_id;
                                        return (
                                            <tr
                                                key={c.id}
                                                data-testid={`adviser-client-row-${c.id}`}
                                                className="border-t border-kindred hover:bg-surface-2/40"
                                            >
                                                <td className="px-5 py-3 text-primary-k font-medium">{c.client_name}</td>
                                                <td className="px-4 py-3 text-muted-k">{c.client_email}</td>
                                                <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                                                <td className="px-4 py-3">
                                                    {linked ? (
                                                        <span data-testid={`adviser-linked-${c.id}`} className="inline-flex items-center gap-1 text-xs text-sage">
                                                            <Link2 className="h-3.5 w-3.5" /> Household linked
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-k">—</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-3 text-right whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenClient(c)}
                                                        disabled={!linked}
                                                        data-testid={`adviser-client-snapshot-${c.id}`}
                                                        className={`inline-flex items-center gap-1 text-xs rounded-md px-2.5 py-1.5 mr-1.5 ${
                                                            linked
                                                                ? "bg-primary-k text-white hover:bg-[#16294a]"
                                                                : "bg-surface-2 text-muted-k cursor-not-allowed"
                                                        }`}
                                                        title={linked ? "Open snapshot" : "Client hasn't signed up yet"}
                                                    >
                                                        <Eye className="h-3.5 w-3.5" /> Snapshot
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => downloadPdf(c)}
                                                        disabled={!linked || downloadingPdfFor === c.id}
                                                        data-testid={`adviser-client-pdf-${c.id}`}
                                                        className={`inline-flex items-center gap-1 text-xs rounded-md px-2.5 py-1.5 mr-2 ${
                                                            linked
                                                                ? "bg-gold text-primary-k hover:brightness-95"
                                                                : "bg-surface-2 text-muted-k cursor-not-allowed"
                                                        }`}
                                                        title={linked ? "Download review pack PDF" : "Client hasn't signed up yet"}
                                                    >
                                                        {downloadingPdfFor === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                                                        Review pack
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeClient(c.id, c.client_name)}
                                                        data-testid={`adviser-client-remove-${c.id}`}
                                                        className="inline-flex items-center gap-1 text-xs text-terra hover:underline"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" /> Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* Coming soon */}
                <section className="mt-10 bg-primary-k text-white rounded-2xl p-7" data-testid="adviser-roadmap">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h3 className="font-heading text-xl tracking-tight">Coming next on the Adviser plan</h3>
                            <ul className="mt-3 space-y-1.5 text-sm text-white/85">
                                <li>· Lifetime-cap forecast charts inside the snapshot view</li>
                                <li>· Multi-statement diff to spot rate-creep across periods</li>
                                <li>· Explicit consent toggle (today: invitation = consent)</li>
                                <li>· Recurring billing automation via Stripe</li>
                            </ul>
                        </div>
                        <Link to="/contact?intent=demo" className="inline-flex items-center gap-2 bg-gold text-primary-k rounded-full px-5 py-2.5 text-sm font-medium hover:brightness-95">
                            Share feedback <ArrowUpRight className="h-4 w-4" />
                        </Link>
                    </div>
                </section>
            </main>

            {openClient && (
                <SnapshotModal
                    client={openClient}
                    onClose={() => setOpenClient(null)}
                    onDownloadPdf={() => downloadPdf(openClient)}
                    downloading={downloadingPdfFor === openClient.id}
                />
            )}
        </div>
    );
}
