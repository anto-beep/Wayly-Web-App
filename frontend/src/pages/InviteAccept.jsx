import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck, CheckCircle2 } from "lucide-react";
import { api, setAuthToken, setRefreshToken, extractErrorMessage } from "@/lib/api";

/**
 * Invite accept / signup-via-invite (PERMS v3). Email-bound: the invited person
 * lands here from the emailed link, sets a name + password, and is signed in.
 * Participants get access immediately; caregivers land in a "waiting for
 * approval" state until the account holder approves them.
 */
export default function InviteAccept() {
    const [params] = useSearchParams();
    const token = params.get("token") || "";
    const nav = useNavigate();
    const [state, setState] = useState({ loading: true, invite: null, error: "" });
    const [form, setForm] = useState({ name: "", password: "" });
    const [busy, setBusy] = useState(false);
    const [pending, setPending] = useState(false);

    useEffect(() => {
        if (!token) { setState({ loading: false, invite: null, error: "This invite link is missing its code." }); return; }
        (async () => {
            try {
                const { data } = await api.get(`/invite/${token}`);
                setState({ loading: false, invite: data, error: "" });
            } catch (err) {
                setState({ loading: false, invite: null, error: extractErrorMessage(err, "This invite link is not valid.") });
            }
        })();
    }, [token]);

    const submit = async (e) => {
        e.preventDefault(); setBusy(true);
        try {
            const { data } = await api.post("/invite/accept", { token, name: form.name, password: form.password });
            setAuthToken(data.token);
            setRefreshToken(data.refresh_token);
            if (data.pending_approval) { setPending(true); }
            else { window.location.href = "/app"; }
        } catch (err) {
            setState((s) => ({ ...s, error: extractErrorMessage(err, "Could not accept the invite.") }));
        } finally { setBusy(false); }
    };

    const Shell = ({ children }) => (
        <div className="min-h-screen flex items-center justify-center bg-surface-2 p-4">
            <div className="bg-surface rounded-2xl shadow-xl max-w-md w-full p-8" data-testid="invite-accept">{children}</div>
        </div>
    );

    if (state.loading) return <Shell><div className="flex items-center gap-2 text-muted-k"><Loader2 className="h-5 w-5 animate-spin" /> Loading your invite…</div></Shell>;

    if (state.error && !state.invite) return (
        <Shell>
            <h1 className="font-heading text-2xl text-primary-k">Invite unavailable</h1>
            <p className="text-sm text-muted-k mt-2" data-testid="invite-error">{state.error}</p>
            <button onClick={() => nav("/login")} className="mt-6 text-sm text-primary-k underline">Go to login</button>
        </Shell>
    );

    if (pending) return (
        <Shell>
            <div className="h-12 w-12 rounded-full bg-sage/15 flex items-center justify-center mb-4"><CheckCircle2 className="h-6 w-6 text-sage" /></div>
            <h1 className="font-heading text-2xl text-primary-k" data-testid="invite-pending">You're all set — just waiting on approval</h1>
            <p className="text-sm text-muted-k mt-2">Your account is ready. {state.invite.inviter_name} needs to approve your access before you can see {state.invite.household_name}'s Family Wall. We'll email you the moment they do.</p>
            <button onClick={() => nav("/app")} className="mt-6 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm">Continue</button>
        </Shell>
    );

    const inv = state.invite;
    const isParticipant = inv.kind === "participant";
    if (inv.expired) return (
        <Shell><h1 className="font-heading text-2xl text-primary-k">This invite has expired</h1><p className="text-sm text-muted-k mt-2">Ask {inv.inviter_name} to send you a fresh invitation.</p></Shell>
    );
    if (inv.already_registered) return (
        <Shell><h1 className="font-heading text-2xl text-primary-k">You already have a Wayly account</h1><p className="text-sm text-muted-k mt-2">Please log in with {inv.email}.</p><button onClick={() => nav("/login")} className="mt-6 bg-primary-k text-white rounded-md px-5 py-2.5 text-sm">Go to login</button></Shell>
    );

    return (
        <Shell>
            <div className="h-12 w-12 rounded-full bg-sage/15 flex items-center justify-center mb-4"><ShieldCheck className="h-6 w-6 text-sage" /></div>
            <h1 className="font-heading text-2xl text-primary-k tracking-tight">
                {inv.inviter_name} invited you to {inv.household_name}'s Wayly
            </h1>
            <p className="text-sm text-muted-k mt-2">
                {isParticipant
                    ? "You'll be able to see your own Support at Home budget, statements and care plan."
                    : "As a family member you'll see the Family Wall and can post updates. You won't see statements, tools or billing."}
            </p>
            {inv.note && <p className="text-sm italic text-muted-k mt-2">"{inv.note}"</p>}
            <form onSubmit={submit} className="mt-6 space-y-3">
                <div><label className="text-sm text-muted-k">Email</label><input value={inv.email} disabled className="mt-1 w-full rounded-md border border-kindred bg-surface-2 px-3 py-2.5 text-muted-k" data-testid="invite-email" /></div>
                <div><label className="text-sm text-muted-k">Your name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="invite-name-input" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5" /></div>
                <div><label className="text-sm text-muted-k">Create a password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} data-testid="invite-password-input" className="mt-1 w-full rounded-md border border-kindred bg-surface px-3 py-2.5" /></div>
                {state.error && <p className="text-xs text-terracotta" data-testid="invite-submit-error">{state.error}</p>}
                <button type="submit" disabled={busy} data-testid="invite-accept-submit" className="w-full inline-flex items-center justify-center gap-2 bg-primary-k text-white rounded-md py-2.5 text-sm hover:bg-[#091D33] disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Accept & create account</button>
            </form>
        </Shell>
    );
}
