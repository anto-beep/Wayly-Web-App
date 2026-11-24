import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Check, Loader2, Eye, EyeOff, MailCheck, ArrowRight } from "lucide-react";
import WaylyLogo from "@/components/WaylyLogo";
import { toast } from "sonner";
import { api, extractErrorMessage } from "@/lib/api";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { FieldLabelText } from "@/components/RequiredHint";
import PasswordStrength, { evaluatePassword } from "@/components/PasswordStrength";
import EmailCodeVerify from "@/components/EmailCodeVerify";

import SeoHead from "@/seo/SeoHead";
import { track } from "@/lib/analytics";
import { ga4Track } from "@/lib/ga4";
import { conv1 } from "@/lib/conv1";
import { SEO } from "@/seo/pageConfig";
import { TOOL_COUNT } from "@/config/toolRegistry";
import { trialSentence, CAREGIVER_SEATS, SUPPORT_LINE } from "@/config/planFacts";

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
            `${CAREGIVER_SEATS.family} Caregiver seats`,
            "Sunday digest emails to the whole family",
            "GP & specialist role-based sharing links",
            "Family Wall for shared updates & notes",
            "Reassessment letter generator",
            "Invoice + statement history vault",
            SUPPORT_LINE.family,
        ],
    },
];

// CONV-1 K1: signup_started fires once, on the first interaction with the form.
let signupStartedFired = false;

