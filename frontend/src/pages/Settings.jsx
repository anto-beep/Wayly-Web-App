import React, { useEffect, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, extractErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/formatDate";
import { track } from "@/lib/analytics";
import { toast } from "sonner";
import { useTheme, isEnabled } from "@/uxf";
import {
    User, CreditCard, Users, Shield, Loader2, Check, X, Crown, Mail, ArrowUpRight, Trash2,
    Bell, Moon, Sun, Gauge, AlertTriangle, Mailbox, Send, Eye, MessageSquare,
} from "lucide-react";
import Skeleton from "@/components/Skeleton";
import PersonaPreviewCard from "@/components/PersonaPreviewCard";

const TABS = [
    // UI-1 §10, Title Case everywhere, SMS tab removed.
    { id: "profile", label: "Profile", icon: User },
    { id: "billing", label: "Plan and Billing", icon: CreditCard },
    { id: "members", label: "Family Members", icon: Users },
    { id: "digest", label: "Weekly Digest", icon: Mailbox },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "appearance", label: "Appearance", icon: Moon },
    { id: "usage", label: "Usage", icon: Gauge },
    { id: "security", label: "Security", icon: Shield },
    { id: "danger", label: "Danger Zone", icon: AlertTriangle },
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

/* -------------------------- Email change section -------------------------- */
function EmailChangeSection({ currentEmail }) {
    const [status, setStatus] = useState(null); // null | {pending, new_email, requested_at, expires_at}
    const [editing, setEditing] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const loadStatus = useCallback(() => {
        api.get("/auth/email/change-status")
            .then((r) => setStatus(r.data || null))
            .catch(() => setStatus(null));
    }, []);
    useEffect(() => { loadStatus(); }, [loadStatus]);

    const submit = async () => {
        setError("");
        setSuccess("");
        if (!newEmail.trim()) { setError("Enter a new email address."); return; }
        if (!password) { setError("Enter your current password."); return; }
        if (newEmail.trim().toLowerCase() === currentEmail.toLowerCase()) {
            setError("That is already your email."); return;
        }
        setBusy(true);
        try {
            const { data } = await api.post("/auth/email/change-request", {
                new_email: newEmail.trim(),
                password,
            });
            setSuccess(`We sent a confirmation link to ${data.new_email}. Open it from that inbox to complete the change. Your account keeps using ${currentEmail} until you click the link.`);
            setPassword("");
            setNewEmail("");
            setEditing(false);
            loadStatus();
        } catch (e) {
            setError(extractErrorMessage(e, "Could not start the email change."));
        } finally { setBusy(false); }
    };

    const cancelPending = async () => {
        if (!window.confirm("Cancel the pending email change?")) return;
        try {
            await api.delete("/auth/email/change-request");
            toast.success("Pending email change cancelled.");
            loadStatus();
        } catch (e) {
            toast.error(extractErrorMessage(e, "Could not cancel."));
        }
    };

    return (
        <div className="mt-1" data-testid="email-change-section">
            <div className="rounded-md border border-kindred bg-surface-2 px-3 py-2.5 text-primary-k flex items-center justify-between gap-2">
                <span className="truncate" data-testid="email-current">{currentEmail}</span>
                {!editing && !status?.pending && (
                    <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="text-xs font-medium text-primary-k hover:underline shrink-0"
                        data-testid="email-change-open"
                    >
                        Change email
                    </button>
                )}
            </div>
            {status?.pending && (
                <div className="mt-2 rounded-md border border-gold/40 bg-gold/5 px-3 py-2 text-sm text-primary-k" data-testid="email-change-pending">
                    <strong>Verification pending.</strong> We sent a link to <span data-testid="email-change-target">{status.new_email}</span>.
                    Click it from that inbox to finish the change. Your current email stays active until you do.
                    <button
                        type="button"
                        onClick={cancelPending}
                        className="ml-2 text-xs text-terracotta hover:underline"
                        data-testid="email-change-cancel"
                    >
                        Cancel change
                    </button>
                </div>
            )}
            {editing && (
                <div className="mt-3 space-y-3 rounded-md border border-kindred bg-surface p-3" data-testid="email-change-form">
                    <label className="block">
                        <span className="text-xs text-muted-k">New email address</span>
                        <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            data-testid="email-change-new-input"
                            className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 focus:outline-none focus:ring-2 ring-primary-k"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs text-muted-k">Confirm your password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            data-testid="email-change-password-input"
                            className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 focus:outline-none focus:ring-2 ring-primary-k"
                        />
                    </label>
                    {error && <div className="text-xs text-terracotta" data-testid="email-change-error">{error}</div>}
                    <div className="text-xs text-muted-k">
                        We&apos;ll send a confirmation link to the new address. You stay signed in with your current email until you click it.
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={() => { setEditing(false); setError(""); setNewEmail(""); setPassword(""); }}
                            className="text-sm text-muted-k hover:text-primary-k px-3 py-1.5"
                            data-testid="email-change-cancel-form"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={busy}
                            className="bg-primary-k text-white rounded-md px-4 py-1.5 text-sm hover:bg-[#091D33] disabled:opacity-50"
                            data-testid="email-change-submit"
                        >
                            {busy ? "Sending…" : "Send verification link"}
                        </button>
                    </div>
                </div>
            )}
            {success && !status?.pending && (
                <div className="mt-2 rounded-md border border-sage/40 bg-sage/10 px-3 py-2 text-sm text-primary-k" data-testid="email-change-success">
                    {success}
                </div>
            )}
        </div>
    );
}

/* --------------------------------- Profile -------------------------------- */
function ProfileTab() {
    const { user, setUser } = useAuth();
    const [name, setName] = useState(user?.name || "");
    const [phone, setPhone] = useState("");
    const [phoneLoaded, setPhoneLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    // Load the current phone_e164 from /sms-contact so we can show it back.
    // Fallback: the signup mobile lives on the user account (user.mobile /
    // user.phone_e164), so if /sms-contact has nothing on file yet, use
    // whichever the account holds (signup carryover) as the prefill.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get("/sms-contact");
                if (!cancelled) {
                    const carryFromSignup = user?.phone_e164 || user?.mobile || "";
                    setPhone(data?.phone_e164 || carryFromSignup || "");
                    setPhoneLoaded(true);
                }
            } catch {
                if (!cancelled) {
                    setPhone(user?.phone_e164 || user?.mobile || "");
                    setPhoneLoaded(true);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [user]);
    const save = async () => {
        setSaving(true);
        try {
            const trimmed = phone.trim();
            // Only submit if phone changed and format looks E.164-ish (starts with +, 8-15 digits).
            const dirty = trimmed !== (user?.phone_e164 || "");
            if (dirty) {
                if (trimmed && !/^\+\d{8,15}$/.test(trimmed)) {
                    toast.error("Enter your phone number in international format, for example +61412345678.");
                    setSaving(false);
                    return;
                }
                await api.patch("/sms-contact", { phone_e164: trimmed || null });
            }
            setUser({ ...user, name, phone_e164: trimmed });
            toast.success("Saved");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not save your profile"));
        } finally {
            setSaving(false);
        }
    };
    return (
        <div className="space-y-6" data-testid="settings-profile">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Your Profile</h2>
                <p className="text-sm text-muted-k mt-1">How Wayly greets you across the app.</p>
            </div>
            <div className="space-y-4 max-w-md">
                <label className="block">
                    <span className="text-sm text-muted-k">Full name</span>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name-input" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" />
                </label>
                <div className="block">
                    <span className="text-sm text-muted-k">Email</span>
                    <EmailChangeSection currentEmail={user?.email || ""} />
                </div>
                <label className="block">
                    <span className="text-sm text-muted-k">Phone number</span>
                    <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder={phoneLoaded ? "Add phone number, for example +61412345678" : "Loading…"}
                        disabled={!phoneLoaded}
                        data-testid="profile-phone-input"
                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k disabled:opacity-60"
                    />
                    <span className="mt-1 block text-xs text-muted-k">Used for SMS check-ins and urgent alerts. We only text you about your participant.</span>
                </label>
                <label className="block">
                    <span className="text-sm text-muted-k">Role</span>
                    <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-surface-2 border border-kindred px-3 py-1.5 text-sm text-primary-k capitalize">{user?.role}</div>
                </label>
                <button onClick={save} disabled={saving} data-testid="profile-save-btn" className="bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#091D33] disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button>
            </div>
            {user?.admin_role && <PersonaPreviewCard />}
        </div>
    );
}

/* --------------------------------- Billing -------------------------------- */
// PRICING-UI-1 v11: consumer plans are fortnightly ($24.50 Solo, $49.50 Family,
// $24.50 per additional participant). Free tier removed per BILLING-UI-1 v5 §1.
const PLANS = {
    solo: { name: "Solo", price: "$24.50", period: "per fortnight", included_participants: 1 },
    family: { name: "Family", price: "$49.50", period: "per fortnight", included_participants: 2 },
};
const ADDON_PRICE_FORTNIGHT = 24.50;

function BillingTab() {
    const { user, refreshUser } = useAuth();
    const [sub, setSub] = useState(null);
    const [account, setAccount] = useState(null);
    const [invoices, setInvoices] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [subRes, acctRes, invRes] = await Promise.allSettled([
                api.get("/billing/subscription"),
                api.get("/account"),
                api.get("/payments/invoices"),
            ]);
            setSub(subRes.status === "fulfilled" ? subRes.value.data : { plan: user?.plan || "solo", status: "none" });
            setAccount(acctRes.status === "fulfilled" ? acctRes.value.data : null);
            setInvoices(invRes.status === "fulfilled" ? (invRes.value.data?.invoices || []) : []);
        } finally { setLoading(false); }
    }, [user?.plan]);
    useEffect(() => { load(); }, [load]);
    const startCheckout = async (plan) => {
        setBusy(true);
        try {
            // Try the free 7-day trial first. Falls back to Stripe Checkout when
            // the user has already used their trial.
            try {
                const { data } = await api.post("/billing/start-trial", { plan });
                if (data?.ok) {
                    toast.success(`Your free 7-day ${PLANS[plan].name} trial is active.`);
                    await refreshUser();
                    await load();
                    return;
                }
            } catch (errTrial) {
                const det = errTrial?.response?.data?.detail;
                const trialUsed = det && typeof det === "object" && det.error === "trial_used";
                if (!trialUsed) {
                    toast.error(extractErrorMessage(errTrial, "Could not start trial"));
                    return;
                }
            }
            const { data } = await api.post("/payments/checkout", { plan, origin_url: window.location.origin, trial_days: 7 });
            if (data?.url) { window.location.href = data.url; return; }
        }
        catch (err) { toast.error(extractErrorMessage(err, "Could not start checkout")); }
        finally { setBusy(false); }
    };
    const changePlan = async (plan) => {
        // Family-to-Solo gating: locked in BILLING-UI-1 v5 §4.3 — Solo supports
        // exactly one participant. Block direct switch if 2+ participants exist.
        if (plan === "solo" && (user?.plan === "family") && account) {
            const activeCount = account?.summary?.participants_active ?? (account?.participants || []).filter((p) => p.status === "ACTIVE").length;
            if (activeCount > 1) {
                toast.error("Solo is a one-person plan", {
                    description: `Remove other participants first, then you can switch to Solo. You currently have ${activeCount}.`,
                    duration: 10_000,
                    action: { label: "Manage participants", onClick: () => { window.location.assign("/app/participants"); } },
                });
                return;
            }
        }
        // BILLING-UI-1 v5 §4.4: upgrades are immediate + prorated. Fetch the
        // exact prorated figure from Stripe's upcoming-invoice endpoint so
        // the confirmation modal shows the number that will actually be
        // charged (spec acceptance criterion 4).
        const isUpgrade = plan === "family" && user?.plan === "solo";
        const isDowngrade = plan === "solo" && user?.plan === "family";
        let prorationLine = "";
        if (isUpgrade || isDowngrade) {
            try {
                const { data: preview } = await api.post("/payments/proration-preview", {
                    target_plan: plan,
                    additional_participants: 0,
                });
                if (preview?.available && typeof preview.amount_due_now === "number") {
                    if (isUpgrade) {
                        prorationLine = `You'll be charged ${preview.amount_due_now_display} now for the rest of your current fortnight. `;
                    } else {
                        prorationLine = `You won't be charged today. `;
                    }
                }
            } catch { /* fall back to plain-language copy */ }
        }
        let confirmMsg;
        if (isUpgrade) {
            confirmMsg = `Switch to Family? ${prorationLine}From your next charge, you'll be billed $49.50 per fortnight instead of $24.50.`;
        } else if (isDowngrade) {
            confirmMsg = `Switch to Solo at the end of your current fortnight? ${prorationLine}You'll keep Family access until then, and there's no refund for the current fortnight. Your next charge will be $24.50 instead of $49.50.`;
        } else {
            confirmMsg = `Switch to ${PLANS[plan].name}?`;
        }
        if (!window.confirm(confirmMsg)) return;
        setBusy(true);
        try {
            if (isDowngrade) {
                // BILLING-UI-1 v5 §4.3: Family→Solo is a scheduled downgrade via a
                // real Stripe Subscription Schedule. Access stays on Family until
                // the period end; db.subscriptions carries pending_plan/effective.
                const { data } = await api.post("/payments/schedule-downgrade", { plan });
                track.upgradeSuccess({ plan, from: user?.plan, source: "settings", scheduled: true });
                toast.success(data?.message || `Your plan changes to ${PLANS[plan].name} at the end of your current fortnight.`);
                await load();
            } else {
                // Solo→Family upgrade: real prorated Stripe subscription.update
                // (BILLING-UI-1 v5 §4.4). Replaces the legacy no-op /billing/upgrade
                // so every upgrade path charges the exact proration on the live sub.
                const { data } = await api.post("/payments/change-plan", { target_plan: plan });
                track.upgradeSuccess({ plan, from: user?.plan, source: "settings" });
                toast.success(`Plan changed to ${PLANS[plan].name}`);
                await refreshUser();
                await load();
            }
        }
        catch (err) { toast.error(extractErrorMessage(err, "Could not change plan")); }
        finally { setBusy(false); }
    };
    const keepCurrentPlan = async () => {
        // Release a scheduled downgrade so the current plan simply renews.
        setBusy(true);
        try {
            await api.post("/payments/cancel-scheduled-change");
            toast.success("Your scheduled change was cancelled. Your current plan will renew as normal.");
            await load();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not cancel the scheduled change"));
        } finally { setBusy(false); }
    };
    const cancel = async () => {
        // BILLING-UI-1 v5 §4.5 — one click, honest, no retention hedge.
        const periodEnd = sub?.current_period_end ? formatDate(sub.current_period_end) : "the end of your current fortnight";
        if (!window.confirm(`Cancel plan? You'll keep full access until ${periodEnd}. After that, your data is kept for 30 days in case you come back, then permanently deleted. You will not be charged again.`)) return;
        setBusy(true);
        try {
            await api.post("/payments/cancel-subscription");
            toast.success("Your plan will end at the current period.");
            await load();
        } catch (err) {
            // Fallback to legacy endpoint if the new one isn't wired up yet.
            try {
                await api.post("/billing/cancel");
                toast.success("Your plan will end at the current period.");
                await load();
            } catch (err2) {
                toast.error(extractErrorMessage(err2, "Could not cancel"));
            }
        } finally { setBusy(false); }
    };
    const reactivate = async () => {
        // Undo a scheduled cancel. Best-effort against the legacy endpoint.
        setBusy(true);
        try {
            await api.post("/payments/reactivate-subscription");
            toast.success("Your plan is back on.");
            await load();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not reactivate"));
        } finally { setBusy(false); }
    };
    const openPortal = async () => {
        setBusy(true);
        try {
            const { data } = await api.post("/payments/portal", { origin_url: window.location.origin });
            if (data?.url) {
                window.location.href = data.url;
                return;
            }
            toast.error("Could not open the billing portal.");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not open the billing portal."));
        } finally { setBusy(false); }
    };
    const currentPlan = PLANS[user?.plan] ? user.plan : "solo";
    const activeSub = sub && sub.status && sub.status !== "none";
    // Fortnightly totals — recompute participant + add-on view (was monthly).
    const acctSummary = account?.summary || {};
    const participantsActive = acctSummary.participants_active ?? (account?.participants || []).filter((p) => p.status === "ACTIVE").length;
    // Trust the plan definition, not the backend `participants_included`
    // field: after a plan swap the backend may still return the old plan's
    // included count until reconciliation runs, which surfaces the
    // misleading "3 / 2 included" tile on a Solo account.
    const participantsIncluded = PLANS[currentPlan].included_participants;
    const addonCount = Math.max(0, participantsActive - participantsIncluded);
    const isOverPlanLimit = participantsActive > participantsIncluded && currentPlan === "solo";
    const basePriceFortnight = Number(PLANS[currentPlan].price.replace("$", ""));
    const addonSubtotalFortnight = addonCount * ADDON_PRICE_FORTNIGHT;
    const fortnightTotal = basePriceFortnight + addonSubtotalFortnight;

    return (
        <div className="space-y-6" data-testid="settings-billing">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Plan and Billing</h2>
                <p className="text-sm text-muted-k mt-1">View your plan, change or cancel any time, manage your card, and download every invoice.</p>
            </div>
            {loading ? (
                <div className="space-y-4">
                    <Skeleton variant="card" rows={3} />
                    <Skeleton variant="grid" count={3} />
                </div>
            ) : (<>
                {/* Over-limit banner — Solo user with >1 active participant.
                    Guides them to switch to Family or reduce participants. */}
                {isOverPlanLimit && (
                    <div className="bg-terracotta/10 border border-terracotta/40 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between" data-testid="over-limit-banner">
                        <div>
                            <div className="font-heading text-lg text-primary-k">You&apos;re over the Solo plan limit</div>
                            <p className="text-sm text-muted-k mt-1">
                                Solo covers one participant, but your account has <strong>{participantsActive}</strong>. You&apos;re being charged ${fortnightTotal.toFixed(2)} per fortnight (Solo base + {addonCount} extra) — that&apos;s more than Family ($49.50) which would cover all of them.
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                            <button
                                onClick={() => changePlan("family")}
                                disabled={busy}
                                data-testid="over-limit-switch-family"
                                className="text-sm bg-primary-k text-white rounded-md px-4 py-2 hover:bg-[#091D33] disabled:opacity-60"
                            >
                                Switch to Family
                            </button>
                            <Link to="/app/participants" data-testid="over-limit-manage-participants" className="text-sm text-primary-k underline hover:no-underline text-center py-2">
                                Or manage participants
                            </Link>
                        </div>
                    </div>
                )}
                {/* Current plan card */}
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="current-plan-card">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                        <div>
                            <div className="flex items-center gap-2"><Crown className="h-4 w-4 text-gold" /><span className="overline">Current plan</span></div>
                            <div className="mt-2 font-heading text-2xl text-primary-k" data-testid="current-plan-name">
                                {PLANS[currentPlan]?.name}{" "}
                                <span className="text-base font-sans text-muted-k" data-testid="current-plan-price">
                                    ${fortnightTotal.toFixed(2)} per fortnight
                                </span>
                            </div>
                            {addonCount > 0 && (
                                <p className="text-xs text-muted-k mt-1" data-testid="current-plan-breakdown">
                                    {PLANS[currentPlan]?.price} base + {addonCount} additional participant{addonCount === 1 ? "" : "s"} at ${ADDON_PRICE_FORTNIGHT.toFixed(2)} per fortnight each · Includes GST
                                </p>
                            )}
                            {addonCount === 0 && (
                                <p className="text-xs text-muted-k mt-1">Billed every 14 days · Includes GST</p>
                            )}
                            {activeSub && sub.trial_ends_at && sub.status === "trialing" && (() => {
                                const ms = new Date(sub.trial_ends_at).getTime() - Date.now();
                                const days = Math.max(0, Math.ceil(ms / 86_400_000));
                                return (
                                    <p className="text-sm mt-2" data-testid="billing-trial-remaining">
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gold/15 text-primary-k border border-gold/40 text-xs">
                                            Free trial · {days} day{days === 1 ? "" : "s"} left
                                        </span>
                                        <span className="text-muted-k ml-2">ends {new Date(sub.trial_ends_at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</span>
                                    </p>
                                );
                            })()}
                            {activeSub && sub.current_period_end && sub.status !== "trialing" && (
                                <p className="text-sm text-muted-k mt-1" data-testid="billing-next-charge">
                                    {sub.cancel_at_period_end ? "Ends" : "Next charge:"} {formatDate(sub.current_period_end)}
                                    {!sub.cancel_at_period_end && ` · $${fortnightTotal.toFixed(2)} including GST`}
                                </p>
                            )}
                            {sub?.cancel_at_period_end && (
                                <div className="mt-3 rounded-md border border-terracotta/40 bg-terracotta/5 px-3 py-2 text-sm text-primary-k" data-testid="billing-cancel-scheduled">
                                    Your plan is scheduled to end on {formatDate(sub.current_period_end)}. You keep full access until then.
                                    <button type="button" onClick={reactivate} disabled={busy} className="ml-2 text-xs text-primary-k underline hover:no-underline" data-testid="billing-reactivate">
                                        Reactivate
                                    </button>
                                </div>
                            )}
                            {sub?.pending_plan && (
                                <div className="mt-3 rounded-md border border-gold/40 bg-gold/5 px-3 py-2 text-sm text-primary-k" data-testid="billing-pending-change">
                                    Your plan changes to <strong>{PLANS[sub.pending_plan]?.name || sub.pending_plan}</strong>
                                    {sub.pending_effective ? <> on {formatDate(sub.pending_effective)}</> : null}. You keep {PLANS[currentPlan]?.name} access until then.
                                    <button type="button" onClick={keepCurrentPlan} disabled={busy} className="ml-2 text-xs text-primary-k underline hover:no-underline" data-testid="billing-keep-plan">
                                        Keep {PLANS[currentPlan]?.name}
                                    </button>
                                </div>
                            )}
                            {sub?.status === "past_due" && (
                                <div className="mt-3 rounded-md border border-terracotta/60 bg-terracotta/10 px-3 py-2 text-sm text-primary-k" data-testid="billing-past-due">
                                    Your last payment did not go through. Update your card to keep your access.
                                    <button type="button" onClick={openPortal} disabled={busy} className="ml-2 text-xs text-primary-k underline hover:no-underline" data-testid="billing-past-due-update-card">
                                        Update card
                                    </button>
                                </div>
                            )}
                        </div>
                        {activeSub && !sub.cancel_at_period_end && (
                            <button onClick={cancel} disabled={busy} data-testid="cancel-plan-btn" className="inline-flex items-center gap-2 text-sm text-terracotta hover:underline">
                                <X className="h-3.5 w-3.5" /> Cancel plan
                            </button>
                        )}
                    </div>
                </div>

                {/* What You Are Paying For — live view */}
                {account?.summary && (
                    <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="billing-participants-card">
                        <div className="flex items-start justify-between flex-wrap gap-4">
                            <div>
                                <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary-k" /><span className="overline">What you are paying for</span></div>
                                <p className="mt-1 text-sm text-muted-k">Live view of participants and add-ons on this account.</p>
                            </div>
                            <Link to="/app/participants" className="text-sm text-primary-k hover:underline inline-flex items-center gap-1" data-testid="billing-manage-participants">Manage participants <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                        </div>
                        <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div>
                                <div className="overline">Base plan</div>
                                <div className="font-heading text-lg text-primary-k mt-1">{PLANS[currentPlan].name}</div>
                                <div className="text-xs text-muted-k mt-0.5">${basePriceFortnight.toFixed(2)} per fortnight</div>
                            </div>
                            <div>
                                <div className="overline">Participants</div>
                                <div className="font-heading text-lg text-primary-k mt-1" data-testid="billing-participants-count">
                                    {participantsActive} <span className="text-sm text-muted-k">/ {participantsIncluded} included</span>
                                </div>
                                <div className="text-xs text-muted-k mt-0.5">Add participants any time</div>
                            </div>
                            <div>
                                <div className="overline">Add-ons</div>
                                <div className="font-heading text-lg text-primary-k mt-1" data-testid="billing-addons-count">
                                    {addonCount} <span className="text-sm text-muted-k">@ ${ADDON_PRICE_FORTNIGHT.toFixed(2)} per fortnight each</span>
                                </div>
                                <div className="text-xs text-muted-k mt-0.5">
                                    {addonCount > 0 ? `Subtotal $${addonSubtotalFortnight.toFixed(2)} per fortnight` : (currentPlan === "solo" ? "Solo is a one-person plan; add a participant to switch to Family" : "None")}
                                </div>
                            </div>
                            <div>
                                <div className="overline">Fortnightly total</div>
                                <div className="font-heading text-xl text-primary-k mt-1" data-testid="billing-fortnight-total">${fortnightTotal.toFixed(2)}</div>
                                <div className="text-xs text-muted-k mt-0.5">including GST · Billed every 14 days</div>
                            </div>
                        </div>
                        {(account.participants || []).filter((p) => p.status === "ACTIVE").length > 0 && (
                            <ul className="mt-5 divide-y divide-kindred border-t border-kindred" data-testid="billing-participants-list">
                                {(account.participants || []).filter((p) => p.status === "ACTIVE").map((p, idx) => {
                                    const isAddon = !p.is_primary && idx >= participantsIncluded;
                                    return (
                                        <li key={p.id} className="py-3 flex items-center justify-between gap-3 text-sm" data-testid={`billing-participant-${p.id}`}>
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-primary-k">{p.first_name} {p.last_name}</span>
                                                {p.is_primary && (<span className="text-[10px] uppercase tracking-wider bg-gold/20 text-primary-k border border-gold/40 rounded-full px-2 py-0.5">Primary</span>)}
                                            </div>
                                            <span className="text-xs text-muted-k">{isAddon ? `Additional participant, $${ADDON_PRICE_FORTNIGHT.toFixed(2)} per fortnight` : "Included in base plan"}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}

                {/* Plan Options (Solo / Family) — Free tier removed per BILLING-UI-1 v5 §1 */}
                <div className="grid md:grid-cols-2 gap-4">
                    {["solo", "family"].map((p) => {
                        const isCurrent = p === currentPlan;
                        const isRecommended = p === "family" && !isCurrent;
                        const participantsActiveHere = participantsActive;
                        const soloBlocked = p === "solo" && currentPlan === "family" && participantsActiveHere > 1;
                        return (
                            <div key={p} className={`relative rounded-2xl border p-5 ${isCurrent ? "border-primary-k ring-2 ring-primary-k/20 bg-surface" : isRecommended ? "border-primary-k bg-surface" : "border-kindred bg-surface"}`} data-testid={`billing-plan-${p}`}>
                                {isRecommended && (
                                    <span className="absolute -top-3 left-4 bg-primary-k text-white text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                                        Recommended
                                    </span>
                                )}
                                <div className="flex items-baseline justify-between">
                                    <span className="font-heading text-xl text-primary-k">{PLANS[p].name}</span>
                                    <span className="text-sm text-muted-k">{PLANS[p].price} <span className="text-xs">{PLANS[p].period}</span></span>
                                </div>
                                <p className="text-xs text-muted-k mt-1">Billed every 14 days · Includes GST</p>
                                {isCurrent ? (
                                    <div className="mt-4 inline-flex items-center gap-1 text-xs text-sage"><Check className="h-3.5 w-3.5" /> Current</div>
                                ) : sub?.pending_plan === p ? (
                                    <div className="mt-4 inline-flex items-center gap-1 text-xs text-gold" data-testid={`billing-plan-scheduled-${p}`}>
                                        <Check className="h-3.5 w-3.5" /> Scheduled{sub.pending_effective ? ` for ${formatDate(sub.pending_effective)}` : ""}
                                    </div>
                                ) : activeSub ? (
                                    <>
                                        <button
                                            onClick={() => changePlan(p)}
                                            disabled={busy || soloBlocked || !!sub?.pending_plan}
                                            data-testid={`billing-switch-${p}`}
                                            className="mt-4 w-full text-sm bg-primary-k text-white rounded-md py-2 hover:bg-[#091D33] disabled:opacity-60"
                                        >
                                            Switch to {PLANS[p].name}
                                        </button>
                                        {soloBlocked && (
                                            <p className="text-xs text-muted-k mt-2" data-testid={`billing-solo-blocked-hint`}>
                                                Solo is a one-person plan. Remove other participants first, then you can switch to Solo. Or, we&apos;ll automatically move you to Solo when your participant count drops to one.
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <button onClick={() => startCheckout(p)} disabled={busy} data-testid={`billing-start-${p}`} className="mt-4 w-full text-sm bg-primary-k text-white rounded-md py-2 hover:bg-[#091D33] disabled:opacity-60 inline-flex items-center justify-center gap-2">
                                        Start {PLANS[p].name} <ArrowUpRight className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Payment Method */}
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="billing-payment-method-card">
                    <div className="flex items-start justify-between flex-wrap gap-3">
                        <div>
                            <div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary-k" /><span className="overline">Payment method</span></div>
                            <p className="mt-1 text-sm text-muted-k">Update your card, add a backup card, or set a default. We use Stripe&apos;s hosted card portal so Wayly never handles raw card details.</p>
                            <p className="mt-1 text-xs text-muted-k" data-testid="billing-backup-card-note">
                                If your main card ever fails, we&apos;ll try your backup automatically so your access is not interrupted.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={openPortal}
                            disabled={busy || !activeSub}
                            data-testid="billing-open-portal"
                            className="text-sm bg-primary-k text-white rounded-md px-4 py-2 hover:bg-[#091D33] disabled:opacity-60 inline-flex items-center gap-2"
                        >
                            Manage payment method <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>

                {/* Billing History */}
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="billing-history-card">
                    <div className="flex items-center gap-2"><Mailbox className="h-4 w-4 text-primary-k" /><span className="overline">Billing history</span></div>
                    <p className="mt-1 text-sm text-muted-k">Every charge, receipt, and refund. Download a Stripe-hosted PDF for each.</p>
                    {invoices === null ? (
                        <p className="mt-4 text-sm text-muted-k">Loading…</p>
                    ) : invoices.length === 0 ? (
                        <p className="mt-4 text-sm text-muted-k" data-testid="billing-history-empty">
                            No invoices yet. Your first charge will appear here once your trial converts.
                        </p>
                    ) : (
                        <div className="mt-4 overflow-x-auto">
                            <table className="w-full text-sm min-w-[520px]" data-testid="billing-history-table">
                                <thead>
                                    <tr className="text-left text-xs text-muted-k border-b border-kindred">
                                        <th className="py-2 pr-3">Date</th>
                                        <th className="py-2 pr-3">Description</th>
                                        <th className="py-2 pr-3">Amount</th>
                                        <th className="py-2 pr-3">Status</th>
                                        <th className="py-2">PDF</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.map((inv) => (
                                        <tr key={inv.id} className="border-b border-kindred/60" data-testid={`billing-history-row-${inv.id}`}>
                                            <td className="py-2.5 pr-3 text-primary-k tabular-nums">{inv.created ? formatDate(new Date(inv.created * 1000).toISOString()) : "—"}</td>
                                            <td className="py-2.5 pr-3 text-muted-k">{inv.description || "Subscription"}</td>
                                            <td className="py-2.5 pr-3 text-primary-k tabular-nums">${Number((inv.amount_paid || inv.amount_due || 0) / 100).toFixed(2)}</td>
                                            <td className="py-2.5 pr-3">
                                                <span className={`text-xs uppercase tracking-wider ${inv.status === "paid" ? "text-sage" : inv.status === "open" || inv.status === "uncollectible" ? "text-terracotta" : "text-muted-k"}`}>{inv.status || "—"}</span>
                                            </td>
                                            <td className="py-2.5">
                                                {inv.invoice_pdf ? (
                                                    <a href={inv.invoice_pdf} target="_blank" rel="noopener noreferrer" className="text-primary-k underline hover:no-underline" data-testid={`billing-history-pdf-${inv.id}`}>
                                                        Download
                                                    </a>
                                                ) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
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
        catch (err) { toast.error(extractErrorMessage(err, "Could not send invite")); }
        finally { setSending(false); }
    };
    const remove = async (uid) => { if (!window.confirm("Remove this member?")) return; try { await api.delete(`/household/members/${uid}`); toast.success("Member removed"); await load(); } catch (err) { toast.error(extractErrorMessage(err, "Could not remove")); } };
    const onFamily = user?.plan === "family";
    return (
        <div className="space-y-6" data-testid="settings-members">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Family Members</h2>
                <p className="text-sm text-muted-k mt-1">Up to 5 people per household (including you). Everyone sees the statements and audit log.</p>
            </div>
            {!onFamily ? (
                <div className="bg-surface border border-gold rounded-2xl p-6" data-testid="members-upgrade-gate">
                    <h3 className="font-heading text-xl text-primary-k">Inviting Siblings Is on Family Plan</h3>
                    <p className="text-sm text-muted-k mt-2">Family plan adds 5 seats, role-based permissions, and the Sunday digest.</p>
                    <Link to="/settings/billing" className="mt-4 inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#091D33]" data-testid="members-upgrade-cta">Upgrade to Family</Link>
                </div>
            ) : (<>
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="invite-card">
                    <h3 className="font-heading text-lg text-primary-k">Invite Someone</h3>
                    <form onSubmit={invite} className="mt-4 grid sm:grid-cols-2 gap-3">
                        <label className="block sm:col-span-2"><span className="text-sm text-muted-k">Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required data-testid="invite-email-input" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" /></label>
                        <label className="block"><span className="text-sm text-muted-k">Role</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="invite-role-select" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"><option value="family_member">Family member (sibling / partner)</option><option value="advisor">Advisor / GP (read-only)</option></select></label>
                        <label className="block"><span className="text-sm text-muted-k">Optional note</span><input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Hey sis, looping you in…" data-testid="invite-note-input" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k" /></label>
                        <div className="sm:col-span-2"><button type="submit" disabled={sending} data-testid="invite-submit-btn" className="inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#091D33] disabled:opacity-60">{sending && <Loader2 className="h-4 w-4 animate-spin" />}<Mail className="h-4 w-4" /> Send invitation</button></div>
                    </form>
                </div>
                <div className="bg-surface border border-kindred rounded-2xl p-6" data-testid="members-list-card">
                    <h3 className="font-heading text-lg text-primary-k">Active Members</h3>
                    {loading ? (<div className="mt-4"><Skeleton variant="list" rows={3} /></div>) : (
                        <ul className="mt-4 space-y-2">
                            {data.members.map((m) => (<li key={m.user_id || m.email} className="flex items-center justify-between rounded-lg p-3 bg-surface-2" data-testid={`member-row-${m.email}`}><div><div className="text-sm font-medium text-primary-k">{m.name} <span className="text-xs text-muted-k capitalize ml-2">{m.role?.replace("_", " ")}</span></div><div className="text-xs text-muted-k">{m.email}</div></div>{m.role !== "primary" && (<button onClick={() => remove(m.user_id)} data-testid={`member-remove-${m.email}`} className="text-xs text-terracotta hover:underline inline-flex items-center gap-1"><Trash2 className="h-3 w-3" /> Remove</button>)}</li>))}
                        </ul>
                    )}
                    {data.invites?.length > 0 && (<><h4 className="font-medium text-primary-k mt-6 mb-2 text-sm">Pending invites</h4><ul className="space-y-2">{data.invites.map((i) => (<li key={i.token} className="flex items-center justify-between rounded-lg p-3 bg-gold/10 border border-gold/30 text-sm"><div><div className="font-medium text-primary-k">{i.email} <span className="text-xs text-muted-k capitalize ml-2">{i.role?.replace("_", " ")}</span></div><div className="text-xs text-muted-k">Expires {formatDate(i.expires_at)}</div></div><span className="text-xs text-muted-k">Pending</span></li>))}</ul></>)}
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
            toast.error(extractErrorMessage(err, "Could not send digest"));
        } finally { setSending(false); }
    };

    const onFamily = user?.plan === "family";
    return (
        <div className="space-y-6" data-testid="settings-digest">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Weekly Family Digest</h2>
                <p className="text-sm text-muted-k mt-1 max-w-2xl">
                    A short, human email that lands every week with what <span className="font-medium text-primary-k">you</span> paid attention to. Siblings and advisors stay in the loop without ever opening the app, wellbeing check-ins, alerts, chat summary, thread highlights. All one scroll.
                </p>
            </div>

            {!onFamily && (
                <div className="bg-surface border border-gold rounded-2xl p-6">
                    <h3 className="font-heading text-xl text-primary-k">Sending digests is on Family plan</h3>
                    <p className="text-sm text-muted-k mt-2">You can preview what it looks like on any plan, sending requires Family (because it goes to up to 5 people).</p>
                    <Link to="/settings/billing" className="mt-4 inline-flex items-center gap-2 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#091D33]">Upgrade to Family</Link>
                </div>
            )}

            {loading ? (
                <Skeleton variant="card" rows={5} />
            ) : !digest ? (
                <div className="bg-surface border border-kindred rounded-2xl p-6 text-sm text-muted-k">Create a household first to preview the digest.</div>
            ) : (<>
                <div className="bg-surface border border-kindred rounded-2xl overflow-hidden" data-testid="digest-preview-card">
                    <div className="bg-primary-k text-white px-6 py-4">
                        <div className="font-heading text-xl">Wayly, the week at {digest.household_name}&apos;s</div>
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
                        {digest.chat_questions_asked > 0 && (<p className="text-xs text-muted-k italic">{digest.caregiver_first_name} asked Wayly <strong>{digest.chat_questions_asked}</strong> question{digest.chat_questions_asked !== 1 ? "s" : ""} this week.</p>)}
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button onClick={sendNow} disabled={!onFamily || sending} data-testid="digest-send-btn" className="inline-flex items-center gap-2 bg-gold text-white rounded-md px-5 py-2.5 text-sm font-semibold hover:brightness-95 disabled:opacity-60">
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
    anomaly_alerts: { label: "Anomaly alerts", desc: "When Wayly flags unusual charges on a new statement." },
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
                <p className="text-sm text-muted-k mt-1">You decide what&apos;s worth an email and an in-app bell.</p>
            </div>
            {loading ? (<Skeleton variant="list" rows={5} />) : (
                <div className="bg-surface border border-kindred rounded-2xl divide-y divide-kindred">
                    {Object.entries(NOTIF_LABELS).map(([key, meta]) => (
                        <div key={key} className="flex items-start justify-between gap-4 p-5" data-testid={`notif-row-${key}`}>
                            <div>
                                <div className="text-sm font-medium text-primary-k">{meta.label}</div>
                                <p className="text-xs text-muted-k mt-0.5">{meta.desc}</p>
                            </div>
                            <button onClick={() => toggle(key)} disabled={saving} data-testid={`notif-toggle-${key}`} role="switch" aria-checked={!!prefs[key]} className={`switch-track relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${prefs[key] ? "bg-primary-k" : "bg-muted-k/40"} disabled:opacity-50`}>
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
    // UXF-1 v3: appearance controlled via `useTheme()` from `@/uxf`. The
    // ThemeProvider handles localStorage writes, `data-theme` attribute
    // mirroring, and system-preference fallback. When the person picks
    // "System" we clear the manual override so the OS-level preference
    // wins from that point on.
    const { theme, override, systemPref, setTheme, useSystemPreference: clearOverride } = useTheme();
    const currentSelection = override || "system";

    // Legacy accessibility widget sync, keep the a11y flags store in
    // step so a subsequent boot does not strip our dark class.
    useEffect(() => {
        try {
            const raw = localStorage.getItem("wayly_a11y_v1");
            const prefs = raw
                ? JSON.parse(raw)
                : { fontScale: 1, highContrast: false, dark: false, underlineLinks: false, reduceMotion: false };
            prefs.dark = (theme === "dark");
            localStorage.setItem("wayly_a11y_v1", JSON.stringify(prefs));
        } catch (_e) { /* noop */ }
    }, [theme]);

    const options = [
        { v: "light",  l: "Light",  Icon: Sun,  desc: "Wayly's default warm palette." },
        { v: "dark",   l: "Dark",   Icon: Moon, desc: "Lower contrast for late-night reviewing." },
    ];
    if (isEnabled("uxf_v3.theme_toggle")) {
        options.push({
            v: "system", l: "System", Icon: Sun,
            desc: `Follow your device (currently ${systemPref}).`,
        });
    }

    const pick = (v) => {
        if (v === "system") clearOverride();
        else setTheme(v);
    };

    return (
        <div className="space-y-6" data-testid="settings-appearance">
            <div>
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Appearance</h2>
                <p className="text-sm text-muted-k mt-1">Pick the mode that&apos;s easier on your eyes, especially at night.</p>
                <p className="text-xs text-muted-k mt-2" data-testid="appearance-scope-caption">
                    Your choice applies everywhere on Wayly, on this device.
                </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl">
                {options.map((o) => (
                    <button
                        key={o.v}
                        onClick={() => pick(o.v)}
                        data-testid={`theme-${o.v}`}
                        className={`text-left rounded-2xl border p-5 transition-all ${
                            currentSelection === o.v
                                ? "border-primary-k ring-2 ring-primary-k/20 bg-surface"
                                : "border-kindred bg-surface hover:bg-surface-2"
                        }`}
                    >
                        <o.Icon className="h-5 w-5 text-primary-k" />
                        <div className="mt-3 font-medium text-primary-k">{o.l}</div>
                        <div className="text-xs text-muted-k mt-1">{o.desc}</div>
                        {currentSelection === o.v && (
                            <div className="mt-3 inline-flex items-center gap-1 text-xs text-sage">
                                <Check className="h-3.5 w-3.5" /> Current
                            </div>
                        )}
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
                <h2 className="font-heading text-2xl text-primary-k tracking-tight">Your Usage</h2>
                <p className="text-sm text-muted-k mt-1">Everything Wayly has done for you since you joined.</p>
            </div>
            {loading ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="usage-skeleton">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} variant="stat" />)}
                </div>
            ) : !data ? null : (
                <>
                    <p className="text-sm text-muted-k">On the <span className="font-medium capitalize text-primary-k">{data.plan}</span> plan since {data.since ? formatDate(data.since) : "recently"}.</p>
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
function MfaPanel() {
    const { user, refreshUser } = useAuth();
    const enabled = !!user?.totp_enabled;
    const [step, setStep] = useState("idle"); // idle | setup | verify | enabled
    const [qr, setQr] = useState(null);
    const [setupToken, setSetupToken] = useState(null);
    const [secret, setSecret] = useState(null);
    const [code, setCode] = useState("");
    const [backupCodes, setBackupCodes] = useState(null);
    const [busy, setBusy] = useState(false);
    // disable flow
    const [disablePassword, setDisablePassword] = useState("");
    const [disableCode, setDisableCode] = useState("");

    const startSetup = async () => {
        setBusy(true);
        try {
            const { data } = await api.post("/auth/mfa/setup");
            setQr(data.qr_data_uri);
            setSecret(data.secret);
            setSetupToken(data.setup_token);
            setStep("setup");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not start 2FA setup"));
        } finally { setBusy(false); }
    };

    const confirmSetup = async () => {
        setBusy(true);
        try {
            const { data } = await api.post("/auth/mfa/enable", { setup_token: setupToken, code: code.trim() });
            setBackupCodes(data.backup_codes || []);
            setStep("enabled");
            toast.success("Two-factor enabled.");
            await refreshUser();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Code didn't match, try the latest 6 digits"));
        } finally { setBusy(false); }
    };

    const disable = async () => {
        if (!window.confirm("Disable two-factor authentication? Your account will be less secure.")) return;
        setBusy(true);
        try {
            await api.post("/auth/mfa/disable", { password: disablePassword, code: disableCode || undefined });
            toast.success("Two-factor disabled.");
            setDisablePassword(""); setDisableCode("");
            await refreshUser();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not disable 2FA"));
        } finally { setBusy(false); }
    };

    return (
        <div className="bg-surface border border-kindred rounded-2xl p-6 max-w-xl" data-testid="security-mfa-panel">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-heading text-lg text-primary-k">Two-factor authentication</h3>
                    <p className="text-sm text-muted-k mt-1">
                        Add a 6-digit code from your authenticator app to every sign-in.
                    </p>
                </div>
                <span
                    className={`text-xs px-2 py-1 rounded-full ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                    data-testid="security-mfa-status"
                >
                    {enabled ? "Enabled" : "Disabled"}
                </span>
            </div>

            {!enabled && step === "idle" && (
                <button
                    onClick={startSetup}
                    disabled={busy}
                    data-testid="security-mfa-enable-btn"
                    className="mt-4 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#091D33] disabled:opacity-60"
                >
                    {busy ? "Preparing…" : "Enable two-factor"}
                </button>
            )}

            {step === "setup" && (
                <div className="mt-4 space-y-4">
                    <p className="text-sm text-muted-k">1. Scan this QR code with your authenticator app:</p>
                    {qr && <img src={qr} alt="2FA QR code" className="w-44 h-44 rounded-lg border border-kindred" />}
                    <details className="text-xs text-muted-k">
                        <summary className="cursor-pointer">Can&apos;t scan? Enter secret manually</summary>
                        <code className="block mt-2 break-all p-2 bg-surface-2 rounded">{secret}</code>
                    </details>
                    <label className="block">
                        <span className="text-sm text-muted-k">2. Enter the 6-digit code from the app:</span>
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            inputMode="numeric"
                            data-testid="security-mfa-verify-input"
                            className="mt-1 w-40 rounded-md border border-kindred bg-surface px-3 py-2 text-lg tracking-widest font-mono"
                            placeholder="123456"
                        />
                    </label>
                    <button
                        onClick={confirmSetup}
                        disabled={busy || code.length < 6}
                        data-testid="security-mfa-verify-btn"
                        className="bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#091D33] disabled:opacity-60"
                    >
                        {busy ? "Verifying…" : "Verify and enable"}
                    </button>
                </div>
            )}

            {step === "enabled" && backupCodes && (
                <div className="mt-4 space-y-3">
                    <p className="text-sm font-medium text-primary-k">Backup codes, save these now</p>
                    <p className="text-xs text-muted-k">Each can be used once if you lose your authenticator. Store them in a password manager, they will not be shown again.</p>
                    <div className="grid grid-cols-2 gap-2 p-3 bg-surface-2 rounded-lg font-mono text-sm" data-testid="security-mfa-backup-codes">
                        {backupCodes.map((c) => <span key={c}>{c}</span>)}
                    </div>
                </div>
            )}

            {enabled && (
                <div className="mt-4 space-y-3">
                    <p className="text-sm text-muted-k">Disable 2FA (not recommended). Requires your current password.</p>
                    <input
                        type="password"
                        value={disablePassword}
                        onChange={(e) => setDisablePassword(e.target.value)}
                        placeholder="Current password"
                        data-testid="security-mfa-disable-password"
                        className="w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm"
                    />
                    <input
                        value={disableCode}
                        onChange={(e) => setDisableCode(e.target.value)}
                        placeholder="Current 6-digit code (optional)"
                        inputMode="numeric"
                        data-testid="security-mfa-disable-code"
                        className="w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm font-mono"
                    />
                    <button
                        onClick={disable}
                        disabled={busy || !disablePassword}
                        data-testid="security-mfa-disable-btn"
                        className="text-sm text-terracotta hover:underline disabled:opacity-60"
                    >
                        {busy ? "Disabling…" : "Disable two-factor"}
                    </button>
                </div>
            )}
        </div>
    );
}

function SecurityTab() {
    const { user } = useAuth();
    const [sending, setSending] = useState(false);
    const [latestStmtId, setLatestStmtId] = useState(null);
    useEffect(() => {
        // Fetch the latest active statement so the "see your audit trail"
        // CTA deep-links straight to a real, populated audit log instead
        // of dumping the user on an empty page.
        (async () => {
            try {
                const { data } = await api.get("/statements");
                if (Array.isArray(data) && data.length > 0) {
                    setLatestStmtId(data[0].id);
                }
            } catch { /* silent, privacy CTA just hides */ }
        })();
    }, []);
    const sendReset = async () => { setSending(true); try { await api.post("/auth/forgot", { email: user.email }); toast.success("Password reset link sent."); } catch (err) { toast.error(extractErrorMessage(err, "Could not send reset link")); } finally { setSending(false); } };
    return (
        <div className="space-y-6" data-testid="settings-security">
            <div><h2 className="font-heading text-2xl text-primary-k tracking-tight">Security and Data</h2><p className="text-sm text-muted-k mt-1">Manage your password, sign-in, and what we record about your data.</p></div>
            <div className="bg-surface border border-kindred rounded-2xl p-6 max-w-xl">
                <h3 className="font-heading text-lg text-primary-k">Password</h3>
                <p className="text-sm text-muted-k mt-1">We will email you a secure link to set a new password.</p>
                <button onClick={sendReset} disabled={sending} data-testid="security-send-reset-btn" className="mt-4 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#091D33] disabled:opacity-60">{sending ? "Sending…" : "Send me a reset link"}</button>
            </div>
            <MfaPanel />
            <div className="bg-surface border border-kindred rounded-2xl p-6 max-w-xl" data-testid="security-audit-trail-card">
                <h3 className="font-heading text-lg text-primary-k">Your data audit trail</h3>
                <p className="text-sm text-muted-k mt-1 leading-relaxed">
                    Every time we accept, supersede, archive, or delete one of your statements, we write an immutable row to your audit log. You can see it any time, that&apos;s the same record our team uses if you ever ask &ldquo;what changed?&rdquo;.
                </p>
                {latestStmtId ? (
                    <Link
                        to={`/app/statements/${latestStmtId}/audit-log`}
                        data-testid="security-view-audit-log"
                        className="mt-4 inline-flex items-center gap-2 text-sm border border-kindred rounded-md px-4 py-2 text-primary-k hover:bg-surface-2"
                    >
                        See the audit log for your most recent statement →
                    </Link>
                ) : (
                    <p className="mt-3 text-xs text-muted-k italic">Upload a statement to see your first audit trail.</p>
                )}
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
        } catch (err) { toast.error(extractErrorMessage(err, "Could not delete")); }
        finally { setBusy(false); }
    };
    return (
        <div className="space-y-6" data-testid="settings-danger">
            <div><h2 className="font-heading text-2xl text-terracotta tracking-tight">Danger Zone</h2><p className="text-sm text-muted-k mt-1">Actions here can&apos;t be reversed. Proceed carefully.</p></div>
            <div className="bg-surface border-2 border-terracotta/40 rounded-2xl p-6 max-w-2xl">
                <h3 className="font-heading text-lg text-terracotta">Delete your account</h3>
                <p className="text-sm text-muted-k mt-2">We will anonymise your email and name, cancel your plan, and remove you from your household. The audit trail stays (legally required) but shows &quot;Deleted user&quot;.</p>
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
