import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Check, Loader2, Briefcase, Eye, EyeOff, Users } from "lucide-react";
import WaylyLogo from "@/components/WaylyLogo";
import { toast } from "sonner";
import { api, extractErrorMessage } from "@/lib/api";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { FieldLabelText } from "@/components/RequiredHint";
import PasswordStrength, { evaluatePassword } from "@/components/PasswordStrength";

import SeoHead from "@/seo/SeoHead";
import { track } from "@/lib/analytics";
import { SEO } from "@/seo/pageConfig";
import { CAREGIVER_RELATIONSHIPS } from "./onboarding/constants";
import { TOOL_COUNT } from "@/config/toolRegistry";

const PLANS = [
    {
        v: "solo",
        title: "Solo",
        price: "$24.50",
        period: "per fortnight",
        featured: false,
        bullets: [
            `All ${TOOL_COUNT} AI tools, unlimited`,
            "Statement Decoder & Invoice Checker",
            "Anomaly Watch & budget tracker",
            "Quarterly Pacing dashboard",
            "Support Plan Reviewer & Letters tool",
            "Document Vault with secure storage",
            "1 Caregiver seat, 1 Participant tracked",
            "Priority email support",
        ],
    },
    {
        v: "family",
        title: "Family",
        price: "$49.50",
        period: "per fortnight",
        featured: true,
        badge: "Most popular",
        bullets: [
            `Everything in Solo · all ${TOOL_COUNT} AI tools`,
            "Track two parents on one plan",
            "Up to 5 Caregiver seats",
            "Sunday digest emails to the whole family",
            "Adviser & GP role-based sharing links",
            "Family Wall for shared updates & notes",
            "Reassessment letter generator",
            "Invoice + statement history vault",
            "Priority support with same-day response",
        ],
    },
];

