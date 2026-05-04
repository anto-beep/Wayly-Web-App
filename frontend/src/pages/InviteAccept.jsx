import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { HeartHandshake, Loader2, Check, Users } from "lucide-react";

export default function InviteAccept() {
    const [params] = useSearchParams();
    const token = params.get("token");
    const { user, loading: authLoading } = useAuth();
    const nav = useNavigate();
    const [invite, setInvite] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        if (!token) {
            setError("No invitation token in the link.");
            setLoading(false);
            return;
        }
        (async () => {
            try {
                const { data } = await api.get(`/invite/${token}`);
                setInvite(data);
            } catch (err) {
                setError(err?.response?.data?.detail || "Invitation not found or expired.");
            } finally {
                setLoading(false);
            }
        })();
    }, [token]);

    const accept = async () => {
        setAccepting(true);
        try {
            await api.post("/invite/accept", { token });
            toast.success("You've joined the household");
            nav("/app");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not accept invitation");
        } finally {
            setAccepting(false);
        }
    };

    if (loading || authLoading) {
        return (
            <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-k" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center px-6" data-testid="invite-accept-page">
            <div className="w-full max-w-md">
                <Link to="/" className="flex items-center gap-2 mb-8">
                    <div className="h-8 w-8 rounded-md bg-[#1F3A5F] flex items-center justify-center"><HeartHandshake className="h-4 w-4 text-white" /></div>
                    <span className="font-heading text-lg text-[#1F3A5F]">Kindred</span>
                </Link>
                <div className="bg-white border border-[#E8E2D9] rounded-2xl p-8">
                    {error ? (
                        <>
                            <h1 className="font-heading text-2xl text-[#1F3A5F]" data-testid="invite-error-title">Invitation unavailable</h1>
                            <p className="mt-3 text-sm text-muted-k">{error}</p>
                            <Link to="/" className="mt-6 inline-block text-sm text-primary-k underline">Go home</Link>
                        </>
                    ) : (
                        <>
                            <div className="h-10 w-10 rounded-full bg-gold/20 flex items-center justify-center"><Users className="h-5 w-5 text-primary-k" /></div>
                            <h1 className="font-heading text-2xl text-[#1F3A5F] mt-4 tracking-tight" data-testid="invite-title">
                                {invite.inviter_name} invited you
                            </h1>
                            <p className="mt-2 text-sm text-muted-k leading-relaxed">
                                You're being added as a <span className="font-medium text-primary-k capitalize">{invite.role?.replace("_", " ")}</span> on <span className="font-medium text-primary-k">{invite.household_name}</span>'s Kindred.
                            </p>
                            {invite.note && (
                                <blockquote className="mt-4 bg-surface-2 border-l-4 border-gold p-3 text-sm text-primary-k italic rounded-r-md">
                                    "{invite.note}"
                                </blockquote>
                            )}

                            {!user ? (
                                <div className="mt-6 text-sm text-muted-k">
                                    <p>To accept, you need a Kindred account using <span className="font-medium text-primary-k">{invite.email}</span>.</p>
                                    <div className="mt-4 flex gap-2">
                                        <Link to={`/signup?plan=free&invite=${token}`} data-testid="invite-signup-link" className="text-sm bg-primary-k text-white rounded-md px-4 py-2 hover:bg-[#16294a]">Create account</Link>
                                        <Link to={`/login?invite=${token}`} data-testid="invite-login-link" className="text-sm border border-kindred rounded-md px-4 py-2 text-primary-k hover:bg-surface-2">Sign in</Link>
                                    </div>
                                </div>
                            ) : user.email.toLowerCase() !== invite.email.toLowerCase() ? (
                                <p className="mt-6 text-sm text-terracotta">
                                    You're signed in as <span className="font-medium">{user.email}</span>, but this invite is for <span className="font-medium">{invite.email}</span>. Sign out and use the correct account.
                                </p>
                            ) : (
                                <button
                                    onClick={accept}
                                    disabled={accepting}
                                    data-testid="invite-accept-btn"
                                    className="mt-6 w-full bg-primary-k text-white rounded-md py-3 text-sm hover:bg-[#16294a] disabled:opacity-60 inline-flex items-center justify-center gap-2"
                                >
                                    {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    {accepting ? "Joining…" : "Accept invitation"}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
