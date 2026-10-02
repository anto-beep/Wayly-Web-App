/**
 * AdviserAlerts, multi-household global alert dashboard.
 * Aggregates statement anomalies + active hospital admissions + open care-plan
 * amendments across every linked client.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Bell, ArrowLeft, Briefcase, AlertOctagon, Hospital, FilePenLine, Filter } from "lucide-react";

const TYPE_META = {
    anomaly: { label: "Anomaly", Icon: AlertOctagon, color: "text-terracotta" },
    hospital: { label: "Hospital", Icon: Hospital, color: "text-gold" },
    amendment: { label: "Amendment", Icon: FilePenLine, color: "text-primary-k" },
};

const SEVERITY_META = {
    alert: "bg-terracotta/15 text-terracotta",
    warning: "bg-gold/15 text-gold",
    info: "bg-primary-k/10 text-primary-k",
};

export default function AdviserAlerts() {
    const { user, loading: authLoading } = useAuth();
    const [data, setData] = useState({ items: [], client_count: 0 });
    const [loading, setLoading] = useState(true);
    const [type, setType] = useState("");
    const [severity, setSeverity] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (type) params.set("type", type);
            if (severity) params.set("severity", severity);
            const { data: d } = await api.get(`/adviser/alerts/global?${params.toString()}`);
            setData(d);
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not load alerts"));
        } finally { setLoading(false); }
    }, [type, severity]);

    useEffect(() => { if (user?.plan === "adviser") load(); }, [user, load]);

    if (authLoading) return <div className="min-h-screen flex items-center justify-center text-muted-k">Loading…</div>;
    if (!user) return <Navigate to="/login" replace />;
    if (user.plan !== "adviser") return <Navigate to="/adviser" replace />;

    return (
        <div className="min-h-screen bg-kindred">
            <header className="border-b border-kindred bg-surface">
                <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
                    <Link to="/adviser" className="flex items-center gap-2 text-sm text-primary-k hover:underline">
                        <ArrowLeft className="h-4 w-4" /> Back to Clients
                    </Link>
                    <span className="font-heading text-lg text-primary-k flex items-center gap-2"><Briefcase className="h-5 w-5" /> Adviser</span>
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-6 py-10" data-testid="adviser-alerts-page">
                <div className="flex items-end justify-between gap-3 flex-wrap">
                    <div>
                        <span className="overline">Alerts</span>
                        <h1 className="font-heading text-3xl text-primary-k mt-2 tracking-tight flex items-center gap-2">
                            <Bell className="h-6 w-6 text-gold" /> Global alert dashboard
                        </h1>
                        <p className="text-sm text-muted-k mt-2 max-w-xl">
                            Live cross-household view of everything that needs attention across your {data.client_count} linked client{data.client_count === 1 ? "" : "s"}.
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap" data-testid="alert-filters">
                        <Filter className="h-4 w-4 text-muted-k" />
                        <select value={type} onChange={(e) => setType(e.target.value)} data-testid="alerts-type-filter" className="rounded-md border border-kindred px-3 py-1.5 text-sm">
                            <option value="">All types</option>
                            <option value="anomaly">Anomalies</option>
                            <option value="hospital">Hospital</option>
                            <option value="amendment">Amendments</option>
                        </select>
                        <select value={severity} onChange={(e) => setSeverity(e.target.value)} data-testid="alerts-severity-filter" className="rounded-md border border-kindred px-3 py-1.5 text-sm">
                            <option value="">All severities</option>
                            <option value="alert">Alert</option>
                            <option value="warning">Warning</option>
                            <option value="info">Info</option>
                        </select>
                    </div>
                </div>

                <section className="mt-8">
                    {loading && <div className="text-sm text-muted-k">Loading…</div>}
                    {!loading && data.items.length === 0 && (
                        <div className="bg-surface border border-dashed border-kindred rounded-2xl p-10 text-center" data-testid="alerts-empty">
                            <Bell className="h-8 w-8 text-muted-k mx-auto mb-2" />
                            <p className="text-sm text-muted-k">No alerts right now, everything's quiet across your roster.</p>
                        </div>
                    )}
                    <ul className="space-y-2">
                        {data.items.map((a, i) => {
                            const meta = TYPE_META[a.type] || TYPE_META.anomaly;
                            const Icon = meta.Icon;
                            return (
                                <li key={`${a.type}-${a.source_id}-${i}`} className="bg-surface border border-kindred rounded-xl p-4" data-testid={`alert-row-${a.type}-${a.source_id}`}>
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-0.5 ${meta.color}`}><Icon className="h-5 w-5" /></div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[10px] uppercase tracking-wider text-muted-k">{meta.label}</span>
                                                <span className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 ${SEVERITY_META[a.severity] || SEVERITY_META.info}`}>{a.severity}</span>
                                                {a.client_name && <span className="text-xs text-muted-k">· {a.client_name}</span>}
                                            </div>
                                            <div className="font-medium text-primary-k mt-1">{a.title}</div>
                                            {a.detail && <div className="text-sm text-muted-k mt-0.5 line-clamp-2">{a.detail}</div>}
                                            <div className="text-[11px] text-muted-k mt-1">{a.source_label} · {a.created_at ? new Date(a.created_at).toLocaleString() : ""}</div>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            </main>
        </div>
    );
}
