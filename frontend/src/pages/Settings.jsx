import React, { useEffect, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
    User, CreditCard, Users, Shield, Loader2, Check, X, Crown, Mail, ArrowUpRight, Trash2,
    Bell, Moon, Sun, Gauge, AlertTriangle, Mailbox, Send, Eye,
} from "lucide-react";

const TABS = [
    { id: "profile", label: "Profile", icon: User },
    { id: "billing", label: "Plan & Billing", icon: CreditCard },
    { id: "members", label: "Family members", icon: Users },
    { id: "digest", label: "Weekly digest", icon: Mailbox },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "appearance", label: "Appearance", icon: Moon },
    { id: "usage", label: "Usage", icon: Gauge },
    { id: "security", label: "Security", icon: Shield },
    { id: "danger", label: "Danger zone", icon: AlertTriangle },
];

function TabNav({ active }) {
    return (
        <nav className="flex flex-col gap-1" data-testid="settings-tabnav">
            {TABS.map((t) => (
                <Link
                    key={t.id}
                    to={`/settings/${t.id}`}
                    data-testid={`settings-tab-${t.id}`}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        active === t.id ? "bg-primary-k text-white" : "text-muted-k hover:bg-surface-2 hover:text-primary-k"
                    } ${t.id === "danger" ? "mt-4 pt-3 border-t border-kindred text-terracotta" : ""}`}
                >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                </Link>
            ))}
        </nav>
    );
}

/* --------------------------------- Profile -------------------------------- */
function ProfileTab() {
    const { user, setUser } = useAuth();
    const [name, setName] = useState(user?.name || "");
    const [saving, setSaving] = useState(false);
    const save = async () => {
        setSaving(true);
        try { setUser({ ...user, name }); toast.success("Saved"); } finally { setSaving(false); }
    };
    return (
        <div className="space-y-6" data-testid="settings-profile">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Your profile</h2>
                <p className="text-sm text-muted-k mt-1">How Kindred greets you across the app.</p>
            </div>
            <div className="space-y-4 max-w-md">
                <label className="block">
                    <span className="text-sm text-muted-k">Full name</span>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name-input" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                </label>
                <label className="block">
                    <span className="text-sm text-muted-k">Email</span>
                    <input type="email" value={user?.email || ""} disabled className="mt-1 w-full rounded-md border border-kindred bg-surface-2 px-3 py-2.5 text-muted-k" />
                </label>
                <label className="block">
                    <span className="text-sm text-muted-k">Role</span>
                    <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-surface-2 border border-kindred px-3 py-1.5 text-sm text-primary-k capitalize">{user?.role}</div>
                </label>
                <button onClick={save} disabled={saving || name === user?.name} data-testid="profile-save-btn" className="bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a] disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button>
            </div>
        </div>
    );
}

/* --------------------------------- Billing -------------------------------- */
const PLANS = { free: { name: "Free", price: "$0", period: "forever" }, solo: { name: "Solo", price: "$19", period: "/mo" }, family: { name: "Family", price: "$39", period: "/mo" } };

function BillingTab() {
    const { user, refreshUser } = useAuth();
    const [sub, setSub] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try { const { data } = await api.get("/billing/subscription"); setSub(data); }
        catch { setSub({ plan: user?.plan || "free", status: "none" }); }
        finally { setLoading(false); }
    }, [user?.plan]);
    useEffect(() => { load(); }, [load]);
    const startCheckout = async (plan) => {
        setBusy(true);
        try { const { data } = await api.post("/billing/checkout", { plan, origin_url: window.location.origin }); if (data?.url) { window.location.href = data.url; return; } }
        catch (err) { toast.error(err?.response?.data?.detail || "Could not start checkout"); }
        finally { setBusy(false); }
    };
    const changePlan = async (plan) => {
        setBusy(true);
        try { const { data } = await api.post("/billing/upgrade", { plan }); if (data?.ok) { toast.success(`Plan changed to ${PLANS[plan].name}`); await refreshUser(); await load(); } }
        catch (err) { toast.error(err?.response?.data?.detail || "Could not change plan"); }
        finally { setBusy(false); }
    };
    const cancel = async () => {
        if (!window.confirm("Cancel auto-renewal? Your plan stays active until the end of the current billing period.")) return;
        setBusy(true);
        try { await api.post("/billing/cancel"); toast.success("Auto-renewal cancelled"); await load(); }
        catch (err) { toast.error(err?.response?.data?.detail || "Could not cancel"); }
        finally { setBusy(false); }
    };
    const currentPlan = user?.plan || "free";
    const activeSub = sub && sub.status && sub.status !== "none";

    return (
        <div className="space-y-6" data-testid="settings-billing">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Plan & Billing</h2>
                <p className="text-sm text-muted-k mt-1">Upgrade, downgrade or cancel — all inside the app.</p>
            </div>
            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-k"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : (<>
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="current-plan-card">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                        <div>
                            <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-gold" /><span className="overline">Current plan</span></div>
                            <div className="mt-2 font-heading text-2xl text-primary-k">{PLANS[currentPlan]?.name} <span className="text-base font-sans text-muted-k">{PLANS[currentPlan]?.price}{PLANS[currentPlan]?.period}</span></div>
                            {activeSub && sub.trial_ends_at && sub.status === "trialing" && (<p className="text-sm text-muted-k mt-2">7-day trial ends {new Date(sub.trial_ends_at).toLocaleDateString()}.</p>)}
                            {activeSub && sub.current_period_end && (<p className="text-sm text-muted-k mt-1">{sub.cancel_at_period_end ? "Ends" : "Renews"} {new Date(sub.current_period_end).toLocaleDateString()}.</p>)}
                        </div>
                        {activeSub && !sub.cancel_at_period_end && (<button onClick={cancel} disabled={busy} data-testid="cancel-plan-btn" className="inline-flex items-center gap-2 text-sm text-terracotta hover:underline"><X className="h-3.5 w-3.5" /> Cancel auto-renewal</button>)}
                    </div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                    {["free", "solo", "family"].map((p) => {
                        const isCurrent = p === currentPlan;
                        return (
                            <div key={p} className={`rounded-2xl border p-5 ${isCurrent ? "border-primary-k ring-2 ring-primary-k/20 bg-surface" : "border-kindred bg-surface"}`} data-testid={`billing-plan-${p}`}>
                                <div className="flex items-baseline justify-between"><span className="font-heading text-xl text-primary-k">{PLANS[p].name}</span><span className="text-sm text-muted-k">{PLANS[p].price}{PLANS[p].period}</span></div>
                                {isCurrent ? (<div className="mt-4 inline-flex items-center gap-1 text-xs text-sage"><Check className="h-3.5 w-3.5" /> Current</div>) : p === "free" && activeSub ? (<button onClick={cancel} disabled={busy} data-testid={`billing-downgrade-${p}`} className="mt-4 w-full text-sm border border-kindred rounded-md py-2 text-primary-k hover:bg-surface-2 disabled:opacity-60">Downgrade (cancel)</button>) : activeSub ? (<button onClick={() => changePlan(p)} disabled={busy} data-testid={`billing-switch-${p}`} className="mt-4 w-full text-sm bg-primary-k text-white rounded-md py-2 hover:bg-[#16294a] disabled:opacity-60">Switch to {PLANS[p].name}</button>) : p === "free" ? null : (<button onClick={() => startCheckout(p)} disabled={busy} data-testid={`billing-start-${p}`} className="mt-4 w-full text-sm bg-primary-k text-white rounded-md py-2 hover:bg-[#16294a] disabled:opacity-60 inline-flex items-center justify-center gap-2">Start {PLANS[p].name} <ArrowUpRight className="h-3.5 w-3.5" /></button>)}
                            </div>
                        );
                    })}
                </div>
            </>)}
        </div>
    );
}

/* --------------------------------- Members -------------------------------- */
function MembersTab() {
    const { user } = useAuth();
    const [data, setData] = useState({ members: [], invites: [] });
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ email: "", role: "family_member", note: "" });
    const [sending, setSending] = useState(false);
    const load = useCallback(async () => { setLoading(true); try { const { data } = await api.get("/household/members"); setData(data); } finally { setLoading(false); } }, []);
    useEffect(() => { load(); }, [load]);
    const invite = async (e) => {
        e.preventDefault(); setSending(true);
        try { await api.post("/household/invite", form); toast.success(`Invitation sent to ${form.email}`); setForm({ email: "", role: "family_member", note: "" }); await load(); }
        catch (err) { const detail = err?.response?.data?.detail; toast.error(typeof detail === "string" ? detail : detail?.message || "Could not send invite"); }
        finally { setSending(false); }
    };
    const remove = async (uid) => { if (!window.confirm("Remove this member?")) return; try { await api.delete(`/household/members/${uid}`); toast.success("Member removed"); await load(); } catch (err) { toast.error(err?.response?.data?.detail || "Could not remove"); } };
    const onFamily = user?.plan === "family";
    return (
        <div className="space-y-6" data-testid="settings-members">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Family members</h2>
                <p className="text-sm text-muted-k mt-1">Up to 5 people per household (including you). Everyone sees the statements and audit log.</p>
            </div>
            {!onFamily ? (
                <div className="bg-surface border border-gold rounded-2xl p-6" data-testid="members-upgrade-gate">
                    <h3 className="font-heading text-xl text-primary-k">Inviting siblings is on Family plan</h3>
                    <p className="text-sm text-muted-k mt-2">Family plan adds 5 seats, role-based permissions, and the Sunday digest.</p>
                    <Link to="/settings/billing" className="mt-4 inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a]" data-testid="members-upgrade-cta">Upgrade to Family</Link>
                </div>
            ) : (<>
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="invite-card">
                    <h3 className="font-heading text-lg text-primary-k">Invite someone</h3>
                    <form onSubmit={invite} className="mt-4 grid sm:grid-cols-2 gap-3">
                        <label className="block sm:col-span-2"><span className="text-sm text-muted-k">Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required data-testid="invite-email-input" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" /></label>
                        <label className="block"><span className="text-sm text-muted-k">Role</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="invite-role-select" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"><option value="family_member">Family member (sibling / partner)</option><option value="advisor">Advisor / GP (read-only)</option></select></label>
                        <label className="block"><span className="text-sm text-muted-k">Optional note</span><input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Hey sis, looping you in…" data-testid="invite-note-input" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" /></label>
                        <div className="sm:col-span-2"><button type="submit" disabled={sending} data-testid="invite-submit-btn" className="inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a] disabled:opacity-60">{sending && <Loader2 className="h-4 w-4 animate-spin" />}<Mail className="h-4 w-4" /> Send invitation</button></div>
                    </form>
                </div>
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="members-list-card">
                    <h3 className="font-heading text-lg text-primary-k">Active members</h3>
                    {loading ? (<div className="mt-4 text-sm text-muted-k flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>) : (
                        <ul className="mt-4 space-y-2">
                            {data.members.map((m) => (<li key={m.user_id || m.email} className="flex items-center justify-between rounded-lg p-3 bg-surface-2" data-testid={`member-row-${m.email}`}><div><div className="text-sm font-medium text-primary-k">{m.name} <span className="text-xs text-muted-k capitalize ml-2">{m.role?.replace("_", " ")}</span></div><div className="text-xs text-muted-k">{m.email}</div></div>{m.role !== "primary" && (<button onClick={() => remove(m.user_id)} data-testid={`member-remove-${m.email}`} className="text-xs text-terracotta hover:underline inline-flex items-center gap-1"><Trash2 className="h-3 w-3" /> Remove</button>)}</li>))}
                        </ul>
                    )}
                    {data.invites?.length > 0 && (<><h4 className="font-medium text-primary-k mt-6 mb-2 text-sm">Pending invites</h4><ul className="space-y-2">{data.invites.map((i) => (<li key={i.token} className="flex items-center justify-between rounded-lg p-3 bg-gold/10 border border-gold/30 text-sm"><div><div className="font-medium text-primary-k">{i.email} <span className="text-xs text-muted-k capitalize ml-2">{i.role?.replace("_", " ")}</span></div><div className="text-xs text-muted-k">Expires {new Date(i.expires_at).toLocaleDateString()}</div></div><span className="text-xs text-muted-k">Pending</span></li>))}</ul></>)}
                </div>
            </>)}
        </div>
    );
}

/* --------------------------------- Digest --------------------------------- */
function DigestTab() {
    const { user } = useAuth();
    const [digest, setDigest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [history, setHistory] = useState([]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [{ data: d }, { data: h }] = await Promise.all([
                api.get("/digest/preview").catch(() => ({ data: null })),
                api.get("/digest/history").catch(() => ({ data: { items: [] } })),
            ]);
            setDigest(d);
            setHistory(h.items || []);
        } finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const sendNow = async () => {
        if (!window.confirm("Send the digest to all household members now?")) return;
        setSending(true);
        try {
            const { data } = await api.post("/digest/send");
            if (data.ok) toast.success(`Sent to ${data.recipients.length} people`);
            else toast.error(data.reason || "Not sent");
            await load();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            toast.error(typeof detail === "string" ? detail : detail?.message || "Could not send digest");
        } finally { setSending(false); }
    };

    const onFamily = user?.plan === "family";
    return (
        <div className="space-y-6" data-testid="settings-digest">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Weekly family digest</h2>
                <p className="text-sm text-muted-k mt-1 max-w-2xl">
                    A short, human email that lands every week with what <span className="font-medium text-primary-k">you</span> paid attention to. Siblings and advisors stay in the loop without ever opening the app — wellbeing check-ins, alerts, chat summary, thread highlights. All one scroll.
                </p>
            </div>

            {!onFamily && (
                <div className="bg-surface border border-gold rounded-2xl p-6">
                    <h3 className="font-heading text-xl text-primary-k">Sending digests is on Family plan</h3>
                    <p className="text-sm text-muted-k mt-2">You can preview what it looks like on any plan — sending requires Family (because it goes to up to 5 people).</p>
                    <Link to="/settings/billing" className="mt-4 inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a]">Upgrade to Family</Link>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-k"><Loader2 className="h-4 w-4 animate-spin" /> Building this week's preview…</div>
            ) : !digest ? (
                <div className="bg-surface border border-kindred rounded-2xl p-6 text-sm text-muted-k">Create a household first to preview the digest.</div>
            ) : (<>
                <div className="bg-surface border border-kindred rounded-2xl overflow-hidden" data-testid="digest-preview-card">
                    <div className="bg-primary-k text-white px-6 py-4">
                        <div className="font-heading text-xl">Kindred — the week at {digest.household_name}'s</div>
                        <div className="text-xs uppercase tracking-widest opacity-80 mt-1">{digest.week_label}</div>
                    </div>
                    <div className="p-6 space-y-5">
                        <section data-testid="digest-wellbeing">
                            <h3 className="font-heading text-lg text-primary-k">How {digest.household_name} has been</h3>
                            <p className="text-xs text-muted-k mt-1">The emotional weather first.</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {Object.entries(digest.wellbeing.counts).filter(([, c]) => c > 0).map(([m, c]) => (
                                    <span key={m} className={`text-xs font-semibold text-white rounded-full px-3 py-1 ${m === "good" ? "bg-sage" : m === "okay" ? "bg-gold !text-primary-k" : "bg-terracotta"}`} data-testid={`digest-mood-${m}`}>
                                        {c} × {m === "good" ? "Good days" : m === "okay" ? "OK days" : "Harder days"}
                                    </span>
                                ))}
                                {digest.wellbeing.total === 0 && <span className="text-sm text-muted-k">No check-ins this week.</span>}
                            </div>
                        </section>
                        <hr className="border-kindred" />
                        <section data-testid="digest-anomalies">
                            <h3 className="font-heading text-lg text-primary-k">Money & alerts</h3>
                            <p className="text-xs text-muted-k mt-1">What {digest.caregiver_first_name} paid attention to.</p>
                            <p className="mt-3 text-sm text-primary-k">
                                <strong>${digest.anomalies.new_spend.toLocaleString("en-AU", { minimumFractionDigits: 2 })}</strong> across {digest.anomalies.statements_uploaded} new statement{digest.anomalies.statements_uploaded !== 1 ? "s" : ""}.
                            </p>
                            {digest.anomalies.count === 0 ? (
                                <p className="mt-2 text-sm text-sage">✓ Nothing unusual to flag.</p>
                            ) : (
                                <ul className="mt-3 space-y-2">
                                    {digest.anomalies.top.map((a, i) => (
                                        <li key={i} className={`p-3 bg-surface-2 border-l-[3px] rounded ${a.severity === "alert" ? "border-terracotta" : a.severity === "warning" ? "border-gold" : "border-sage"}`}>
                                            <div className="text-sm font-medium text-primary-k">{a.title}</div>
                                            <div className="text-xs text-muted-k mt-0.5">{a.detail}</div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        {digest.family_thread_recent?.length > 0 && (<><hr className="border-kindred" /><section><h3 className="font-heading text-lg text-primary-k">Family thread</h3><ul className="mt-3 space-y-2">{digest.family_thread_recent.map((m, i) => (<li key={i} className="p-3 bg-surface-2 rounded"><div className="text-xs text-muted-k uppercase tracking-wider">{m.author}</div><div className="text-sm text-primary-k mt-0.5">{m.body}</div></li>))}</ul></section></>)}
                        {digest.chat_questions_asked > 0 && (<p className="text-xs text-muted-k italic">{digest.caregiver_first_name} asked Kindred <strong>{digest.chat_questions_asked}</strong> question{digest.chat_questions_asked !== 1 ? "s" : ""} this week.</p>)}
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button onClick={sendNow} disabled={!onFamily || sending} data-testid="digest-send-btn" className="inline-flex items-center gap-2 bg-gold text-primary-k rounded-md px-5 py-2.5 text-sm font-semibold hover:brightness-95 disabled:opacity-60">
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send this digest now
                    </button>
                    <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 border border-kindred rounded-md px-5 py-2.5 text-sm text-primary-k hover:bg-surface-2"><Eye className="h-4 w-4" /> Refresh preview</button>
                </div>

                {history.length > 0 && (
                    <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="digest-history">
                        <h3 className="font-heading text-lg text-primary-k">Recent sends</h3>
                        <ul className="mt-3 space-y-2 text-sm">
                            {history.map((h, i) => (
                                <li key={i} className="flex items-center justify-between border-b border-kindred py-2 last:border-0">
                                    <span className="text-primary-k">{new Date(h.sent_at).toLocaleString()}</span>
                                    <span className="text-xs text-muted-k">{h.recipients?.length || 0} recipient{(h.recipients?.length || 0) !== 1 ? "s" : ""}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </>)}
        </div>
    );
}

/* ----------------------------- Notifications ------------------------------ */
const NOTIF_LABELS = {
    anomaly_alerts: { label: "Anomaly alerts", desc: "When Kindred flags unusual charges on a new statement." },
    wellbeing_concerns: { label: "Wellbeing concerns", desc: "When the participant marks a hard day." },
    family_messages: { label: "Family & invites", desc: "Member joined, family thread replies." },
    weekly_digest: { label: "Weekly digest", desc: "Your Sunday summary email." },
    product_updates: { label: "Product updates", desc: "Monthly notes on what's new. Rare." },
};
function NotificationsTab() {
    const [prefs, setPrefs] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    useEffect(() => { (async () => { try { const { data } = await api.get("/notifications/prefs"); setPrefs(data.prefs); } finally { setLoading(false); } })(); }, []);
    const toggle = async (key) => {
        const next = { ...prefs, [key]: !prefs[key] };
        setPrefs(next); setSaving(true);
        try { await api.put("/notifications/prefs", { prefs: next }); } catch (err) { toast.error("Could not save"); }
        finally { setSaving(false); }
    };
    return (
        <div className="space-y-6" data-testid="settings-notifications">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Notifications</h2>
                <p className="text-sm text-muted-k mt-1">You decide what's worth an email and an in-app bell.</p>
            </div>
            {loading ? (<div className="text-sm text-muted-k"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</div>) : (
                <div className="bg-surface border border-kindred rounded-2xl divide-y divide-kindred">
                    {Object.entries(NOTIF_LABELS).map(([key, meta]) => (
                        <div key={key} className="flex items-start justify-between gap-4 p-5" data-testid={`notif-row-${key}`}>
                            <div>
                                <div className="text-sm font-medium text-primary-k">{meta.label}</div>
                                <p className="text-xs text-muted-k mt-0.5">{meta.desc}</p>
                            </div>
                            <button onClick={() => toggle(key)} disabled={saving} data-testid={`notif-toggle-${key}`} role="switch" aria-checked={!!prefs[key]} className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${prefs[key] ? "bg-primary-k" : "bg-muted-k/30"} disabled:opacity-50`}>
                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${prefs[key] ? "translate-x-5" : "translate-x-0.5"}`} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ------------------------------ Appearance -------------------------------- */
function AppearanceTab() {
    const [theme, setTheme] = useState(() => {
        if (typeof window === "undefined") return "light";
        return localStorage.getItem("kindred_theme") || "light";
    });
    useEffect(() => {
        const root = document.documentElement;
        if (theme === "dark") root.classList.add("theme-dark"); else root.classList.remove("theme-dark");
        localStorage.setItem("kindred_theme", theme);
    }, [theme]);
    return (
        <div className="space-y-6" data-testid="settings-appearance">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Appearance</h2>
                <p className="text-sm text-muted-k mt-1">Pick the mode that's easier on your eyes, especially at night.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
                {[{ v: "light", l: "Light", Icon: Sun, desc: "Kindred's default warm palette." },
                  { v: "dark", l: "Dark", Icon: Moon, desc: "Lower contrast for late-night reviewing." }].map((o) => (
                    <button key={o.v} onClick={() => setTheme(o.v)} data-testid={`theme-${o.v}`} className={`text-left rounded-2xl border p-5 transition-all ${theme === o.v ? "border-primary-k ring-2 ring-primary-k/20 bg-surface" : "border-kindred bg-surface hover:bg-surface-2"}`}>
                        <o.Icon className="h-5 w-5 text-primary-k" />
                        <div className="mt-3 font-medium text-primary-k">{o.l}</div>
                        <div className="text-xs text-muted-k mt-1">{o.desc}</div>
                        {theme === o.v && <div className="mt-3 inline-flex items-center gap-1 text-xs text-sage"><Check className="h-3.5 w-3.5" /> Current</div>}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* --------------------------------- Usage ---------------------------------- */
function UsageTab() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => { (async () => { try { const { data } = await api.get("/usage"); setData(data); } finally { setLoading(false); } })(); }, []);
    const labels = {
        chat_questions: "AI chat questions", statements_uploaded: "Statements uploaded",
        family_messages: "Family thread posts", wellbeing_checkins: "Wellbeing check-ins",
        digest_sends: "Digest emails sent", tool_emails_sent: "Tool results emailed",
    };
    return (
        <div className="space-y-6" data-testid="settings-usage">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Your usage</h2>
                <p className="text-sm text-muted-k mt-1">Everything Kindred has done for you since you joined.</p>
            </div>
            {loading ? (<div className="text-sm text-muted-k"><Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Loading…</div>) : !data ? null : (
                <>
                    <p className="text-sm text-muted-k">On the <span className="font-medium capitalize text-primary-k">{data.plan}</span> plan since {data.since ? new Date(data.since).toLocaleDateString() : "recently"}.</p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="usage-grid">
                        {Object.entries(data.counts).map(([k, v]) => (
                            <div key={k} className="bg-surface border border-kindred rounded-xl p-5" data-testid={`usage-${k}`}>
                                <div className="overline">{labels[k] || k}</div>
                                <div className="mt-2 font-heading text-3xl text-primary-k tabular-nums">{v}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

/* -------------------------------- Security -------------------------------- */
function SecurityTab() {
    const { user } = useAuth();
    const [sending, setSending] = useState(false);
    const sendReset = async () => { setSending(true); try { await api.post("/auth/forgot", { email: user.email }); toast.success("Password reset link sent."); } catch (err) { toast.error(err?.response?.data?.detail || "Could not send reset link"); } finally { setSending(false); } };
    return (
        <div className="space-y-6" data-testid="settings-security">
            <div><h2 className="font-heading text-2xl text-primary-k tracking-tight">Security</h2><p className="text-sm text-muted-k mt-1">Manage your password and sign-in options.</p></div>
            <div className="bg-surface border border-kindred rounded-2xl p-6 max-w-xl">
                <h3 className="font-heading text-lg text-primary-k">Password</h3>
                <p className="text-sm text-muted-k mt-1">We'll email you a secure link to set a new password.</p>
                <button onClick={sendReset} disabled={sending} data-testid="security-send-reset-btn" className="mt-4 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a] disabled:opacity-60">{sending ? "Sending…" : "Send me a reset link"}</button>
            </div>
        </div>
    );
}

/* ------------------------------- Danger Zone ------------------------------ */
function DangerTab() {
    const { logout } = useAuth();
    const nav = useNavigate();
    const [confirmText, setConfirmText] = useState("");
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        if (confirmText !== "delete my account") { toast.error('Type "delete my account" to confirm'); return; }
        if (!window.confirm("This is permanent. Your household, statements, and chat history become inaccessible. Continue?")) return;
        setBusy(true);
        try {
            await api.request({ method: "DELETE", url: "/auth/account", data: { confirm: confirmText } });
            toast.success("Account deleted");
            await logout();
            nav("/");
        } catch (err) { toast.error(err?.response?.data?.detail || "Could not delete"); }
        finally { setBusy(false); }
    };
    return (
        <div className="space-y-6" data-testid="settings-danger">
            <div><h2 className="font-heading text-2xl text-terracotta tracking-tight">Danger zone</h2><p className="text-sm text-muted-k mt-1">Actions here can't be reversed. Proceed carefully.</p></div>
            <div className="bg-surface border-2 border-terracotta/40 rounded-2xl p-6 max-w-2xl">
                <h3 className="font-heading text-lg text-terracotta">Delete your account</h3>
                <p className="text-sm text-muted-k mt-2">We'll anonymise your email and name, cancel your plan, and remove you from your household. The audit trail stays (legally required) but shows "Deleted user".</p>
                <p className="text-xs text-muted-k mt-2">Type <span className="font-mono bg-surface-2 px-1.5 py-0.5 rounded">delete my account</span> to confirm.</p>
                <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} data-testid="danger-confirm-input" placeholder="delete my account" className="mt-3 w-full max-w-sm rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-terracotta" />
                <div className="mt-4">
                    <button onClick={submit} disabled={confirmText !== "delete my account" || busy} data-testid="danger-delete-btn" className="bg-terracotta text-white rounded-md px-5 py-2.5 text-sm hover:brightness-95 disabled:opacity-60">{busy ? "Deleting…" : "Delete account permanently"}</button>
                </div>
            </div>
        </div>
    );
}

/* ---------------------------------- Root ---------------------------------- */
export default function Settings() {
    const { tab } = useParams();
    const nav = useNavigate();
    const active = TABS.find((t) => t.id === tab)?.id || "profile";
    useEffect(() => { if (!tab) nav("/settings/profile", { replace: true }); }, [tab, nav]);
    return (
        <div className="grid md:grid-cols-[220px_1fr] gap-8" data-testid="settings-page">
            <aside className="md:sticky md:top-6 md:self-start"><TabNav active={active} /></aside>
            <section className="min-w-0">
                {active === "profile" && <ProfileTab />}
                {active === "billing" && <BillingTab />}
                {active === "members" && <MembersTab />}
                {active === "digest" && <DigestTab />}
                {active === "notifications" && <NotificationsTab />}
                {active === "appearance" && <AppearanceTab />}
                {active === "usage" && <UsageTab />}
                {active === "security" && <SecurityTab />}
                {active === "danger" && <DangerTab />}
            </section>
        </div>
    );
}
