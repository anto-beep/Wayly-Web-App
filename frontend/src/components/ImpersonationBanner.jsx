import React from "react";
import { toast } from "sonner";

export default function ImpersonationBanner() {
    const [active, setActive] = React.useState(() => Boolean(localStorage.getItem("wayly_impersonation_token")));
    const target = localStorage.getItem("wayly_impersonation_target");

    React.useEffect(() => {
        const onStorage = () => setActive(Boolean(localStorage.getItem("wayly_impersonation_token")));
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    if (!active) return null;

    const stop = () => {
        localStorage.removeItem("wayly_impersonation_token");
        localStorage.removeItem("wayly_impersonation_target");
        setActive(false);
        toast.info("Impersonation stopped");
        window.location.reload();
    };

    return (
        <div
            data-testid="impersonation-banner"
            style={{
                position: "sticky", top: 0, zIndex: 100,
                background: "#E53E3E", color: "white", padding: "8px 16px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                fontSize: 13, fontWeight: 600,
            }}>
            <span>
                🛡️ <strong>ADMIN VIEW (read-only)</strong> — impersonating <strong>{target || "user"}</strong>. All actions disabled. Logged.
            </span>
            <button onClick={stop} style={{ background: "white", color: "#E53E3E", border: 0, padding: "4px 12px", borderRadius: 4, fontWeight: 700, cursor: "pointer" }} data-testid="impersonation-stop">
                Stop impersonation
            </button>
        </div>
    );
}
