import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminAcceptInvite() {
    const loc = useLocation();
    const nav = useNavigate();
    const params = new URLSearchParams(loc.search);
    const token = params.get("token");
    const [invite, setInvite] = useState(null);
    const [loadErr, setLoadErr] = useState(null);
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);

    useEffect(() => {
        if (!token) { setLoadErr("Missing invite token in URL."); return; }
        axios.get(`${API}/admin/invite/${token}`)
            .then((r) => setInvite(r.data))
            .catch((e) => setLoadErr(e?.response?.data?.detail || "Invite not found."));
    }, [token]);

    const submit = async (e) => {
        e.preventDefault();
        if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
        if (password !== confirm) { toast.error("Passwords don't match"); return; }
        setBusy(true);
        try {
            await axios.post(`${API}/admin/invite/accept`, { token, password });
            setDone(true);
            toast.success("Welcome to the Wayly admin team!");
        } catch (e) {
            const msg = e?.response?.data?.detail;
            toast.error(typeof msg === "string" ? msg : "Couldn't accept invite");
        } finally { setBusy(false); }
    };

    const wrapStyle = { minHeight: "100vh", background: "#0F172A", color: "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 };
    const cardStyle = { background: "#1E293B", border: "1px solid #334155", borderRadius: 12, maxWidth: 440, width: "100%", padding: 32 };
    const lab = { display: "block", fontSize: 11, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 };
    const input = { width: "100%", background: "#0F172A", border: "1px solid #334155", color: "#E2E8F0", borderRadius: 6, padding: "10px 12px", fontSize: 14, boxSizing: "border-box" };

    if (loadErr) return (
        <div style={wrapStyle} data-testid="accept-invite-error">
            <div style={cardStyle}>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Invite unavailable</h1>
                <p style={{ color: "#94A3B8" }}>{loadErr}</p>
                <button onClick={() => nav("/")} style={{ marginTop: 20, background: "#D4A24E", color: "#1F3A5F", border: 0, padding: "10px 18px", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>Go home</button>
            </div>
        </div>
    );
    if (!invite) return <div style={wrapStyle}><div style={cardStyle}>Loading invite…</div></div>;
    if (invite.status !== "pending" || invite.expired) return (
        <div style={wrapStyle} data-testid="accept-invite-stale">
            <div style={cardStyle}>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>This invite is no longer valid</h1>
                <p style={{ color: "#94A3B8", fontSize: 14 }}>{invite.expired ? "The link has expired." : `This invite has been ${invite.status}.`} Ask a super admin to send a new one.</p>
            </div>
        </div>
    );
    if (done) return (
        <div style={wrapStyle} data-testid="accept-invite-done">
            <div style={cardStyle}>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>You're in 🎉</h1>
                <p style={{ color: "#94A3B8", fontSize: 14, marginBottom: 16 }}>Your admin account is ready. Sign in below to set up two-factor authentication.</p>
                <button onClick={() => nav("/admin/login")} style={{ width: "100%", background: "#D4A24E", color: "#1F3A5F", border: 0, padding: "12px 18px", borderRadius: 6, fontWeight: 600, cursor: "pointer" }} data-testid="accept-invite-signin">Sign in to admin</button>
            </div>
        </div>
    );

    return (
        <div style={wrapStyle}>
            <form onSubmit={submit} style={cardStyle} data-testid="accept-invite-form">
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#D4A24E", marginBottom: 8 }}>Wayly admin · Accept invite</div>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Welcome, {invite.name}</h1>
                <p style={{ color: "#94A3B8", fontSize: 14, marginBottom: 20 }}>
                    {invite.invited_by_email || "A super admin"} has invited you as <strong style={{ color: "#E2E8F0" }}>{invite.admin_role.replace("_", " ")}</strong>.
                    Choose a password — you'll set up two-factor authentication on first sign-in.
                </p>
                <label style={lab}>Email</label>
                <input value={invite.email} readOnly style={{ ...input, opacity: 0.7 }} />
                <label style={{ ...lab, marginTop: 16 }}>Choose a password</label>
                <div style={{ position: "relative" }}>
                    <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={{ ...input, paddingRight: 40 }} data-testid="accept-password" />
                    <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}
                        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, color: "#94A3B8", cursor: "pointer", padding: 6 }}
                        data-testid="accept-toggle-password">
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                </div>
                <label style={{ ...lab, marginTop: 16 }}>Confirm password</label>
                <input type={showPw ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} style={input} data-testid="accept-confirm" />
                <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 12 }}>Minimum 8 characters. Use a strong, unique password.</p>
                <button type="submit" disabled={busy} style={{ width: "100%", background: "#D4A24E", color: "#1F3A5F", border: 0, padding: "12px 18px", borderRadius: 6, fontWeight: 600, cursor: "pointer", marginTop: 20 }} data-testid="accept-submit">
                    {busy ? "Creating your account…" : "Accept and create account"}
                </button>
            </form>
        </div>
    );
}
