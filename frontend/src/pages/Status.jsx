import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, RefreshCw, Clock, Database, Mail, Cpu, CreditCard, FileText } from "lucide-react";
import { api } from "@/lib/api";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";

const COMPONENT_META = {
    mongo: { icon: Database, label: "Database" },
    llm: { icon: Cpu, label: "AI / LLM" },
    email: { icon: Mail, label: "Email delivery" },
    billing: { icon: CreditCard, label: "Billing" },
};

const STATUS_BADGE = {
    ok: { color: "bg-sage/15 text-sage border-sage/40", Icon: CheckCircle2, label: "All systems operational" },
    degraded: { color: "bg-gold/15 text-gold-700 border-gold/40", Icon: AlertTriangle, label: "Degraded performance" },
    down: { color: "bg-terracotta/15 text-terracotta border-terracotta/40", Icon: XCircle, label: "Service disruption" },
};

const COMPONENT_BADGE = {
    ok: { color: "text-sage", Icon: CheckCircle2, label: "Operational" },
    down: { color: "text-terracotta", Icon: XCircle, label: "Down" },
    not_configured: { color: "text-muted-k", Icon: AlertTriangle, label: "Not configured" },
};

export default function Status() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastFetch, setLastFetch] = useState(null);

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/status");
            setData(data);
            setLastFetch(new Date());
            setError(null);
        } catch (err) {
            setError(err?.message || "Could not fetch status");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
        const id = setInterval(fetchStatus, 60_000);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const overall = data?.status || (error ? "down" : "ok");
    const overallMeta = STATUS_BADGE[overall] || STATUS_BADGE.ok;

    return (
        <div className="bg-kindred min-h-screen flex flex-col">
            <MarketingHeader />
            <main className="flex-1">
                <div className="mx-auto max-w-4xl px-4 md:px-6 py-10 md:py-16">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <span className="overline">Service status</span>
                            <h1 className="font-heading text-4xl md:text-5xl mt-2 tracking-tight text-primary-k">
                                Is Wayly working?
                            </h1>
                            <p className="text-muted-k mt-2 max-w-xl">
                                Real-time view of every Wayly system. Auto-refreshes every minute.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={fetchStatus}
                            disabled={loading}
                            data-testid="status-refresh"
                            className="inline-flex items-center gap-1.5 rounded-md border border-kindred bg-surface px-3 py-1.5 text-sm text-primary-k hover:bg-surface-2 disabled:opacity-60"
                        >
                            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Refresh
                        </button>
                    </div>

                    {/* Overall pill */}
                    <div className={`mt-6 rounded-xl border ${overallMeta.color} p-5 flex items-start gap-3`} data-testid="status-overall">
                        <overallMeta.Icon className="h-5 w-5 mt-0.5" />
                        <div>
                            <div className="font-heading text-xl">{overallMeta.label}</div>
                            <p className="text-sm mt-1 opacity-80">
                                {overall === "ok" && "Everything's running smoothly."}
                                {overall === "degraded" && "Some non-critical services are running below par. Core features still work."}
                                {overall === "down" && "We're seeing a major incident. We're investigating."}
                            </p>
                            {data && (
                                <p className="text-xs mt-2 text-muted-k">
                                    Last checked {new Date(data.checked_at).toLocaleString("en-AU")}
                                    {data.uptime_human && <> · API uptime <strong>{data.uptime_human}</strong></>}
                                </p>
                            )}
                        </div>
                    </div>

                    {error && (
                        <div className="mt-4 rounded-lg border border-terracotta/40 bg-terracotta/10 text-terracotta p-3 text-sm" data-testid="status-error">
                            {error}
                        </div>
                    )}

                    {/* Component grid */}
                    {data?.components && (
                        <div className="mt-8 grid sm:grid-cols-2 gap-3" data-testid="status-components">
                            {Object.entries(data.components).map(([key, val]) => {
                                const meta = COMPONENT_META[key] || { icon: CheckCircle2, label: key };
                                const badge = COMPONENT_BADGE[val] || COMPONENT_BADGE.ok;
                                return (
                                    <div key={key} className="rounded-xl border border-kindred bg-surface p-4 flex items-start gap-3" data-testid={`status-component-${key}`}>
                                        <meta.icon className="h-5 w-5 text-muted-k mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-primary-k">{meta.label}</div>
                                            <div className={`text-xs mt-0.5 inline-flex items-center gap-1 ${badge.color}`}>
                                                <badge.Icon className="h-3 w-3" /> {badge.label}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pipeline / activity */}
                    {data && (
                        <div className="mt-8 rounded-xl border border-kindred bg-surface p-5">
                            <div className="flex items-center gap-2 text-muted-k">
                                <FileText className="h-4 w-4" />
                                <span className="overline">Decoding pipeline</span>
                            </div>
                            <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
                                <Metric
                                    label="Last statement decoded"
                                    value={data.last_ingestion_at ? new Date(data.last_ingestion_at).toLocaleString("en-AU") : "No statements yet"}
                                    sub={data.last_ingestion_method ? `via ${data.last_ingestion_method.replace(/_/g, " ")}` : null}
                                />
                                <Metric
                                    label="Last 24 hours"
                                    value={`${data.ingestion_24h} statement${data.ingestion_24h === 1 ? "" : "s"}`}
                                    sub="across all households"
                                />
                            </div>
                        </div>
                    )}

                    {/* Versions */}
                    {data?.versions && (
                        <div className="mt-8 rounded-xl border border-kindred bg-surface p-5" data-testid="status-versions">
                            <div className="flex items-center gap-2 text-muted-k">
                                <Cpu className="h-4 w-4" />
                                <span className="overline">Current versions</span>
                            </div>
                            <dl className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                                <Row label="Build" value={data.versions.build} />
                                <Row label="Anomaly engine" value={data.versions.anomaly_engine} />
                                <Row label="Document extract" value={data.versions.document_extract} />
                                <Row label="Statement extractor" value={data.versions.claude_extractor} />
                                <Row label="Anomaly auditor" value={data.versions.claude_auditor} />
                                <Row label="Help chat" value={data.versions.claude_chat} />
                            </dl>
                        </div>
                    )}

                    {/* Aggregate scale */}
                    {data?.totals && (data.totals.statements > 0 || data.totals.households > 0) && (
                        <div className="mt-8 grid sm:grid-cols-2 gap-3" data-testid="status-totals">
                            <Metric
                                label="Statements decoded all-time"
                                value={`${data.totals.statements.toLocaleString("en-AU")}+`}
                                sub="rounded for privacy"
                            />
                            <Metric
                                label="Households served"
                                value={`${data.totals.households.toLocaleString("en-AU")}+`}
                                sub="rounded for privacy"
                            />
                        </div>
                    )}

                    <p className="text-xs text-muted-k mt-10 text-center inline-flex items-center justify-center gap-1.5 w-full">
                        <Clock className="h-3 w-3" />
                        {lastFetch ? `Auto-refreshes every minute · last fetched ${lastFetch.toLocaleTimeString("en-AU")}` : "Connecting…"}
                        <span className="mx-2">·</span>
                        <Link to="/contact" className="underline hover:text-primary-k">Report an issue</Link>
                    </p>
                </div>
            </main>
            <Footer />
        </div>
    );
}

function Metric({ label, value, sub }) {
    return (
        <div>
            <div className="text-xs uppercase tracking-wider text-muted-k">{label}</div>
            <div className="font-heading text-lg text-primary-k mt-0.5">{value}</div>
            {sub && <div className="text-xs text-muted-k mt-0.5">{sub}</div>}
        </div>
    );
}

function Row({ label, value }) {
    return (
        <>
            <dt className="text-muted-k">{label}</dt>
            <dd className="text-primary-k font-mono text-xs sm:text-sm break-all">{value}</dd>
        </>
    );
}
