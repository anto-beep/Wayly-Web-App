import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldCheck, Activity, KeyRound, AlertCircle, ArrowUpRight } from "lucide-react";
import { adminApi, useAdminAuth } from "./AdminAuthContext";

const STEP = { CREDENTIALS: 0, SETUP: 1, VERIFY: 2 };

/**
 * Wayly Admin sign-in.
 *
 * This page intentionally carries more context than a typical login screen:
 *   - Operators arrive here in different states (new joiner, on-call,
 *     incident responder). Surface the things they always check.
 *   - Reinforces that this is a *privileged* surface, not the consumer app.
 *   - Pulls a live health snapshot from `/api/health/deep` so an operator
 *     can spot a degraded environment before they even sign in.
 */
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
    const [setupData, setSetupData] = useState(null);
    const [backupCodes, setBackupCodes] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [health, setHealth] = useState(null);

    // Bounce to /admin if already signed in.
    useEffect(() => {
        if (admin) {
            const dest = loc.state?.from || "/admin";
            nav(dest, { replace: true });
        }
    }, [admin, loc.state, nav]);

    // Live health probe, public liveness endpoint. Refreshed every 30 s.
    useEffect(() => {
        let cancelled = false;
        const fetchHealth = async () => {
            try {
                const r = await fetch("/api/health", { cache: "no-store" });
                const j = await r.json();
                if (!cancelled) setHealth({ ok: r.ok && j.status === "ok", ...j });
            } catch {
                if (!cancelled) setHealth({ ok: false, status: "unreachable" });
            }
        };
        fetchHealth();
        const t = setInterval(fetchHealth, 30000);
        return () => { cancelled = true; clearInterval(t); };
    }, []);

    if (admin) return null;

    const submitCreds = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            const r = await adminApi.post("/admin/auth/login", { email, password });
            if (r.data.requires_2fa_setup) {
                setSetupData(r.data);
                setStep(STEP.SETUP);
                toast.info("First-time setup, scan the QR with your authenticator app");
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
            const r = await adminApi.post("/admin/auth/2fa/enable", { setup_token: setupData.setup_token, code });
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
            const r = await adminApi.post("/admin/auth/2fa/verify", { temp_token: tempToken, code });
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

    const healthDot = !health
        ? "admin-status-dot admin-status-dot-warn"
        : health.ok ? "admin-status-dot admin-status-dot-ok admin-status-dot-pulse"
                    : "admin-status-dot admin-status-dot-down";
    const healthLabel = !health ? "Checking…" : health.ok ? "All systems operational" : "Degraded, investigate before signing in";

    return (
        <div className="admin-root" data-theme="light" style={S.root}>
            <div style={S.wrap}>

                {/* ---------- LEFT: brand + context panel ---------- */}
                <aside style={S.left} data-testid="admin-login-context">
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <img src="/branding/svg/wayly-mark-mono-white.svg" alt="Wayly" width="44" height="44" />
                        <div>
                            <div className="admin-heading" style={{ fontSize: 22, lineHeight: 1.1 }}>Wayly Admin</div>
                            <div style={{ fontSize: 11, color: "var(--admin-muted)", textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 4 }}>
                                Operations console
                            </div>
                        </div>
                    </div>

                    <p style={S.lead}>
                        Internal tooling for the Wayly support team. Audit-logged actions for billing,
                        cost monitoring, anomaly review and incident response.
                    </p>

                    <ul style={S.featureList}>
                        <li style={S.featureItem}><ShieldCheck size={15} style={{ color: "var(--admin-success)", flexShrink: 0, marginTop: 2 }} /><span>Every action signed, hashed and replayable from the audit log.</span></li>
                        <li style={S.featureItem}><Activity size={15} style={{ color: "var(--admin-info)", flexShrink: 0, marginTop: 2 }} /><span>Real-time anomaly alerts, LLM cost ledger and Stripe revenue.</span></li>
                        <li style={S.featureItem}><KeyRound size={15} style={{ color: "var(--admin-warning)", flexShrink: 0, marginTop: 2 }} /><span>2-factor required. Backup codes are shown once at enrolment.</span></li>
                    </ul>

                    <div className="admin-info-grid" data-testid="admin-login-status">
                        <div className="row">
                            <span><span className={healthDot} />Live system status</span>
                            <span>{healthLabel}</span>
                        </div>
                        {health?.version && (
                            <div className="row">
                                <span>Build</span>
                                <span className="admin-mono">{health.version}</span>
                            </div>
                        )}
                        <div className="row">
                            <span>Region</span>
                            <span>AU · production</span>
                        </div>
                        <div className="row">
                            <span>API response</span>
                            <span>{health?.ts ? new Date(health.ts).toLocaleTimeString("en-AU", { hour12: false }) : ", "}</span>
                        </div>
                    </div>

                    <div style={{ marginTop: 20, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
                        <a className="admin-link" href="/status" target="_blank" rel="noreferrer">Public status page <ArrowUpRight size={11} style={{ verticalAlign: -1 }} /></a>
                        <a className="admin-link" href="mailto:support@wayly.com.au?subject=Admin%20access">Need access?</a>
                        <a className="admin-link" href="/docs/monitoring-runbook.md" target="_blank" rel="noreferrer">Runbook</a>
                    </div>

                    <div style={S.notice} role="note">
                        <AlertCircle size={14} style={{ color: "var(--admin-warning)", flexShrink: 0, marginTop: 2 }} />
                        <span>
                            Restricted access. All sign-ins, queries and exports are recorded.
                            Unauthorised access is monitored and prosecuted under the
                            Australian <em>Criminal Code Act 1995</em>.
                        </span>
                    </div>
                </aside>

                {/* ---------- RIGHT: auth card ---------- */}
                <div className="admin-card" style={S.right}>
                    {step === STEP.CREDENTIALS && (
                        <form onSubmit={submitCreds} data-testid="admin-login-form">
                            <h2 className="admin-heading" style={{ fontSize: 24, marginBottom: 6 }}>Sign in</h2>
                            <p style={{ color: "var(--admin-muted)", marginBottom: 24, fontSize: 13 }}>
                                Use your Wayly admin credentials. You'll be asked for a 2FA code on the next step.
                            </p>
                            <label style={lab}>Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
                                placeholder="you@wayly.com.au"
                                className="admin-input" data-testid="admin-login-email" />
                            <label style={{ ...lab, marginTop: 16 }}>Password</label>
                            <div style={{ position: "relative" }}>
                                <input type={showPassword ? "text" : "password"} value={password}
                                    onChange={(e) => setPassword(e.target.value)} required
                                    className="admin-input" style={{ paddingRight: 40 }} data-testid="admin-login-password" />
                                <button type="button" onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    style={S.eyeBtn} data-testid="admin-login-toggle-password">
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <button type="submit" disabled={busy} className="admin-btn"
                                style={{ width: "100%", marginTop: 24 }} data-testid="admin-login-submit">
                                {busy ? "Signing in…" : "Continue"}
                            </button>

                            <p style={S.helpLine}>
                                Locked out? <a className="admin-link" href="mailto:support@wayly.com.au?subject=Admin%20lockout">Email the on-call</a>.
                            </p>
                        </form>
                    )}

                    {step === STEP.SETUP && setupData && !backupCodes && (
                        <form onSubmit={submitSetup} data-testid="admin-2fa-setup">
                            <h2 className="admin-heading" style={{ fontSize: 24, marginBottom: 6 }}>Set up 2FA</h2>
                            <p style={{ color: "var(--admin-muted)", marginBottom: 16, fontSize: 13 }}>
                                Scan the QR with your authenticator (1Password, Authy, Google Authenticator).
                            </p>
                            <div style={S.qrWrap}>
                                <img src={setupData.qr_data_uri} alt="Scan to set up 2FA" width="200" height="200" data-testid="admin-2fa-qr" />
                            </div>
                            <details style={{ marginBottom: 16, fontSize: 12, color: "var(--admin-muted)" }}>
                                <summary style={{ cursor: "pointer" }}>Can't scan? Enter the secret manually</summary>
                                <code className="admin-mono" style={S.secretBox}>{setupData.secret}</code>
                            </details>
                            <label style={lab}>6-digit code from your app</label>
                            <input type="text" inputMode="numeric" pattern="[0-9]*" value={code} maxLength={6}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                                required autoFocus className="admin-input admin-mono"
                                style={S.codeInput} data-testid="admin-2fa-setup-code" />
                            <button type="submit" disabled={busy || code.length !== 6} className="admin-btn"
                                style={{ width: "100%", marginTop: 20 }} data-testid="admin-2fa-setup-submit">
                                {busy ? "Verifying…" : "Verify and enable 2FA"}
                            </button>
                        </form>
                    )}

                    {backupCodes && (
                        <div data-testid="admin-2fa-backup-codes">
                            <h2 className="admin-heading" style={{ fontSize: 24, marginBottom: 6 }}>Save your backup codes</h2>
                            <p style={{ color: "var(--admin-muted)", marginBottom: 16, fontSize: 13 }}>
                                Each code works once. Use them if you lose your authenticator.{" "}
                                <strong style={{ color: "var(--admin-warning)" }}>This is the only time we will show them.</strong>
                            </p>
                            <div className="admin-mono" style={S.backupGrid}>
                                {backupCodes.map((c) => <div key={c} style={{ fontSize: 14, letterSpacing: "0.1em" }}>{c}</div>)}
                            </div>
                            <button onClick={() => navigator.clipboard?.writeText(backupCodes.join("\n"))}
                                className="admin-btn admin-btn-secondary" style={{ marginTop: 12, width: "100%" }}>
                                Copy all codes
                            </button>
                            <button onClick={continueAfterBackup} className="admin-btn"
                                style={{ marginTop: 12, width: "100%" }} data-testid="admin-2fa-continue">
                                I've saved them, continue
                            </button>
                        </div>
                    )}

                    {step === STEP.VERIFY && (
                        <form onSubmit={submitVerify} data-testid="admin-2fa-verify">
                            <h2 className="admin-heading" style={{ fontSize: 24, marginBottom: 6 }}>Two-factor</h2>
                            <p style={{ color: "var(--admin-muted)", marginBottom: 16, fontSize: 13 }}>
                                Enter the 6-digit code from your authenticator, or an 8-character backup code.
                            </p>
                            <input type="text" value={code} maxLength={8}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                required autoFocus className="admin-input admin-mono"
                                style={S.codeInput} data-testid="admin-2fa-verify-code" />
                            <button type="submit" disabled={busy || code.length < 6} className="admin-btn"
                                style={{ width: "100%", marginTop: 20 }} data-testid="admin-2fa-verify-submit">
                                {busy ? "Verifying…" : "Verify"}
                            </button>
                            <p style={S.helpLine}>
                                Lost your device? Use a backup code, or{" "}
                                <a className="admin-link" href="mailto:support@wayly.com.au?subject=Admin%202FA%20recovery">request recovery</a>.
                            </p>
                        </form>
                    )}
                </div>
            </div>

            <footer style={S.footer}>
                <span>Wayly Pty Ltd · Sydney, AU</span>
                <span>v{health?.version || ", "}</span>
            </footer>
        </div>
    );
}

const lab = { display: "block", fontSize: 11, marginBottom: 6, color: "var(--admin-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" };

const S = {
    root: { minHeight: "100vh", display: "flex", flexDirection: "column", padding: "32px 24px" },
    wrap: {
        flex: 1,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(380px, 460px)",
        gap: 40,
        alignItems: "center",
        maxWidth: 1100,
        width: "100%",
        margin: "0 auto",
        position: "relative",
        zIndex: 1,
    },
    left: { maxWidth: 520, padding: "20px 4px" },
    lead: { color: "var(--admin-text-soft)", fontSize: 15, lineHeight: 1.55, marginTop: 24 },
    featureList: {
        listStyle: "none", padding: 0, margin: "20px 0 0", display: "grid", gap: 10,
        color: "var(--admin-text-soft)", fontSize: 13.5, lineHeight: 1.45,
    },
    featureItem: { display: "flex", alignItems: "flex-start", gap: 10 },
    notice: {
        marginTop: 24,
        background: "rgba(221, 144, 105, 0.07)",
        border: "1px solid rgba(221, 144, 105, 0.22)",
        padding: "10px 12px",
        borderRadius: 10,
        fontSize: 12,
        color: "var(--admin-text-soft)",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        lineHeight: 1.45,
    },
    right: { width: "100%", padding: 32 },
    eyeBtn: {
        position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
        background: "transparent", border: 0, color: "var(--admin-muted)",
        cursor: "pointer", padding: 6, display: "inline-flex", alignItems: "center",
    },
    qrWrap: { display: "flex", justifyContent: "center", margin: "16px 0", padding: 16, background: "white", borderRadius: 12 },
    secretBox: { display: "block", marginTop: 8, padding: 10, background: "var(--admin-bg)", borderRadius: 6, color: "var(--admin-text)" },
    codeInput: { letterSpacing: "0.3em", textAlign: "center", fontSize: 18 },
    backupGrid: { background: "var(--admin-bg)", padding: 16, borderRadius: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
    helpLine: { color: "var(--admin-muted)", fontSize: 12.5, marginTop: 18, textAlign: "center" },
    footer: {
        marginTop: 32,
        display: "flex",
        justifyContent: "space-between",
        color: "var(--admin-muted)",
        fontSize: 11.5,
        opacity: 0.7,
        maxWidth: 1100,
        width: "100%",
        margin: "32px auto 0",
        position: "relative",
        zIndex: 1,
    },
};
