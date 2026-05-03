import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { HeartHandshake } from "lucide-react";
import { toast } from "sonner";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function Login() {
    const { login } = useAuth();
    const nav = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const u = await login(email, password);
            toast.success(`Welcome back, ${u.name}`);
            nav(u.role === "participant" ? "/participant" : "/app");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not sign in");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-kindred flex items-center justify-center px-6">
            <div className="w-full max-w-md">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <div className="h-8 w-8 rounded-full bg-primary-k flex items-center justify-center">
                        <HeartHandshake className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-heading text-lg text-primary-k">Kindred</span>
                </Link>
                <div className="bg-surface border border-kindred rounded-2xl p-8">
                    <span className="overline">Sign in</span>
                    <h1 className="font-heading text-3xl text-primary-k mt-2 tracking-tight">Welcome back</h1>

                    <div className="mt-6">
                        <GoogleSignInButton testid="login-google" />
                    </div>

                    <div className="mt-5 mb-5 flex items-center gap-3 text-xs text-muted-k">
                        <span className="flex-1 h-px bg-kindred"></span>
                        <span>or with email</span>
                        <span className="flex-1 h-px bg-kindred"></span>
                    </div>

                    <form onSubmit={submit} className="space-y-4">
                        <label className="block">
                            <span className="text-sm text-muted-k">Email</span>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                data-testid="login-email-input"
                                className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm text-muted-k">Password</span>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                data-testid="login-password-input"
                                className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={submitting}
                            data-testid="login-submit-button"
                            className="w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-primary-k/90 transition-colors disabled:opacity-60"
                        >
                            {submitting ? "Signing in…" : "Sign in"}
                        </button>
                    </form>
                    <p className="mt-6 text-sm text-muted-k">
                        No account?{" "}
                        <Link to="/signup" data-testid="signup-link" className="text-primary-k underline">
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
