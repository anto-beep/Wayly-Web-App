/**
 * LCA-1 v1 · Notification preferences.
 *
 * Route: /settings/notifications
 *
 * Lets caregivers pick:
 *  - Digest frequency (immediate | weekly_digest | monthly_digest | off)
 *  - Channels (in-app banner, in-app notification, email)
 *  - Topic subscriptions (per category)
 *  - Targeted alerts on/off
 *
 * Backed by /api/lca1/preferences.
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { Bell, Mail, Radio, ChevronLeft, Check } from "lucide-react";

const CATEGORIES = [
    { key: "classification", label: "Classification & levels" },
    { key: "contribution", label: "Contributions & pension changes" },
    { key: "budget_cap", label: "Budget caps & lifetime cap" },
    { key: "care_type_definition", label: "Care type definitions" },
    { key: "provider_pricing", label: "Provider pricing rules" },
    { key: "at_hm", label: "At-Home program" },
    { key: "chsp", label: "CHSP" },
    { key: "restorative_care", label: "Restorative care" },
    { key: "end_of_life", label: "End-of-life care" },
    { key: "program_manual_change", label: "Program manual changes" },
    { key: "quarterly_indexation", label: "Quarterly indexation" },
    { key: "other", label: "Other legislative updates" },
];

const FREQ_OPTIONS = [
    { value: "immediate", label: "Immediately", detail: "As soon as an update affects your household." },
    { value: "weekly_digest", label: "Weekly digest", detail: "One summary email each Monday." },
    { value: "monthly_digest", label: "Monthly digest", detail: "One roundup on the first Monday of each month." },
    { value: "off", label: "Off", detail: "Never send me digest emails." },
];

export default function NotificationSettings() {
    const [prefs, setPrefs] = useState(null);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        api.get("/lca1/preferences")
            .then((r) => setPrefs(r.data))
            .catch((e) => setError(e?.response?.data?.detail || e?.message || "Failed to load preferences"));
    }, []);

    async function save(patch) {
        setSaving(true); setError(null);
        try {
            const r = await api.patch("/lca1/preferences", patch);
            setPrefs(r.data);
            setSavedAt(new Date());
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Save failed");
        }
        setSaving(false);
    }

    function toggleTopic(key) {
        const cur = new Set(prefs.topic_subscriptions || []);
        if (cur.has(key)) cur.delete(key); else cur.add(key);
        save({ topic_subscriptions: Array.from(cur) });
    }

    function toggleChannel(key) {
        const ch = { ...(prefs.channels || {}), [key]: !prefs.channels?.[key] };
        save({ channels: ch });
    }

    if (error) {
        return <div className="max-w-2xl mx-auto p-8 text-center" data-testid="notif-settings-error"><p className="text-sm text-red-600">{error}</p></div>;
    }
    if (!prefs) return <div className="max-w-3xl mx-auto p-6"><Skeleton className="h-40" /></div>;

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-6" data-testid="notif-settings-page">
            <Link to="/app/me" data-testid="notif-settings-back" className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4" /> Back to profile
            </Link>
            <div>
                <h1 className="text-2xl font-heading text-primary-k">Notification preferences</h1>
                <p className="text-sm text-primary-k/60 mt-1">Choose how Wayly reaches you about aged care changes and legislative updates.</p>
                {savedAt && <p className="text-xs text-green-700 mt-1 inline-flex items-center gap-1" data-testid="notif-settings-saved-msg"><Check className="w-3 h-3" /> Saved</p>}
            </div>

            {/* Frequency */}
            <section className="rounded-2xl border border-primary-k/10 bg-white p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Radio className="w-5 h-5 text-primary-k" aria-hidden />
                    <h2 className="text-base font-semibold text-primary-k">Digest frequency</h2>
                </div>
                <div className="space-y-2">
                    {FREQ_OPTIONS.map((f) => (
                        <label key={f.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${prefs.digest_frequency === f.value ? "border-primary-k bg-primary-k/[0.03]" : "border-primary-k/10 hover:border-primary-k/30"}`}>
                            <input
                                type="radio"
                                name="freq"
                                value={f.value}
                                checked={prefs.digest_frequency === f.value}
                                onChange={() => save({ digest_frequency: f.value })}
                                disabled={saving}
                                data-testid={`notif-freq-${f.value}`}
                                className="mt-1"
                            />
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-primary-k">{f.label}</div>
                                <div className="text-xs text-primary-k/60">{f.detail}</div>
                            </div>
                        </label>
                    ))}
                </div>
            </section>

            {/* Channels */}
            <section className="rounded-2xl border border-primary-k/10 bg-white p-5">
                <div className="flex items-center gap-2 mb-3">
                    <Bell className="w-5 h-5 text-primary-k" aria-hidden />
                    <h2 className="text-base font-semibold text-primary-k">Channels</h2>
                </div>
                <ul className="space-y-2">
                    {[
                        { key: "in_app_banner", label: "In-app banner", desc: "Highlight the alert on your dashboard." },
                        { key: "in_app_notification", label: "Alerts bell", desc: "Show in the bell dropdown in the top nav." },
                        { key: "email", label: "Email", desc: "Send digest and immediate updates to your account email." },
                    ].map((c) => (
                        <li key={c.key} className="flex items-center justify-between p-3 rounded-lg border border-primary-k/10">
                            <div>
                                <div className="text-sm font-medium text-primary-k inline-flex items-center gap-2">{c.key === "email" && <Mail className="w-3.5 h-3.5" />} {c.label}</div>
                                <div className="text-xs text-primary-k/60 mt-0.5">{c.desc}</div>
                            </div>
                            <button
                                data-testid={`notif-channel-${c.key}`}
                                onClick={() => toggleChannel(c.key)}
                                disabled={saving}
                                aria-pressed={!!prefs.channels?.[c.key]}
                                className={`px-3 py-1 rounded-full text-xs font-medium ${prefs.channels?.[c.key] ? "bg-primary-k text-white" : "border border-primary-k/20 text-primary-k"}`}
                            >
                                {prefs.channels?.[c.key] ? "On" : "Off"}
                            </button>
                        </li>
                    ))}
                </ul>
            </section>

            {/* Topics */}
            <section className="rounded-2xl border border-primary-k/10 bg-white p-5">
                <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-base font-semibold text-primary-k">Topics to follow</h2>
                </div>
                <p className="text-xs text-primary-k/60 mb-3">You&apos;ll always get universal alerts and any alert affecting one of your participants. Subscribing to topics adds context-aware updates even when they don&apos;t match your profile signals.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CATEGORIES.map((c) => {
                        const on = (prefs.topic_subscriptions || []).includes(c.key);
                        return (
                            <button
                                key={c.key}
                                data-testid={`notif-topic-${c.key}`}
                                onClick={() => toggleTopic(c.key)}
                                disabled={saving}
                                aria-pressed={on}
                                className={`text-left p-3 rounded-lg border text-sm transition ${on ? "border-primary-k bg-primary-k/[0.05] text-primary-k" : "border-primary-k/10 text-primary-k/70 hover:border-primary-k/30"}`}
                            >
                                <span className="font-medium">{c.label}</span>
                                <span className="ml-auto text-xs float-right">{on ? "✓" : "+"}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Targeted alerts (ADM gated on backend) */}
            <section className="rounded-2xl border border-primary-k/10 bg-white p-5 flex items-center justify-between">
                <div>
                    <h2 className="text-base font-semibold text-primary-k">Targeted alerts</h2>
                    <p className="text-xs text-primary-k/60 mt-1">Also send me alerts about changes that match my participants&apos; profile (classification, provider, pension).</p>
                </div>
                <button
                    data-testid="notif-targeted-toggle"
                    onClick={() => save({ targeted_alerts_enabled: !prefs.targeted_alerts_enabled })}
                    disabled={saving}
                    aria-pressed={!!prefs.targeted_alerts_enabled}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${prefs.targeted_alerts_enabled ? "bg-primary-k text-white" : "border border-primary-k/20 text-primary-k"}`}
                >
                    {prefs.targeted_alerts_enabled ? "On" : "Off"}
                </button>
            </section>
        </div>
    );
}
