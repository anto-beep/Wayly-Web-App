import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Eye, EyeOff, Check, ArrowRight, ReceiptText, FileText } from "lucide-react";
import WaylyLogo from "@/components/WaylyLogo";
import { toast } from "sonner";
import { api, extractErrorMessage } from "@/lib/api";
import PasswordStrength, { evaluatePassword } from "@/components/PasswordStrength";
import SeoHead from "@/seo/SeoHead";
import { track } from "@/lib/analytics";
import { ga4Track } from "@/lib/ga4";
import { conv1 } from "@/lib/conv1";

/**
 * FreeSignup, CONV-1 v2 Workstream D1.
 *
 * A DISTINCT, streamlined no-card free account flow, deliberately separate from
 * the plan-centric /signup page so it never reads as an afterthought. Four
 * fields, no plan cards, no card, straight into the app.
 */
export default function FreeSignup() {
    const { signup } = useAuth();
    const nav = useNavigate();
    const [params] = useSearchParams();
    const [role, setRole] = useState("caregiver");
    const [firstName, setFirstName] = useState("");
    const [email, setEmail] = useState(params.get("email") || "");
    const [password, setPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [consent, setConsent] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const startedRef = React.useRef(false);

    const fireStarted = () => {
        if (startedRef.current) return;
        startedRef.current = true;
        try { conv1.signupStarted({ plan: "free", persona: role }); } catch (_) { /* best-effort */ }
    };

    const submit = async (e) => {
        e.preventDefault();
        setError(null);
        if (!firstName.trim()) { setError("Please add your first name."); return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
        const pw = evaluatePassword(password);
        if (!pw.valid) { setError("Choose a stronger password (8+ characters, not a common one)."); return; }
        setSubmitting(true);
        try {
            const u = await signup({
                first_name: firstName.trim(),
                last_name: "",
                name: firstName.trim(),
                email: email.trim(),
                password,
                role,
                plan: "free",
                marketing_consent: consent,
            }); // deferUser defaults false → user hydrates, /app won't bounce
            track.signup({ plan: "free" });
            track.identify(u);
            try { ga4Track.signUp(u?.id, { signup_method: "email", plan_type: "free" }); } catch (_) { /* best-effort */ }
            try {
                const isParticipant = role === "participant";
                await api.put("/persona", {
                    viewer_persona: role,
                    is_authorised_representative: false,
                    care_recipient: {
                        is_self: isParticipant,
                        first_name: isParticipant ? (firstName.trim() || null) : null,
                        last_name: null,
                        pronouns: "unknown",
                        relationship_to_account: null,
                    },
                });
            } catch (_) { /* non-fatal; completed later */ }
            try { conv1.freeAccountCreated({ plan: "free", persona: role }); } catch (_) { /* best-effort */ }
            toast.success(`Welcome, ${(u?.name || firstName).split(" ")[0]}`);
            nav("/app");
        } catch (err) {
            setError(extractErrorMessage(err) || "Could not create your account. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-kindred flex flex-col">
            <SeoHead title="Create a free Wayly account" description="A free Wayly account, no card. Check an invoice, decode a statement, and keep your results." path="/signup/free" />
            <div className="px-6 pt-8">
                <Link to="/" aria-label="Wayly home"><WaylyLogo className="h-7" /></Link>
            </div>
            <div className="flex-1 flex items-center justify-center px-6 py-10">
                <div className="w-full max-w-md">
                    <span className="overline" data-testid="free-signup-overline">Free account · no card</span>
                    <h1 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight mt-2">
                        Create your free account
                    </h1>
                    <p className="mt-2 text-sm text-muted-k leading-relaxed">
                        Start free in seconds. No card, no commitment.
                    </p>

                    <div className="mt-5 grid grid-cols-2 gap-3" data-testid="free-signup-perks">
                        <div className="rounded-xl border border-kindred bg-surface p-3">
                            <ReceiptText className="h-4 w-4 text-primary-k" />
                            <div className="mt-1.5 text-xs text-primary-k leading-snug">One invoice check every few months</div>
                        </div>
                        <div className="rounded-xl border border-kindred bg-surface p-3">
                            <FileText className="h-4 w-4 text-primary-k" />
                            <div className="mt-1.5 text-xs text-primary-k leading-snug">One statement decode, results saved</div>
                        </div>
                    </div>

                    <form onSubmit={submit} className="mt-6 space-y-4" data-testid="free-signup-form">
                        <div>
                            <div className="text-sm font-medium text-primary-k">I am the…</div>
                            <div className="mt-1.5 grid grid-cols-2 gap-2">
                                {[
                                    { v: "caregiver", label: "Caregiver", sub: "I help someone" },
                                    { v: "participant", label: "Participant", sub: "I receive care" },
                                ].map((r) => (
                                    <button
                                        key={r.v}
                                        type="button"
                                        onClick={() => { fireStarted(); setRole(r.v); }}
                                        data-testid={`free-signup-role-${r.v}`}
                                        className={`rounded-xl border p-3 text-left transition-colors ${
                                            role === r.v ? "border-primary-k bg-surface-2" : "border-kindred bg-surface hover:bg-surface-2"
                                        }`}
                                    >
                                        <div className="text-sm font-semibold text-primary-k">{r.label}</div>
                                        <div className="text-xs text-muted-k">{r.sub}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-medium text-primary-k" htmlFor="fs-first">First name</label>
                            <input
                                id="fs-first"
                                value={firstName}
                                onChange={(e) => { fireStarted(); setFirstName(e.target.value); }}
                                data-testid="free-signup-first-name"
                                className="mt-1.5 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                placeholder="Your first name"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-primary-k" htmlFor="fs-email">Email</label>
                            <input
                                id="fs-email"
                                type="email"
                                value={email}
                                onChange={(e) => { fireStarted(); setEmail(e.target.value); }}
                                data-testid="free-signup-email"
                                className="mt-1.5 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                placeholder="you@example.com"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium text-primary-k" htmlFor="fs-pw">Password</label>
                            <div className="mt-1.5 relative">
                                <input
                                    id="fs-pw"
                                    type={showPw ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => { fireStarted(); setPassword(e.target.value); }}
                                    data-testid="free-signup-password"
                                    className="w-full rounded-md border border-kindred bg-surface px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                                    placeholder="Create a password"
                                />
                                <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-k" aria-label={showPw ? "Hide password" : "Show password"}>
                                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <PasswordStrength password={password} />
                        </div>

                        <label className="flex items-start gap-2.5 cursor-pointer select-none">
                            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="free-signup-consent" className="mt-0.5 h-4 w-4 flex-none rounded border-kindred text-primary-k focus:ring-primary-k" />
                            <span className="text-xs text-muted-k leading-relaxed">Email me helpful aged-care guides and occasional product news. Unsubscribe any time.</span>
                        </label>

                        {error && <p className="text-sm text-terracotta" data-testid="free-signup-error">{error}</p>}

                        <button
                            type="submit"
                            disabled={submitting}
                            data-testid="free-signup-submit"
                            className="w-full bg-primary-k text-white rounded-md py-3 text-base font-semibold hover:bg-[#091D33] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                        >
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            {submitting ? "Creating your account…" : "Create free account"}
                        </button>
                    </form>

                    <div className="mt-6 rounded-xl border border-kindred bg-surface-2/60 p-4">
                        <div className="text-sm font-medium text-primary-k">Want every tool, unlimited?</div>
                        <p className="mt-1 text-xs text-muted-k leading-relaxed">Start a 7-day free trial for all Wayly tools. Card required; cancel any time.</p>
                        <Link to="/signup?plan=family" data-testid="free-signup-to-trial" className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-k">
                            Explore the 7-day trial <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>

                    <p className="mt-5 text-sm text-muted-k text-center">
                        Already have an account? <Link to="/login" data-testid="free-signup-login" className="text-primary-k underline">Sign in</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
