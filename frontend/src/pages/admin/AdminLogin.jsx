import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { adminApi, useAdminAuth } from "./AdminAuthContext";

const STEP = { CREDENTIALS: 0, SETUP: 1, VERIFY: 2 };

export default function AdminLogin() {
    const nav = useNavigate();
    const loc = useLocation();
    const { setToken, refreshMe, admin } = useAdminAuth();
    const [step, setStep] = useState(STEP.CREDENTIALS);
    const [busy, setBusy] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [tempToken, setTempToken] = useState(null);
    const [setupData, setSetupData] = useState(null); // {setup_token, qr_data_uri, secret}
    const [backupCodes, setBackupCodes] = useState(null);
    const [showPassword, setShowPassword] = useState(false);

    // If already logged in, bounce to /admin (in an effect to avoid render-time setState)
    useEffect(() => {
        if (admin) {
            const dest = loc.state?.from || "/admin";
            nav(dest, { replace: true });
        }
    }, [admin, loc.state, nav]);
    if (admin) return null;

    const submitCreds = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await adminApi.post("/admin/auth/login", { email, password });
            if (r.data.requires_2fa_setup) {
                setSetupData(r.data);
                setStep(STEP.SETUP);
                toast.info("First-time setup — scan the QR code with your authenticator app");
            } else if (r.data.requires_2fa) {
                setTempToken(r.data.temp_token);
                setStep(STEP.VERIFY);
            }
        } catch (err) {
            const msg = err?.response?.data?.detail || err.message;
            toast.error(typeof msg === "string" ? msg : "Login failed");
        } finally {
            setBusy(false);
        }
    };

    const submitSetup = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await adminApi.post("/admin/auth/2fa/enable", {
                setup_token: setupData.setup_token,
                code,
            });
            setToken(r.data.token);
            setBackupCodes(r.data.backup_codes);
        } catch (err) {
            const msg = err?.response?.data?.detail || err.message;
            toast.error(typeof msg === "string" ? msg : "Verification failed");
        } finally {
            setBusy(false);
        }
    };

    const submitVerify = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await adminApi.post("/admin/auth/2fa/verify", {
                temp_token: tempToken,
                code,
            });
            setToken(r.data.token);
            await refreshMe();
            nav("/admin", { replace: true });
        } catch (err) {
            const msg = err?.response?.data?.detail || err.message;
            toast.error(typeof msg === "string" ? msg : "Invalid 2FA code");
        } finally {
            setBusy(false);
        }
    };

    const continueAfterBackup = async () => {
        await refreshMe();
        nav("/admin", { replace: true });
    };

    return (
        <div className="admin-root" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
            <div className="admin-card" style={{ width: "100%", maxWidth: 440, padding: 32 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                    <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--admin-muted)" }}>Wayly</span>
                    <span style={{ color: "var(--admin-red)", fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>Admin</span>
                </div>

                {step === STEP.CREDENTIALS && (
                    <form onSubmit={submitCreds} data-testid="admin-login-form">
                        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Sign in</h2>
                        <p style={{ color: "var(--admin-muted)", marginBottom: 24, fontSize: 13 }}>
                            Restricted access. All activity is logged.
                        </p>
                        <label style={lab}>Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
                            className="admin-input" data-testid="admin-login-email" />
                        <label style={{ ...lab, marginTop: 16 }}>Password</label>
                        <div style={{ position: "relative" }}>
                            <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required
                                className="admin-input" style={{ paddingRight: 40 }} data-testid="admin-login-password" />
                            <button type="button" onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                title={showPassword ? "Hide password" : "Show password"}
                                style={{
                                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                                    background: "transparent", border: 0, color: "var(--admin-muted)",
                                    cursor: "pointer", padding: 6, display: "inline-flex", alignItems: "center",
                                }}
                                data-testid="admin-login-toggle-password">
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        <button type="submit" disabled={busy} className="admin-btn" style={{ width: "100%", marginTop: 24 }}
                            data-testid="admin-login-submit">
                            {busy ? "Signing in…" : "Continue"}
                        </button>
                    </form>
                )}

                {step === STEP.SETUP && setupData && !backupCodes && (
                    <form onSubmit={submitSetup} data-testid="admin-2fa-setup">
                        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Set up 2FA</h2>
                        <p style={{ color: "var(--admin-muted)", marginBottom: 16, fontSize: 13 }}>
                            Scan the QR with your authenticator app (Google Authenticator, 1Password, Authy).
                        </p>
                        <div style={{ display: "flex", justifyContent: "center", margin: "16px 0", padding: 16, background: "white", borderRadius: 8 }}>
                            <img src={setupData.qr_data_uri} alt="Scan to set up 2FA" width="200" height="200" data-testid="admin-2fa-qr" />
                        </div>
                        <details style={{ marginBottom: 16, fontSize: 12, color: "var(--admin-muted)" }}>
                            <summary style={{ cursor: "pointer" }}>Can't scan? Enter this code manually</summary>
                            <code className="admin-mono" style={{ display: "block", marginTop: 8, padding: 8, background: "var(--admin-bg)", borderRadius: 4 }}>
                                {setupData.secret}
                            </code>
                        </details>
                        <label style={lab}>Enter the 6-digit code from your app</label>
                        <input type="text" inputMode="numeric" pattern="[0-9]*" value={code} maxLength={6}
                            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                            required autoFocus className="admin-input admin-mono"
                            style={{ letterSpacing: "0.3em", textAlign: "center", fontSize: 18 }}
                            data-testid="admin-2fa-setup-code" />
                        <button type="submit" disabled={busy || code.length !== 6} className="admin-btn"
                            style={{ width: "100%", marginTop: 20 }} data-testid="admin-2fa-setup-submit">
                            {busy ? "Verifying…" : "Verify and enable 2FA"}
                        </button>
                    </form>
                )}

                {backupCodes && (
                    <div data-testid="admin-2fa-backup-codes">
                        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Save your backup codes</h2>
                        <p style={{ color: "var(--admin-muted)", marginBottom: 16, fontSize: 13 }}>
                            Each code works once. Use them if you lose your authenticator. <strong style={{ color: "var(--admin-warning)" }}>This is the only time we'll show them.</strong>
                        </p>
                        <div className="admin-mono" style={{ background: "var(--admin-bg)", padding: 16, borderRadius: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {backupCodes.map((c) => <div key={c} style={{ fontSize: 14, letterSpacing: "0.1em" }}>{c}</div>)}
                        </div>
                        <button onClick={() => navigator.clipboard?.writeText(backupCodes.join("\n"))} className="admin-btn admin-btn-secondary" style={{ marginTop: 12, width: "100%" }}>
                            Copy all codes
                        </button>
                        <button onClick={continueAfterBackup} className="admin-btn" style={{ marginTop: 12, width: "100%" }} data-testid="admin-2fa-continue">
                            I've saved them — continue
                        </button>
                    </div>
                )}

                {step === STEP.VERIFY && (
                    <form onSubmit={submitVerify} data-testid="admin-2fa-verify">
                        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Two-factor authentication</h2>
                        <p style={{ color: "var(--admin-muted)", marginBottom: 16, fontSize: 13 }}>
                            Enter the 6-digit code from your authenticator app, or an 8-character backup code.
                        </p>
                        <input type="text" value={code} maxLength={8}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            required autoFocus className="admin-input admin-mono"
                            style={{ letterSpacing: "0.3em", textAlign: "center", fontSize: 18 }}
                            data-testid="admin-2fa-verify-code" />
                        <button type="submit" disabled={busy || code.length < 6} className="admin-btn"
                            style={{ width: "100%", marginTop: 20 }} data-testid="admin-2fa-verify-submit">
                            {busy ? "Verifying…" : "Verify"}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

const lab = { display: "block", fontSize: 12, marginBottom: 6, color: "var(--admin-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" };