export default function Signup() {
    const { signup } = useAuth();
    const nav = useNavigate();
    const [params] = useSearchParams();
    const isRetiredFreePlan = params.get("plan") === "free";
    // Free plan retired: any ?plan=free deep-link redirects to clean /signup with default Family plan.
    useEffect(() => {
        if (isRetiredFreePlan) {
            nav("/signup", { replace: true });
        }
    }, [isRetiredFreePlan, nav]);

    // CONV-1 F1–F3: the signup form is deliberately four fields — role, first
    // name, email, password — so people start their trial in seconds. Last
    // name, the care-recipient's details, a second participant and a mobile
    // number are all collected later in onboarding / Settings, where there's
    // room to explain why each one helps.
    const [form, setForm] = useState({
        first_name: "",
        email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(params.get("email") || "") ? params.get("email") : "",
        password: "",
        role: ["caregiver", "participant"].includes(params.get("role")) ? params.get("role") : "caregiver",
        plan: params.get("plan") && ["solo", "family"].includes(params.get("plan")) ? params.get("plan") : "family",
        // Business OS Phase 1: optional marketing consent, unchecked by default.
        marketing_consent: false,
    });
    const [submitting, setSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    // After account creation we show a 6-digit email-code step BEFORE payment.
    // Users can verify now or skip (7-day grace still applies), then we open
    // Stripe Checkout. Mirrors the mobile code flow.
    const [verifyStage, setVerifyStage] = useState(false);
    const [checkoutBusy, setCheckoutBusy] = useState(false);

    const submit = async (e, planOverride) => {
        e.preventDefault();
        const chosenPlan = planOverride || form.plan;
        const firstName = form.first_name.trim();
        const pw = evaluatePassword(form.password, { email: form.email, name: firstName });
        if (!pw.valid) {
            toast.error(pw.containsIdentity ? "Password shouldn't include your name or email" : "Password needs 8+ chars with upper, lower, number, and symbol");
            return;
        }
        setSubmitting(true);
        try {
            const u = await signup({
                first_name: firstName,
                last_name: "",
                name: firstName,
                email: form.email,
                password: form.password,
                role: form.role,
                plan: chosenPlan,
                marketing_consent: form.marketing_consent,
            }, { deferUser: chosenPlan === "solo" || chosenPlan === "family" });
            track.signup({ plan: chosenPlan });
            track.identify(u);
            // GA4 sign_up — fires only here, after the account is CONFIRMED
            // created by /auth/signup (never on click/submit). Deduped by user id.
            try { ga4Track.signUp(u?.id, { signup_method: "email", plan_type: chosenPlan }); } catch (_) { /* analytics best-effort */ }
            // PERSONA-1 §C: set the viewer persona at signup so the account is
            // persona-correct from day zero. The care-recipient's name is now
            // captured in onboarding, so we only seed is_self here. Best-effort:
            // any failure shouldn't block the trial.
            try {
                const isParticipant = form.role === "participant";
                await api.put("/persona", {
                    viewer_persona: form.role,
                    is_authorised_representative: false,
                    care_recipient: {
                        is_self: isParticipant,
                        first_name: isParticipant ? (firstName || null) : null,
                        last_name: null,
                        pronouns: "unknown",
                        relationship_to_account: null,
                    },
                });
            } catch (_) { /* non-fatal, user completes this in onboarding */ }

            // Paid plans → route through Stripe Checkout so the card is captured
            // up front (7-day trial, charged on day 8). Gated behind the optional
            // 6-digit email verification step. CONV-1 D1: a free account skips the
            // card entirely and goes straight into the app.
            if (chosenPlan === "solo" || chosenPlan === "family") {
                setVerifyStage(true);
            } else {
                try { conv1.freeAccountCreated({ plan: "free", persona: form.role }); } catch (_) { /* best-effort */ }
                toast.success(`Welcome, ${u.name.split(" ")[0]}`);
                nav("/app");
            }
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not create account"));
        } finally {
            setSubmitting(false);
        }
    };

    // Opens Stripe Checkout (7-day trial). Called after the user verifies their
    // email OR taps "Skip for now" on the verification step.
    const proceedToCheckout = async () => {
        if (checkoutBusy) return;
        setCheckoutBusy(true);
        try {
            const { data } = await api.post("/payments/checkout", {
                plan: form.plan,
                origin_url: window.location.origin,
                trial_days: 7,
            });
            track.trialStart({ plan: form.plan });
            // CONV-1 K1: card entry surface (Stripe Checkout) about to display.
            try { conv1.cardStepReached({ plan: form.plan }); } catch (_) { /* best-effort */ }
            // Brand-new 7-day trial: remember so that after Stripe confirms we
            // can send this new user to /welcome exactly once (BillingSuccess).
            try { localStorage.setItem("wayly_trial_welcome", "1"); } catch (_) { /* no-op */ }
            if (data?.url) {
                window.location.href = data.url;
                return;
            }
            toast.error("Could not start checkout, please try again from Pricing.");
            nav("/pricing");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not start checkout."));
            nav("/pricing");
        } finally {
            setCheckoutBusy(false);
        }
    };

    const fireSignupStarted = () => {
        if (signupStartedFired) return;
        signupStartedFired = true;
        try { conv1.signupStarted({ plan: form.plan, persona: form.role }); } catch (_) { /* best-effort */ }
    };

    const update = (k) => (e) => {
        fireSignupStarted();
        setForm((f) => ({ ...f, [k]: e.target.value }));
    };

    const _trialPlanLabel = form.plan === "family" ? "Family" : "Solo";
    const _trialPlanAmount = form.plan === "family" ? "A$49.50" : "A$24.50";
    const _trialFirstCharge = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-AU", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    if (verifyStage) {
        return (
            <div className="min-h-screen bg-kindred auth-shell px-6 py-10">
                <SeoHead {...SEO.signup} noindex />
                <div className="mx-auto max-w-md">
                    <Link to="/" className="flex items-center gap-2 mb-8">
                        <WaylyLogo size={32} className="rounded-md" />
                        <span className="font-heading text-lg text-primary-k">Wayly</span>
                    </Link>
                    <div className="bg-surface border border-kindred rounded-2xl p-6 lg:p-7 auth-card" data-testid="signup-verify-stage">
                        <div className="h-12 w-12 rounded-2xl bg-primary-k/10 flex items-center justify-center mb-4">
                            <MailCheck className="h-6 w-6 text-primary-k" />
                        </div>
                        <h1 className="font-heading text-2xl text-primary-k tracking-tight">Verify your email</h1>
                        <p className="mt-2 text-sm text-muted-k leading-relaxed">
                            We sent a 6-digit code to <span className="font-medium text-primary-k">{form.email}</span>. Enter it to confirm your email, then we&apos;ll take you to add your card.
                        </p>
                        <div className="mt-6">
                            <EmailCodeVerify email={form.email} authed onVerified={proceedToCheckout} />
                        </div>
                        <button
                            type="button"
                            onClick={proceedToCheckout}
                            disabled={checkoutBusy}
                            data-testid="signup-verify-skip"
                            className="mt-5 w-full text-sm text-muted-k hover:text-primary-k underline disabled:opacity-60 inline-flex items-center justify-center gap-2"
                        >
                            {checkoutBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                            {checkoutBusy ? "Opening secure checkout…" : "Skip for now, I'll verify later"}
                        </button>
                        <p className="mt-3 text-xs text-muted-k text-center">
                            You have 7 days to verify before some features pause.
                        </p>
                        <div className="mt-4 rounded-xl bg-kindred/60 p-3.5" data-testid="signup-trial-terms">
                            <p className="text-xs text-muted-k leading-relaxed">
                                Your 7-day free trial is free. On <strong className="text-primary-k">{_trialFirstCharge}</strong> it
                                continues automatically at <strong className="text-primary-k">{_trialPlanAmount} per fortnight ({_trialPlanLabel})</strong> unless
                                you cancel first. Cancel any time before then from <strong className="text-primary-k">Settings → Billing</strong> and
                                you won&apos;t be charged.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-kindred auth-shell px-6 py-10">
            <SeoHead {...SEO.signup} noindex={isRetiredFreePlan || SEO.signup.noindex} />
            <div className="mx-auto max-w-6xl">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <WaylyLogo size={32} className="rounded-md" />
                    <span className="font-heading text-lg text-primary-k">Wayly</span>
                </Link>

                <div className="grid lg:grid-cols-12 gap-6 lg:gap-8">
                    {/* ACCOUNT (7 of 12 cols) */}
                    <div className="lg:col-span-7 order-2 lg:order-1">
                        <div className="bg-surface border border-kindred rounded-2xl p-5 lg:p-6 auth-card">
                            <span className="overline">Your details</span>
                            <h1 className="font-heading text-2xl text-primary-k mt-1 tracking-tight">
                                Start your 7-day free trial
                            </h1>
                            <p className="mt-1.5 text-xs text-muted-k leading-relaxed">
                                {trialSentence(form.plan)}
                            </p>

                            <div className="mt-4 auth-google">
                                <GoogleSignInButton
                                    testid="signup-google"
                                    planIntent={form.plan}
                                    label="Sign up with Google"
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
                                                onClick={() => { fireSignupStarted(); setForm((f) => ({ ...f, role: o.v })); }}
                                                className={`text-left rounded-lg border p-3 transition-colors ${
                                                    form.role === o.v
                                                        ? "border-primary-k bg-surface-2 ring-2 ring-primary-k/20 auth-selected"
                                                        : "border-kindred hover:bg-surface-2"
                                                }`}
                                            >
                                                <div className="font-medium text-primary-k text-sm">{o.label}</div>
                                                <div className="text-xs text-muted-k">{o.sub}</div>
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>

                                <label className="block">
                                    <FieldLabelText required>First name</FieldLabelText>
                                    <input
                                        value={form.first_name}
                                        onChange={update("first_name")}
                                        required
                                        aria-required="true"
                                        autoComplete="given-name"
                                        data-testid="signup-first-name-input"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                </label>

                                <label className="block">
                                    <FieldLabelText required>Email</FieldLabelText>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={update("email")}
                                        required
                                        aria-required="true"
                                        autoComplete="email"
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
                                            autoComplete="new-password"
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
                                    <PasswordStrength password={form.password} email={form.email} name={form.first_name.trim()} />
                                </label>

                                <p className="text-xs text-muted-k leading-relaxed" data-testid="signup-onboarding-note">
                                    That&apos;s all we need to start. We&apos;ll set up who you care for and the finer details together, right after this.
                                </p>

                                <label className="mt-4 flex items-start gap-3 cursor-pointer select-none" data-testid="signup-marketing-consent-label">
                                    <input
                                        type="checkbox"
                                        checked={form.marketing_consent}
                                        onChange={(e) => setForm((f) => ({ ...f, marketing_consent: e.target.checked }))}
                                        data-testid="signup-marketing-consent"
                                        className="mt-0.5 h-4 w-4 flex-none rounded border-kindred text-primary-k focus:ring-primary-k"
                                    />
                                    <span className="text-xs text-muted-k leading-relaxed">
                                        Email me helpful aged-care guides, product updates and occasional news from Wayly. I can unsubscribe at any time.
                                    </span>
                                </label>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    data-testid="signup-submit-button"
                                    className="w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-[#091D33] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                                >
                                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {submitting ? "Working…" : `Start 7-day free ${PLANS.find((p) => p.v === form.plan)?.title || "Family"} trial`}
                                </button>
                                {/* CONV-1 D1: free account is its OWN streamlined flow. This is a
                                    clear secondary button that routes to the dedicated free sign-up page. */}
                                <div className="mt-5 flex items-center gap-3" aria-hidden="true">
                                    <span className="h-px flex-1 bg-kindred" />
                                    <span className="text-[11px] uppercase tracking-wider text-muted-k">or</span>
                                    <span className="h-px flex-1 bg-kindred" />
                                </div>
                                <Link
                                    to="/signup/free"
                                    data-testid="signup-free-account-button"
                                    className="mt-4 w-full rounded-md border-2 border-primary-k bg-surface py-3 text-base font-semibold text-primary-k hover:bg-surface-2 transition-colors inline-flex items-center justify-center gap-2"
                                >
                                    Create a free account — no card
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                                <p className="mt-2 text-xs text-muted-k text-center" data-testid="signup-free-note">
                                    One invoice check and one statement decode every few months, with your results saved. Upgrade any time.
                                </p>
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
                                Cancel any time. Two minutes so Wayly speaks in the right voice from day one.
                            </p>

                            <div className="mt-4 space-y-2.5">
                                {PLANS.map((p) => {
                                    const selected = form.plan === p.v;
                                    return (
                                        <button
                                            key={p.v}
                                            type="button"
                                            onClick={() => { fireSignupStarted(); try { conv1.planSelected(p.v); } catch (_) { /* best-effort */ } setForm((f) => ({ ...f, plan: p.v })); }}
                                            data-testid={`signup-plan-${p.v}`}
                                            aria-pressed={selected}
                                            className={`w-full text-left rounded-xl border-2 p-4 transition-colors duration-200 relative ${
                                                selected
                                                    ? "border-primary-k bg-primary-k/[0.06] ring-4 ring-primary-k/25 shadow-lg scale-[1.015] auth-selected"
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
