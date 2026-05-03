import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { HeartHandshake } from "lucide-react";
import { toast } from "sonner";

export default function Signup() {
    const { signup } = useAuth();
    const nav = useNavigate();
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        role: "caregiver",
    });
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const u = await signup(form);
            toast.success(`Welcome, ${u.name}`);
            nav("/onboarding");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not create account");
        } finally {
            setSubmitting(false);
        }
    };

    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <div className="min-h-screen bg-kindred flex items-center justify-center px-6 py-10">
            <div className="w-full max-w-md">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <div className="h-8 w-8 rounded-full bg-primary-k flex items-center justify-center">
                        <HeartHandshake className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-heading text-lg text-primary-k">Kindred</span>
                </Link>
                <div className="bg-surface border border-kindred rounded-2xl p-8">
                    <span className="overline">Create your account</span>
                    <h1 className="font-heading text-3xl text-primary-k mt-2 tracking-tight">Let's get started</h1>
                    <form onSubmit={submit} className="mt-6 space-y-4">
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
                        <fieldset className="mt-2">
                            <span className="text-sm text-muted-k">I am the…</span>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                {[
                                    { v: "caregiver", label: "Family caregiver", sub: "I help my parent" },
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
                        <button
                            type="submit"
                            disabled={submitting}
                            data-testid="signup-submit-button"
                            className="w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-primary-k/90 transition-colors disabled:opacity-60"
                        >
                            {submitting ? "Creating account…" : "Create account"}
                        </button>
                    </form>
                    <p className="mt-6 text-sm text-muted-k">
                        Already have one?{" "}
                        <Link to="/login" data-testid="login-link" className="text-primary-k underline">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
