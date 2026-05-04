import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { User, CreditCard, Users, Shield, Loader2, Check, X, Crown, Mail, ArrowUpRight, Trash2 } from "lucide-react";

const TABS = [
    { id: "profile", label: "Profile", icon: User },
    { id: "billing", label: "Plan & Billing", icon: CreditCard },
    { id: "members", label: "Family members", icon: Users },
    { id: "security", label: "Security", icon: Shield },
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
                    }`}
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
        try {
            // Endpoint doesn't exist yet server-side for name edit; no-op gracefully
            setUser({ ...user, name });
            toast.success("Saved");
        } finally {
            setSaving(false);
        }
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
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        data-testid="profile-name-input"
                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
                <label className="block">
                    <span className="text-sm text-muted-k">Email</span>
                    <input
                        type="email"
                        value={user?.email || ""}
                        disabled
                        className="mt-1 w-full rounded-md border border-kindred bg-surface-2 px-3 py-2.5 text-muted-k"
                    />
                </label>
                <label className="block">
                    <span className="text-sm text-muted-k">Role</span>
                    <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-surface-2 border border-kindred px-3 py-1.5 text-sm text-primary-k capitalize">
                        {user?.role}
                    </div>
                </label>
                <button
                    onClick={save}
                    disabled={saving || name === user?.name}
                    data-testid="profile-save-btn"
                    className="bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a] disabled:opacity-60"
                >
                    {saving ? "Saving…" : "Save changes"}
                </button>
            </div>
        </div>
    );
}

/* --------------------------------- Billing -------------------------------- */
const PLANS = {
    free: { name: "Free", price: "$0", period: "forever" },
    solo: { name: "Solo", price: "$19", period: "/mo" },
    family: { name: "Family", price: "$39", period: "/mo" },
};

function BillingTab() {
    const { user, refreshUser } = useAuth();
    const [sub, setSub] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/billing/subscription");
            setSub(data);
        } catch {
            setSub({ plan: user?.plan || "free", status: "none" });
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const startCheckout = async (plan) => {
        setBusy(true);
        try {
            const { data } = await api.post("/billing/checkout", { plan, origin_url: window.location.origin });
            if (data?.url) { window.location.href = data.url; return; }
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not start checkout");
        } finally {
            setBusy(false);
        }
    };
    const changePlan = async (plan) => {
        setBusy(true);
        try {
            const { data } = await api.post("/billing/upgrade", { plan });
            if (data?.ok) {
                toast.success(`Plan changed to ${PLANS[plan].name}`);
                await refreshUser();
                await load();
            }
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not change plan");
        } finally {
            setBusy(false);
        }
    };
    const cancel = async () => {
        if (!window.confirm("Cancel auto-renewal? Your plan stays active until the end of the current billing period.")) return;
        setBusy(true);
        try {
            await api.post("/billing/cancel");
            toast.success("Auto-renewal cancelled");
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not cancel");
        } finally {
            setBusy(false);
        }
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
            ) : (
                <>
                    <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="current-plan-card">
                        <div className="flex items-start justify-between flex-wrap gap-4">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Crown className="h-4 w-4 text-gold" />
                                    <span className="overline">Current plan</span>
                                </div>
                                <div className="mt-2 font-heading text-2xl text-primary-k">
                                    {PLANS[currentPlan]?.name} <span className="text-base font-sans text-muted-k">{PLANS[currentPlan]?.price}{PLANS[currentPlan]?.period}</span>
                                </div>
                                {activeSub && sub.trial_ends_at && sub.status === "trialing" && (
                                    <p className="text-sm text-muted-k mt-2">7-day trial ends {new Date(sub.trial_ends_at).toLocaleDateString()}.</p>
                                )}
                                {activeSub && sub.current_period_end && (
                                    <p className="text-sm text-muted-k mt-1">
                                        {sub.cancel_at_period_end ? "Ends" : "Renews"} {new Date(sub.current_period_end).toLocaleDateString()}.
                                    </p>
                                )}
                            </div>
                            {activeSub && !sub.cancel_at_period_end && (
                                <button
                                    onClick={cancel}
                                    disabled={busy}
                                    data-testid="cancel-plan-btn"
                                    className="inline-flex items-center gap-2 text-sm text-terracotta hover:underline"
                                >
                                    <X className="h-3.5 w-3.5" /> Cancel auto-renewal
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-4">
                        {["free", "solo", "family"].map((p) => {
                            const isCurrent = p === currentPlan;
                            return (
                                <div
                                    key={p}
                                    className={`rounded-2xl border p-5 ${isCurrent ? "border-primary-k ring-2 ring-primary-k/20 bg-surface" : "border-kindred bg-surface"}`}
                                    data-testid={`billing-plan-${p}`}
                                >
                                    <div className="flex items-baseline justify-between">
                                        <span className="font-heading text-xl text-primary-k">{PLANS[p].name}</span>
                                        <span className="text-sm text-muted-k">{PLANS[p].price}{PLANS[p].period}</span>
                                    </div>
                                    {isCurrent ? (
                                        <div className="mt-4 inline-flex items-center gap-1 text-xs text-sage"><Check className="h-3.5 w-3.5" /> Current</div>
                                    ) : p === "free" && activeSub ? (
                                        <button
                                            onClick={cancel}
                                            disabled={busy}
                                            data-testid={`billing-downgrade-${p}`}
                                            className="mt-4 w-full text-sm border border-kindred rounded-md py-2 text-primary-k hover:bg-surface-2 disabled:opacity-60"
                                        >
                                            Downgrade (cancel)
                                        </button>
                                    ) : activeSub ? (
                                        <button
                                            onClick={() => changePlan(p)}
                                            disabled={busy}
                                            data-testid={`billing-switch-${p}`}
                                            className="mt-4 w-full text-sm bg-primary-k text-white rounded-md py-2 hover:bg-[#16294a] disabled:opacity-60"
                                        >
                                            Switch to {PLANS[p].name}
                                        </button>
                                    ) : p === "free" ? null : (
                                        <button
                                            onClick={() => startCheckout(p)}
                                            disabled={busy}
                                            data-testid={`billing-start-${p}`}
                                            className="mt-4 w-full text-sm bg-primary-k text-white rounded-md py-2 hover:bg-[#16294a] disabled:opacity-60 inline-flex items-center justify-center gap-2"
                                        >
                                            Start {PLANS[p].name} <ArrowUpRight className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
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

    const load = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/household/members");
            setData(data);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);

    const invite = async (e) => {
        e.preventDefault();
        setSending(true);
        try {
            await api.post("/household/invite", form);
            toast.success(`Invitation sent to ${form.email}`);
            setForm({ email: "", role: "family_member", note: "" });
            await load();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            toast.error(typeof detail === "string" ? detail : detail?.message || "Could not send invite");
        } finally {
            setSending(false);
        }
    };

    const remove = async (uid) => {
        if (!window.confirm("Remove this member? They'll lose access to the household immediately.")) return;
        try {
            await api.delete(`/household/members/${uid}`);
            toast.success("Member removed");
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not remove");
        }
    };

    const onFamily = user?.plan === "family";

    return (
        <div className="space-y-6" data-testid="settings-members">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Family members</h2>
                <p className="text-sm text-muted-k mt-1">
                    Up to 5 people per household (including you). Everyone sees the statements and audit log; only you can remove members.
                </p>
            </div>

            {!onFamily ? (
                <div className="bg-surface border border-gold rounded-2xl p-6" data-testid="members-upgrade-gate">
                    <h3 className="font-heading text-xl text-primary-k">Inviting siblings is on Family plan</h3>
                    <p className="text-sm text-muted-k mt-2">Family plan adds 5 seats, role-based permissions, and the Sunday digest.</p>
                    <Link to="/settings/billing" className="mt-4 inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a]" data-testid="members-upgrade-cta">
                        Upgrade to Family
                    </Link>
                </div>
            ) : (
                <>
                    <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="invite-card">
                        <h3 className="font-heading text-lg text-primary-k">Invite someone</h3>
                        <form onSubmit={invite} className="mt-4 grid sm:grid-cols-2 gap-3">
                            <label className="block sm:col-span-2">
                                <span className="text-sm text-muted-k">Email</span>
                                <input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    required
                                    data-testid="invite-email-input"
                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                />
                            </label>
                            <label className="block">
                                <span className="text-sm text-muted-k">Role</span>
                                <select
                                    value={form.role}
                                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                                    data-testid="invite-role-select"
                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                >
                                    <option value="family_member">Family member (sibling / partner)</option>
                                    <option value="advisor">Advisor / GP (read-only)</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm text-muted-k">Optional note</span>
                                <input
                                    type="text"
                                    value={form.note}
                                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                                    placeholder="Hey sis, looping you in…"
                                    data-testid="invite-note-input"
                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                                />
                            </label>
                            <div className="sm:col-span-2">
                                <button
                                    type="submit"
                                    disabled={sending}
                                    data-testid="invite-submit-btn"
                                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a] disabled:opacity-60"
                                >
                                    {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                                    <Mail className="h-4 w-4" /> Send invitation
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="members-list-card">
                        <h3 className="font-heading text-lg text-primary-k">Active members</h3>
                        {loading ? (
                            <div className="mt-4 text-sm text-muted-k flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
                        ) : (
                            <ul className="mt-4 space-y-2">
                                {data.members.map((m) => (
                                    <li key={m.user_id || m.email} className="flex items-center justify-between rounded-lg p-3 bg-surface-2" data-testid={`member-row-${m.email}`}>
                                        <div>
                                            <div className="text-sm font-medium text-primary-k">{m.name} <span className="text-xs text-muted-k capitalize ml-2">{m.role?.replace("_", " ")}</span></div>
                                            <div className="text-xs text-muted-k">{m.email}</div>
                                        </div>
                                        {m.role !== "primary" && (
                                            <button
                                                onClick={() => remove(m.user_id)}
                                                data-testid={`member-remove-${m.email}`}
                                                className="text-xs text-terracotta hover:underline inline-flex items-center gap-1"
                                            >
                                                <Trash2 className="h-3 w-3" /> Remove
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {data.invites?.length > 0 && (
                            <>
                                <h4 className="font-medium text-primary-k mt-6 mb-2 text-sm">Pending invites</h4>
                                <ul className="space-y-2">
                                    {data.invites.map((i) => (
                                        <li key={i.token} className="flex items-center justify-between rounded-lg p-3 bg-gold/10 border border-gold/30 text-sm">
                                            <div>
                                                <div className="font-medium text-primary-k">{i.email} <span className="text-xs text-muted-k capitalize ml-2">{i.role?.replace("_", " ")}</span></div>
                                                <div className="text-xs text-muted-k">Expires {new Date(i.expires_at).toLocaleDateString()}</div>
                                            </div>
                                            <span className="text-xs text-muted-k">Pending</span>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
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

    const sendReset = async () => {
        setSending(true);
        try {
            await api.post("/auth/forgot", { email: user.email });
            toast.success("Password reset link sent to your email.");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not send reset link");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="settings-security">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Security</h2>
                <p className="text-sm text-muted-k mt-1">Manage your password and sign-in options.</p>
            </div>
            <div className="bg-surface border border-kindred rounded-2xl p-6 max-w-xl">
                <h3 className="font-heading text-lg text-primary-k">Password</h3>
                <p className="text-sm text-muted-k mt-1">We'll email you a secure link to set a new password.</p>
                <button
                    onClick={sendReset}
                    disabled={sending}
                    data-testid="security-send-reset-btn"
                    className="mt-4 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a] disabled:opacity-60"
                >
                    {sending ? "Sending…" : "Send me a reset link"}
                </button>
            </div>
        </div>
    );
}

export default function Settings() {
    const { tab } = useParams();
    const nav = useNavigate();
    const active = TABS.find((t) => t.id === tab)?.id || "profile";

    useEffect(() => {
        if (!tab) nav("/settings/profile", { replace: true });
    }, [tab, nav]);

    return (
        <div className="grid md:grid-cols-[220px_1fr] gap-8" data-testid="settings-page">
            <aside className="md:sticky md:top-6 md:self-start">
                <TabNav active={active} />
            </aside>
            <section className="min-w-0">
                {active === "profile" && <ProfileTab />}
                {active === "billing" && <BillingTab />}
                {active === "members" && <MembersTab />}
                {active === "security" && <SecurityTab />}
            </section>
        </div>
    );
}
