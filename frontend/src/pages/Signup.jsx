import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { HeartHandshake, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import GoogleSignInButton from "@/components/GoogleSignInButton";

const PLANS = [
    {
        v: "free",
        title: "Free",
        price: "$0",
        period: "forever",
        bullets: [
            "2 of 8 public AI tools",
            "5 uses per month each",
            "No saved history",
        ],
    },
    {
        v: "solo",
        title: "Solo",
        price: "$19",
        period: "per month",
        featured: false,
        bullets: [
            "All 8 AI tools, unlimited",
            "Statement Auto-Decode",
            "Anomaly Watch + budget tracker",
            "1 caregiver seat",
        ],
    },
    {
        v: "family",
        title: "Family",
        price: "$39",
        period: "per month",
        featured: true,
        badge: "Most popular",
        bullets: [
            "Everything in Solo",
            "Up to 5 family seats",
            "Sunday digest emails",
            "Advisor & GP role-based sharing",
        ],
    },
];

export default function Signup() {
    const { signup } = useAuth();
    const nav = useNavigate();
    const [params] = useSearchParams();
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        role: "caregiver",
        plan: params.get("plan") && ["free", "solo", "family"].includes(params.get("plan")) ? params.get("plan") : "family",
    });
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const u = await signup(form);
            const verb = form.plan === "free" ? "Welcome" : "Account ready";
            toast.success(`${verb}, ${u.name.split(" ")[0]}`);
            // Paid plans → Stripe Checkout. Free → straight to onboarding.
            if (form.plan === "solo" || form.plan === "family") {
                try {
                    const { data } = await api.post("/billing/checkout", {
                        plan: form.plan,
                        origin_url: window.location.origin,
                    });
                    if (data.url) {
                        window.location.href = data.url;
                        return;
                    }
                    toast.error("Could not start checkout — redirecting to onboarding.");
                    nav("/onboarding");
                } catch (err) {
                    toast.error(err?.response?.data?.detail || "Could not start checkout.");
                    nav("/onboarding");
                }
            } else {
                nav("/app");
            }
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not create account");
        } finally {
            setSubmitting(false);
        }
    };

    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <div className="min-h-screen bg-kindred px-6 py-10">
            <div className="mx-auto max-w-5xl">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <div className="h-8 w-8 rounded-full bg-primary-k flex items-center justify-center">
                        <HeartHandshake className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-heading text-lg text-primary-k">Kindred</span>
                </Link>

                <div className="grid lg:grid-cols-5 gap-8">
                    {/* PLAN PICKER (3 of 5 cols) */}
                    <div className="lg:col-span-3" data-testid="signup-plan-picker">
                        <span className="overline">Step 1 — Pick a plan</span>
                        <h1 className="font-heading text-3xl text-primary-k mt-2 tracking-tight">
                            What does your trial unlock?
                        </h1>
                        <p className="mt-2 text-sm text-muted-k max-w-md leading-relaxed">
                            Solo and Family give you the full app for 7 days, no card needed. Switch or downgrade any time.
                        </p>

                        <div className="mt-5 space-y-3">
                            {PLANS.map((p) => (
                                <button
                                    key={p.v}
                                    type="button"
                                    onClick={() => setForm((f) => ({ ...f, plan: p.v }))}
                                    data-testid={`signup-plan-${p.v}`}
                                    className={`w-full text-left rounded-2xl border p-5 transition-all ${
                                        form.plan === p.v
                                            ? "border-primary-k bg-surface ring-2 ring-primary-k/30"
                                            : "border-kindred bg-surface hover:bg-surface-2"
                                    }`}
                                >
                                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                                        <div>
                                            <span className="font-heading text-xl text-primary-k">{p.title}</span>
                                            {p.badge && (
                                                <span className="ml-2 bg-gold/20 text-primary-k text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5">{p.badge}</span>
                                            )}
                                        </div>
                                        <div>
                                            <span className="font-heading text-2xl text-primary-k tabular-nums">{p.price}</span>
                                            <span className="text-xs text-muted-k ml-1">{p.period}</span>
                                        </div>
                                    </div>
                                    <ul className="mt-3 space-y-1.5">
                                        {p.bullets.map((b) => (
                                            <li key={b} className="flex items-start gap-2 text-sm text-muted-k">
                                                <Check className="h-3.5 w-3.5 text-sage mt-0.5 flex-shrink-0" />
                                                <span>{b}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ACCOUNT FIELDS (2 of 5 cols) */}
                    <div className="lg:col-span-2">
                        <div className="bg-surface border border-kindred rounded-2xl p-7 sticky top-6">
                            <span className="overline">Step 2 — Your details</span>
                            <h2 className="font-heading text-2xl text-primary-k mt-2 tracking-tight">
                                {form.plan === "free" ? "Create free account" : `Continue to checkout`}
                            </h2>

                            <div className="mt-5">
                                <GoogleSignInButton testid="signup-google" label={form.plan === "free" ? "Continue with Google" : "Sign up with Google"} />
                                <p className="mt-2 text-xs text-muted-k">
                                    {form.plan === "free"
                                        ? "Quick start — we'll create your account from your Google profile."
                                        : "After Google sign-in we'll redirect you to Stripe to complete the trial setup."}
                                </p>
                            </div>

                            <div className="my-5 flex items-center gap-3 text-xs text-muted-k">
                                <span className="flex-1 h-px bg-kindred"></span>
                                <span>or with email</span>
                                <span className="flex-1 h-px bg-kindred"></span>
                            </div>

                            <form onSubmit={submit} className="space-y-4">
                                <label className="block">
                                    <span className="text-sm text-muted-k">Your name</span>
                                    <input
                                        value={form.name}
                                        onChange={update("name")}
                                        required
                                        data-testid="signup-name-input"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm text-muted-k">Email</span>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={update("email")}
                                        required
                                        data-testid="signup-email-input"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm text-muted-k">Password (min 8 chars)</span>
                                    <input
                                        type="password"
                                        value={form.password}
                                        onChange={update("password")}
                                        required
                                        minLength={8}
                                        data-testid="signup-password-input"
                                        className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 ring-primary-k"
                                    />
                                </label>
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
                                                        ? "border-primary-k bg-surface-2"
                                                        : "border-kindred hover:bg-surface-2"
                                                }`}
                                            >
                                                <div className="font-medium text-primary-k text-sm">{o.label}</div>
                                                <div className="text-xs text-muted-k">{o.sub}</div>
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>
                                <div className="text-xs text-muted-k bg-surface-2 rounded-lg p-3" data-testid="signup-plan-summary">
                                    Selected plan: <span className="font-medium text-primary-k">{PLANS.find((p) => p.v === form.plan)?.title}</span>
                                    {form.plan !== "free" && <span> · 7-day free trial · cancel any time</span>}
                                </div>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    data-testid="signup-submit-button"
                                    className="w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-[#16294a] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                                >
                                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {submitting ? "Working…" : (form.plan === "free" ? "Create account" : `Pay $${form.plan === "solo" ? "19" : "39"} & start`)}
                                </button>
                            </form>
                            <p className="mt-5 text-sm text-muted-k">
                                Already have one? <Link to="/login" data-testid="login-link" className="text-primary-k underline">Sign in</Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