export default function Signup() {
    const { signup } = useAuth();
    const nav = useNavigate();
    const [params] = useSearchParams();
    const inviteToken = params.get("invite") || null;
    const isRetiredFreePlan = params.get("plan") === "free";
    // Free plan retired: any ?plan=free deep-link redirects to clean /signup with default Family plan.
    useEffect(() => {
        if (isRetiredFreePlan) {
            nav("/signup", { replace: true });
        }
    }, [isRetiredFreePlan, nav]);
    const [invite, setInvite] = useState(null); // {client_name, client_email, adviser_name, notes}
    const [form, setForm] = useState({
        first_name: "",
        last_name: "",
        name: "",  // kept in sync with `${first_name} ${last_name}` for the backend signup call
        email: "",
        mobile: "",
        password: "",
        role: "caregiver",
        // PERSONA-1 §C, persona details captured on signup so the account
        // is persona-correct from day zero.
        care_recipient_first_name: "",
        care_recipient_last_name: "",
        care_recipient_pronouns: "unknown",
        caregiver_relationship: "",
        plan: params.get("plan") && ["solo", "family"].includes(params.get("plan")) ? params.get("plan") : "family",
    });
    const [mobileError, setMobileError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    // Family plan, inline second-participant intent. Streamlines onboarding
    // by letting the caregiver flag now that they'll add a 2nd person, so
    // step 4 of onboarding can auto-steer them (both email and Google flows).
    const [addSecondParticipant, setAddSecondParticipant] = useState(false);
    const [secondParticipant, setSecondParticipant] = useState({
        first_name: "",
        relationship: "",
    });

    // If the user switches away from Family, clear the second-participant intent
    // so nothing lingers into onboarding.
    useEffect(() => {
        if (form.plan !== "family") {
            setAddSecondParticipant(false);
        }
    }, [form.plan]);

    // Persist the second-participant intent to localStorage so BOTH email and
    // Google signup flows can pick it up during onboarding. The onboarding
    // flow reads and clears this key after the second participant is saved.
    const persistSecondParticipantIntent = () => {
        try {
            if (form.plan === "family" && addSecondParticipant && secondParticipant.first_name.trim()) {
                localStorage.setItem("wayly_second_participant_intent", JSON.stringify({
                    first_name: secondParticipant.first_name.trim(),
                    relationship: (secondParticipant.relationship || "").trim() || null,
                }));
            } else {
                localStorage.removeItem("wayly_second_participant_intent");
            }
        } catch { /* localStorage disabled, non-fatal */ }
    };

    // Pre-fill name + email when an adviser-invite token is present.
    useEffect(() => {
        if (!inviteToken) return;
        let alive = true;
        (async () => {
            try {
                const { data } = await api.get(`/public/adviser/invite/${inviteToken}`);
                if (!alive) return;
                setInvite(data);
                setForm((f) => {
                    const full = data.client_name || "";
                    const [fn, ...rest] = full.split(/\s+/);
                    return {
                        ...f,
                        first_name: f.first_name || fn || "",
                        last_name: f.last_name || rest.join(" "),
                        name: f.name || full,
                        email: f.email || data.client_email || "",
                    };
                });
            } catch (err) {
                if (!alive) return;
                const errCode = err?.response?.data?.detail?.error;
                if (errCode === "already_accepted") {
                    toast.message("This invitation has already been accepted, please sign in instead.");
                } else if (errCode === "invite_not_found") {
                    toast.message("That invitation link is no longer valid. You can still sign up below.");
                }
            }
        })();
        return () => { alive = false; };
    }, [inviteToken]);

    const submit = async (e) => {
        e.preventDefault();
        // Mobile is optional now, but if provided must match AU format.
        const mobileClean = (form.mobile || "").replace(/\s+/g, "");
        if (mobileClean) {
            const auMobileRe = /^(\+614\d{8}|04\d{8})$/;
            if (!auMobileRe.test(mobileClean)) {
                setMobileError("Enter an Australian mobile (04XXXXXXXX or +614XXXXXXXX), or leave blank.");
                return;
            }
        }
        setMobileError("");
        const fullName = `${form.first_name.trim()} ${form.last_name.trim()}`.trim();
        const pw = evaluatePassword(form.password, { email: form.email, name: fullName });
        if (!pw.valid) {
            toast.error(pw.containsIdentity ? "Password shouldn't include your name or email" : "Password needs 8+ chars with upper, lower, number, and symbol");
            return;
        }
        setSubmitting(true);
        // Family plan: persist inline second-participant intent so onboarding
        // (whether reached via email or Google) can steer accordingly.
        persistSecondParticipantIntent();
        try {
            const u = await signup({
                ...form,
                name: fullName,
                mobile: mobileClean,
                invite: inviteToken || undefined,
            });
            track.signup({ plan: form.plan, has_invite: Boolean(inviteToken) });
            track.identify(u);
            // PERSONA-1 §C, persist the persona choice on signup so the
            // account is persona-correct from day zero. Best-effort: any
            // failure here shouldn't block trial start.
            try {
                const isParticipant = form.role === "participant";
                await api.put("/persona", {
                    viewer_persona: form.role,
                    is_authorised_representative: false,
                    care_recipient: isParticipant
                        ? { is_self: true, first_name: form.first_name || null, last_name: form.last_name || null, pronouns: "unknown", relationship_to_account: null }
                        : {
                            is_self: false,
                            first_name: (form.care_recipient_first_name || "").trim() || null,
                            last_name: (form.care_recipient_last_name || "").trim() || null,
                            pronouns: form.care_recipient_pronouns || "unknown",
                            relationship_to_account: form.caregiver_relationship || null,
                        },
                });
            } catch (_) { /* non-fatal, user can complete this in Settings later */ }

            // Pre-create the SECOND participant (Caren-style stub) from the
            // "Add one more person" signup toggle, so it's in the account
            // BEFORE the user disappears into Stripe Checkout / onboarding.
            // Applies to BOTH role=participant + Family and role=caregiver
            // + Family. The primary participant is created by the user's own
            // onboarding a step later; the stub is marked is_primary=false
            // so the primary slot stays open for them.
            if (form.plan === "family" && addSecondParticipant && secondParticipant.first_name.trim()) {
                try {
                    await api.post("/v2/participants", {
                        first_name: secondParticipant.first_name.trim(),
                        last_name: "",
                        statement_format: "unknown",
                        is_primary: false,
                    });
                } catch (_) { /* non-fatal: the second-participant intent in
                                 localStorage is a backup so the user can
                                 finish setup from All Done. */ }
            }
            // Paid plans → route through Stripe Checkout so the card is
            // captured up front. Stripe's 7-day trial (subscription_data.trial_period_days)
            // means the card is validated but not charged until day 8. This
            // replaces the old no-card /billing/start-trial path so new
            // signups always have payment on file.
            if (form.plan === "solo" || form.plan === "family") {
                try {
                    const { data } = await api.post("/payments/checkout", {
                        plan: form.plan,
                        origin_url: window.location.origin,
                        trial_days: 7,
                    });
                    track.trialStart({ plan: form.plan });
                    if (data?.url) {
                        window.location.href = data.url;
                        return;
                    }
                    toast.error("Could not start checkout, please try again from Pricing.");
                    nav("/pricing");
                } catch (err) {
                    toast.error(extractErrorMessage(err, "Could not start checkout."));
                    nav("/pricing");
                }
            } else {
                toast.success(`Welcome, ${u.name.split(" ")[0]}`);
                nav("/app");
            }
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not create account"));
        } finally {
            setSubmitting(false);
        }
    };

    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <div className="min-h-screen bg-kindred px-6 py-10">
            <SeoHead {...SEO.signup} noindex={isRetiredFreePlan || SEO.signup.noindex} />
            <div className="mx-auto max-w-6xl">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <WaylyLogo size={32} className="rounded-md" />
                    <span className="font-heading text-lg text-primary-k">Wayly</span>
                </Link>

                {invite && (
                    <div data-testid="signup-invite-banner" className="mb-6 bg-primary-k text-white rounded-2xl p-5 flex items-start gap-4">
                        <div className="h-10 w-10 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0">
                            <Briefcase className="h-5 w-5 text-gold" />
                        </div>
                        <div className="flex-1">
                            <div className="text-xs uppercase tracking-wider text-white/70">Adviser invitation</div>
                            <h2 className="font-heading text-xl mt-0.5">
                                {invite.adviser_name} invited you to Wayly
                            </h2>
                            <p className="mt-1 text-sm text-white/85 leading-relaxed">
                                Your account will link to {invite.adviser_name.split(" ")[0]}&apos;s adviser dashboard so they can help you stay on top of your Support at Home statements and budget. You can revoke access any time from Settings.
                            </p>
                            {invite.notes && (
                                <p className="mt-2 text-sm italic text-white/70">&ldquo;{invite.notes}&rdquo;</p>
                            )}
                        </div>
                    </div>
                )}

                <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
                    {/* PERSONA + ACCOUNT (7 of 12 cols) */}
                    <div className="lg:col-span-7 order-2 lg:order-1">
                        <div className="bg-surface border border-kindred rounded-2xl p-5 lg:p-6">
                            <span className="overline">Your details</span>
                            <h1 className="font-heading text-2xl text-primary-k mt-1 tracking-tight">
                                Start your 7-day free trial
                            </h1>
                            <p className="mt-1.5 text-xs text-muted-k leading-relaxed">
                                {"No card needed. Cancel any time. Two minutes so Wayly speaks in the right voice from day one."}
                            </p>

                            <div className="mt-4">
                                <GoogleSignInButton
                                    testid="signup-google"
                                    planIntent={form.plan}
                                    label="Sign up with Google"
                                    onBeforeClick={persistSecondParticipantIntent}
                                />
                            </div>

                            <div className="my-3 flex items-center gap-3 text-xs text-muted-k">
                                <span className="flex-1 h-px bg-kindred"></span>
                                <span>or with email</span>
                                <span className="flex-1 h-px bg-kindred"></span>
                            </div>

                            <form onSubmit={submit} className="space-y-3">
                                {/* Persona-first, matches PERSONA-1 §C ordering */}
                                <fieldset>
                                    <span className="text-sm text-muted-k">I am the…</span>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        {[
                                            { v: "caregiver", label: "Caregiver", sub: "I help someone" },
                                            { v: "participant", label: "Participant", sub: "I receive care" },
                                        ].map((o) => (
                                            <button
                                                key={o.v}
                                                type="button"
                                                data-testid={`signup-role-${o.v}`}
                                                onClick={() => setForm((f) => ({ ...f, role: o.v }))}
                                                className={`text-left rounded-lg border p-3 transition-colors ${
                                                    form.role === o.v
                                                        ? "border-primary-k bg-surface-2 ring-2 ring-primary-k/20"
                                                        : "border-kindred hover:bg-surface-2"
                                                }`}
                                            >
                                                <div className="font-medium text-primary-k text-sm">{o.label}</div>
                                                <div className="text-xs text-muted-k">{o.sub}</div>
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>

                                {form.role === "caregiver" && (
                                    <div
                                        className="rounded-lg border border-kindred bg-surface-2 p-3 space-y-3"
                                        data-testid="signup-caregiver-fields"
                                    >
                                        <p className="text-xs text-muted-k">
                                            About the person you help. All optional, takes 30 seconds now, saves editing later.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <label className="block">
                                                <FieldLabelText optional>Their first name</FieldLabelText>
                                                <input
                                                    value={form.care_recipient_first_name}
                                                    onChange={update("care_recipient_first_name")}
                                                    placeholder="e.g. Louisa"
                                                    data-testid="signup-cr-first-name"
                                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                                />
                                            </label>
                                            <label className="block">
                                                <FieldLabelText optional>Their last name</FieldLabelText>
                                                <input
                                                    value={form.care_recipient_last_name}
                                                    onChange={update("care_recipient_last_name")}
                                                    placeholder="e.g. Davids"
                                                    data-testid="signup-cr-last-name"
                                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                                />
                                            </label>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <label className="block">
                                                <FieldLabelText optional>Your relationship</FieldLabelText>
                                                <select
                                                    value={form.caregiver_relationship}
                                                    onChange={update("caregiver_relationship")}
                                                    data-testid="signup-cr-relationship"
                                                    className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                                >
                                                    <option value="">Select…</option>
                                                    {CAREGIVER_RELATIONSHIPS.map((r) => (
                                                        <option key={r.v} value={r.v}>{r.label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                        <label className="block">
                                            <FieldLabelText optional>Their pronouns</FieldLabelText>
                                            <select
                                                value={form.care_recipient_pronouns}
                                                onChange={update("care_recipient_pronouns")}
                                                data-testid="signup-cr-pronouns"
                                                className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                            >
                                                <option value="unknown">Prefer not to say</option>
                                                <option value="she_her">She / her</option>
                                                <option value="he_him">He / him</option>
                                                <option value="they_them">They / them</option>
                                            </select>
                                        </label>
                                    </div>
                                )}

                                {/* Family plan, inline second-participant intent.
                                    Available for BOTH caregiver + participant roles when Family
                                    plan is selected. For caregivers, "the second person" is a
                                    second person they care for. For participants, "the second
                                    person" is another participant (spouse, sibling, or the
                                    caregiver themselves) they want on the plan. Either way, the
                                    Family plan covers two people, and the second onboarding
                                    picks up where this one leaves off. */}
                                {form.plan === "family" && (
                                    <div
                                        className="rounded-lg border-2 border-gold/50 bg-gradient-to-br from-gold/15 to-gold/5 p-3 space-y-3"
                                        data-testid="signup-second-participant-block"
                                    >
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={addSecondParticipant}
                                                onChange={(e) => setAddSecondParticipant(e.target.checked)}
                                                data-testid="signup-second-participant-toggle"
                                                className="mt-1 h-4 w-4 rounded border-kindred text-primary-k focus:ring-primary-k"
                                            />
                                            <span className="flex-1">
                                                <span className="flex items-center gap-1.5 text-sm font-medium text-primary-k">
                                                    <Users className="h-4 w-4" aria-hidden="true" />
                                                    {form.role === "participant"
                                                        ? "Add one more person to my plan"
                                                        : "I'm caring for two people"}
                                                </span>
                                                <span className="block text-xs text-primary-k/80 mt-0.5 leading-relaxed">
                                                    {form.role === "participant"
                                                        ? "Your Family plan covers you and one more person at no extra cost. Add their name now and we'll walk through their profile after yours."
                                                        : "Your Family plan covers a second Participant at no extra cost. Add their name now and we'll pick up where you leave off in onboarding."}
                                                </span>
                                            </span>
                                        </label>

                                        {addSecondParticipant && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7" data-testid="signup-second-participant-fields">
                                                <label className="block">
                                                    <FieldLabelText required>Their first name</FieldLabelText>
                                                    <input
                                                        value={secondParticipant.first_name}
                                                        onChange={(e) => setSecondParticipant((s) => ({ ...s, first_name: e.target.value }))}
                                                        required={addSecondParticipant}
                                                        placeholder={form.role === "participant" ? "e.g. Margaret" : "e.g. Arthur"}
                                                        data-testid="signup-second-participant-first-name"
                                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                                    />
                                                </label>
                                                <label className="block">
                                                    <FieldLabelText optional>{form.role === "participant" ? "Their relationship to you" : "Your relationship"}</FieldLabelText>
                                                    <select
                                                        value={secondParticipant.relationship}
                                                        onChange={(e) => setSecondParticipant((s) => ({ ...s, relationship: e.target.value }))}
                                                        data-testid="signup-second-participant-relationship"
                                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                                    >
                                                        <option value="">Select…</option>
                                                        {CAREGIVER_RELATIONSHIPS.map((r) => (
                                                            <option key={r.v} value={r.v}>{r.label}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <p className="text-xs text-muted-k sm:col-span-2 -mt-1">
                                                    {form.role === "participant"
                                                        ? `You'll set up the rest of ${secondParticipant.first_name?.trim() || "their"} details right after your own onboarding finishes.`
                                                        : `You'll set up the rest of ${secondParticipant.first_name?.trim() || "their"} details right after ${form.care_recipient_first_name?.trim() || "the first Participant"}'s onboarding finishes.`}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className="block">
                                        <FieldLabelText required>First name</FieldLabelText>
                                        <input
                                            value={form.first_name}
                                            onChange={update("first_name")}
                                            required
                                            aria-required="true"
                                            data-testid="signup-first-name-input"
                                            className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                        />
                                    </label>
                                    <label className="block">
                                        <FieldLabelText required>Last name</FieldLabelText>
                                        <input
                                            value={form.last_name}
                                            onChange={update("last_name")}
                                            required
                                            aria-required="true"
                                            data-testid="signup-last-name-input"
                                            className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                        />
                                    </label>
                                </div>

                                <label className="block">
                                    <FieldLabelText required>Email</FieldLabelText>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={update("email")}
                                        required
                                        aria-required="true"
                                        data-testid="signup-email-input"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                </label>

                                <label className="block">
                                    <FieldLabelText required>Password</FieldLabelText>
                                    <div className="relative mt-1">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={form.password}
                                            onChange={update("password")}
                                            required
                                            aria-required="true"
                                            minLength={8}
                                            data-testid="signup-password-input"
                                            className="w-full rounded-md border border-kindred bg-surface px-3 py-2 pr-11 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((s) => !s)}
                                            data-testid="signup-password-toggle"
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                            aria-pressed={showPassword}
                                            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-k hover:text-primary-k focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k rounded-r-md"
                                        >
                                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                    <PasswordStrength password={form.password} email={form.email} name={`${form.first_name} ${form.last_name}`.trim()} />
                                </label>

                                <details className="text-sm text-muted-k">
                                    <summary className="cursor-pointer hover:text-primary-k">Add a mobile number (optional)</summary>
                                    <input
                                        type="tel"
                                        value={form.mobile}
                                        onChange={(e) => { setForm((f) => ({ ...f, mobile: e.target.value })); if (mobileError) setMobileError(""); }}
                                        placeholder="04XXXXXXXX"
                                        autoComplete="tel"
                                        inputMode="tel"
                                        data-testid="signup-mobile-input"
                                        aria-invalid={mobileError ? "true" : "false"}
                                        className="mt-2 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                    <p className="mt-1 text-xs text-muted-k">
                                        Used only for account recovery + security alerts. No marketing texts.
                                    </p>
                                    {mobileError && <p data-testid="signup-mobile-error" className="mt-1 text-xs text-terracotta">{mobileError}</p>}
                                </details>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    data-testid="signup-submit-button"
                                    className="w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-[#091D33] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                                >
                                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {submitting ? "Working…" : `Start 7-day free ${PLANS.find((p) => p.v === form.plan)?.title || "Family"} trial`}
                                </button>
                            </form>
                            <p className="mt-4 text-sm text-muted-k">
                                Already have one? <Link to="/login" data-testid="login-link" className="text-primary-k underline">Sign in</Link>
                            </p>
                        </div>
                    </div>

                    {/* PLAN PICKER (5 of 12 cols) */}
                    <div className="lg:col-span-5 order-1 lg:order-2" data-testid="signup-plan-picker">
                        <div className="lg:sticky lg:top-6">
                            <span className="overline">Pick a plan</span>
                            <h2 className="font-heading text-xl lg:text-2xl text-primary-k mt-1 tracking-tight">
                                What&apos;s in your trial?
                            </h2>
                            <p className="mt-1 text-xs text-muted-k leading-relaxed">
                                Full app for 7 days, no card. Switch or downgrade any time.
                            </p>

                            <div className="mt-4 space-y-2.5">
                                {PLANS.map((p) => {
                                    const selected = form.plan === p.v;
                                    return (
                                        <button
                                            key={p.v}
                                            type="button"
                                            onClick={() => setForm((f) => ({ ...f, plan: p.v }))}
                                            data-testid={`signup-plan-${p.v}`}
                                            aria-pressed={selected}
                                            className={`w-full text-left rounded-xl border-2 p-4 transition-all duration-200 relative ${
                                                selected
                                                    ? "border-primary-k bg-primary-k/[0.06] ring-4 ring-primary-k/25 shadow-lg scale-[1.015]"
                                                    : "border-kindred bg-surface hover:bg-surface-2 hover:border-primary-k/40 hover:shadow-sm"
                                            }`}
                                        >
                                            {selected && (
                                                <span
                                                    className="absolute -top-2 -right-2 inline-flex items-center gap-1 bg-primary-k text-white text-[10px] font-medium uppercase tracking-wider rounded-full px-2.5 py-1 shadow-md"
                                                    data-testid={`signup-plan-selected-badge-${p.v}`}
                                                >
                                                    <Check className="h-3 w-3" /> Selected
                                                </span>
                                            )}
                                            <div className="flex items-baseline justify-between gap-2">
                                                <div className="min-w-0">
                                                    <span className={`font-heading text-base ${selected ? "text-primary-k font-semibold" : "text-primary-k"}`}>{p.title}</span>
                                                    {p.badge && (
                                                        <span className="ml-2 bg-gold/20 text-primary-k text-[9px] uppercase tracking-wider rounded-full px-1.5 py-0.5">{p.badge}</span>
                                                    )}
                                                </div>
                                                <div className="flex items-baseline gap-1 shrink-0">
                                                    <span className={`font-heading text-lg tabular-nums ${selected ? "text-primary-k font-bold" : "text-primary-k"}`}>{p.price}</span>
                                                    <span className="text-[10px] text-muted-k">{p.period}</span>
                                                </div>
                                            </div>
                                            <ul className="mt-3 space-y-1.5">
                                                {(selected ? p.bullets : p.bullets.slice(0, 5)).map((b) => (
                                                    <li key={b} className="flex items-start gap-2 text-xs text-primary-k/80 leading-snug">
                                                        <Check className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${selected ? "text-primary-k" : "text-sage"}`} />
                                                        <span>{b}</span>
                                                    </li>
                                                ))}
                                                {!selected && p.bullets.length > 5 && (
                                                    <li className="text-[11px] text-muted-k pl-5">
                                                        + {p.bullets.length - 5} more
                                                    </li>
                                                )}
                                            </ul>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-4 text-[11px] text-muted-k bg-surface-2 rounded-lg p-3" data-testid="signup-plan-summary">
                                Selected: <span className="font-medium text-primary-k">{PLANS.find((p) => p.v === form.plan)?.title}</span> · 7-day free trial · cancel any time
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
