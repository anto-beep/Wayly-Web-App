import React, { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { HeartHandshake, ArrowLeft, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import PasswordStrength, { evaluatePassword } from "@/components/PasswordStrength";

export function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!cooldown) return;
        const t = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
        return () => clearInterval(t);
    }, [cooldown]);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post("/auth/forgot", { email });
            setSent(true);
            setCooldown(60);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not send reset link");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center px-6">
            <div className="w-full max-w-md">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <div className="h-8 w-8 rounded-md bg-[#1F3A5F] flex items-center justify-center"><HeartHandshake className="h-4 w-4 text-white" /></div>
                    <span className="font-heading text-lg text-[#1F3A5F]">Kindred</span>
                </Link>
                <div className="bg-white border border-[#E8E2D9] rounded-2xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                    <Link to="/login" className="text-xs text-[#6B7280] inline-flex items-center gap-1 mb-4"><ArrowLeft className="h-3 w-3" /> Back to sign in</Link>
                    <h1 className="font-heading text-2xl text-[#1F3A5F] tracking-tight" data-testid="forgot-title">{sent ? "Check your email" : "Forgot your password?"}</h1>
                    {sent ? (
                        <>
                            <p className="mt-3 text-sm text-[#6B7280] leading-relaxed">If an account with that email exists, you'll receive a reset link within 2 minutes. Check your spam folder too.</p>
                            <button
                                disabled={cooldown > 0 || submitting}
                                onClick={submit}
                                data-testid="forgot-resend"
                                className="mt-6 w-full bg-[#1F3A5F] text-white rounded-md py-3 text-sm hover:bg-[#16294a] disabled:opacity-60"
                            >
                                {cooldown > 0 ? `Resend in ${cooldown}s` : submitting ? "Sending…" : "Resend reset link"}
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="mt-2 text-sm text-[#6B7280]">Enter your email — we'll send a link to reset it.</p>
                            <form onSubmit={submit} className="mt-5 space-y-4">
                                <label className="block">
                                    <span className="text-sm text-[#6B7280]">Email</span>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        data-testid="forgot-email-input"
                                        className="mt-1 w-full rounded-md border border-[#E8E2D9] px-3 py-2.5 focus:outline-none focus:ring-2 ring-[#1F3A5F]"
                                    />
                                </label>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    data-testid="forgot-submit"
                                    className="w-full bg-[#1F3A5F] text-white rounded-md py-3 text-sm hover:bg-[#16294a] disabled:opacity-60 inline-flex items-center justify-center gap-2"
                                >
                                    {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    Send reset link
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export function ResetPassword() {
    const [params] = useSearchParams();
    const token = params.get("token");
    const [pw, setPw] = useState("");
    const [confirm, setConfirm] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const nav = useNavigate();

    const result = evaluatePassword(pw);

    const submit = async (e) => {
        e.preventDefault();
        if (!result.valid) { toast.error("Password doesn't meet the requirements"); return; }
        if (pw !== confirm) { toast.error("Passwords don't match"); return; }
        setSubmitting(true);
        try {
            await api.post("/auth/reset", { token, new_password: pw });
            setDone(true);
            toast.success("Password updated");
            setTimeout(() => nav("/login"), 1500);
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not update password");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center px-6">
            <div className="w-full max-w-md">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <div className="h-8 w-8 rounded-md bg-[#1F3A5F] flex items-center justify-center"><HeartHandshake className="h-4 w-4 text-white" /></div>
                    <span className="font-heading text-lg text-[#1F3A5F]">Kindred</span>
                </Link>
                <div className="bg-white border border-[#E8E2D9] rounded-2xl p-8 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                    <h1 className="font-heading text-2xl text-[#1F3A5F] tracking-tight" data-testid="reset-title">Choose a new password</h1>
                    {done ? (
                        <p className="mt-4 text-sm text-[#7A9B7E] inline-flex items-center gap-2"><Check className="h-4 w-4" /> Password updated — redirecting to sign in…</p>
                    ) : (
                        <form onSubmit={submit} className="mt-5 space-y-4">
                            <label className="block">
                                <span className="text-sm text-[#6B7280]">New password</span>
                                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required data-testid="reset-pw-input" className="mt-1 w-full rounded-md border border-[#E8E2D9] px-3 py-2.5 focus:outline-none focus:ring-2 ring-[#1F3A5F]" />
                                <PasswordStrength password={pw} />
                            </label>
                            <label className="block">
                                <span className="text-sm text-[#6B7280]">Confirm password</span>
                                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required data-testid="reset-confirm-input" className="mt-1 w-full rounded-md border border-[#E8E2D9] px-3 py-2.5 focus:outline-none focus:ring-2 ring-[#1F3A5F]" />
                                {confirm && pw !== confirm && <span className="text-[11px] text-[#C5734D] mt-1 block">Passwords don't match</span>}
                            </label>
                            <button type="submit" disabled={submitting || !result.valid || pw !== confirm} data-testid="reset-submit" className="w-full bg-[#1F3A5F] text-white rounded-md py-3 text-sm hover:bg-[#16294a] disabled:opacity-60">
                                {submitting ? "Updating…" : "Update password"}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ForgotPassword;
