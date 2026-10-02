import React from "react";
import ServerError from "@/pages/ServerError";

/**
 * Phase 8, Top-level error boundary.
 *
 * Catches any uncaught render error inside the route tree and renders the
 * custom 500 page. ServerError logs the error to PostHog + Plausible.
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
         
        console.error("Uncaught render error:", error, info);
    }
    resetError = () => this.setState({ error: null });
    render() {
        if (this.state.error) {
            return <ServerError error={this.state.error} resetError={this.resetError} />;
        }
        return this.props.children;
    }
}
