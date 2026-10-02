import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Catches render/runtime errors in any admin screen so a single broken page
 * shows a friendly, recoverable message instead of blanking the whole admin.
 * Reset automatically on navigation via the `resetKey` prop (route path).
 */
class Boundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidUpdate(prev) {
        if (prev.resetKey !== this.props.resetKey && this.state.error) {
            this.setState({ error: null });
        }
    }
    render() {
        if (this.state.error) {
            return (
                <div className="admin-card" style={{ padding: 28, maxWidth: 620 }} data-testid="admin-screen-error">
                    <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>This screen hit an error</h2>
                    <p style={{ color: "var(--admin-muted)", fontSize: 14, marginBottom: 16 }}>
                        Something on this page failed to load. The rest of the admin still works — use the sidebar to continue, or retry.
                    </p>
                    <pre style={{ background: "var(--admin-bg-subtle, rgba(0,0,0,0.04))", padding: 12, borderRadius: 8, fontSize: 12, color: "var(--admin-critical)", overflow: "auto", marginBottom: 16 }}>
                        {String(this.state.error?.message || this.state.error)}
                    </pre>
                    <button className="admin-btn admin-btn-secondary" onClick={() => this.setState({ error: null })} data-testid="admin-screen-error-retry">
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function AdminErrorBoundary({ children }) {
    const location = useLocation();
    useNavigate(); // ensure router context; boundary resets on path change
    return <Boundary resetKey={location.pathname}>{children}</Boundary>;
}
