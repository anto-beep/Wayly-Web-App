import React, { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Briefcase, Users, UserPlus, Trash2, Loader2, ShieldCheck, ArrowUpRight } from "lucide-react";

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

export default function AdviserPortal() {
    const { user, loading: authLoading } = useAuth();
    const [summary, setSummary] = useState(null);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ client_name: "", client_email: "", notes: "" });

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
                            A read-only workspace today, with full client review-pack export coming next. Add clients by email — when they sign up at Wayly we'll auto-link them.
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
                                        <th className="text-left px-4 py-3 font-medium">Notes</th>
                                        <th className="text-right px-5 py-3 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clients.map((c) => (
                                        <tr
                                            key={c.id}
                                            data-testid={`adviser-client-row-${c.id}`}
                                            className="border-t border-kindred hover:bg-surface-2/40"
                                        >
                                            <td className="px-5 py-3 text-primary-k font-medium">{c.client_name}</td>
                                            <td className="px-4 py-3 text-muted-k">{c.client_email}</td>
                                            <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                                            <td className="px-4 py-3 text-muted-k max-w-xs truncate">{c.notes || "—"}</td>
                                            <td className="px-5 py-3 text-right">
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
                                    ))}
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
                                <li>· Per-client lifetime-cap forecast (powered by your existing Wayly engine)</li>
                                <li>· One-click review pack PDF export</li>
                                <li>· Read-only access to a client's statements + audit log (with consent)</li>
                                <li>· Recurring billing automation via Stripe</li>
                            </ul>
                        </div>
                        <Link to="/contact?intent=demo" className="inline-flex items-center gap-2 bg-gold text-primary-k rounded-full px-5 py-2.5 text-sm font-medium hover:brightness-95">
                            Share feedback <ArrowUpRight className="h-4 w-4" />
                        </Link>
                    </div>
                </section>
            </main>
        </div>
    );
}
