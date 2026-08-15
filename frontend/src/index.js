import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { initSentry, Sentry } from "@/lib/sentry";

initSentry();

// react-snap prerender support (FRONTEND-REBALANCE-1): when the postbuild
// step actually runs react-snap (RUN_PRERENDER=1), the emitted HTML has
// pre-hydrated markup in #root and we need `hydrateRoot`. Without prerender
// #root is empty and we use the standard `createRoot`. `hasChildNodes()`
// is react-snap's recommended detection method.
//
// NOTE: third-party scripts loaded BEFORE our bundle (Emergent main.js,
// PostHog) never inject into #root, so hasChildNodes() is safe here.
const rootEl = document.getElementById("root");

const app = (
    <React.StrictMode>
        <Sentry.ErrorBoundary
            fallback={({ resetError }) => (
                <div role="alert" style={{ padding: "2rem", textAlign: "center", maxWidth: 560, margin: "10vh auto", fontFamily: "system-ui, sans-serif" }}>
                    <h1 style={{ fontSize: "1.5rem", color: "#0E2A47", marginBottom: ".5rem" }}>Something went wrong.</h1>
                    <p style={{ color: "#4b5563", marginBottom: "1.5rem" }}>
                        Our team has been notified. Refresh the page to try again.
                    </p>
                    <button
                        data-testid="sentry-error-boundary-reset"
                        onClick={resetError}
                        style={{ background: "#1F3A5F", color: "white", border: 0, padding: "0.75rem 1.5rem", borderRadius: 8, cursor: "pointer" }}
                    >
                        Try again
                    </button>
                </div>
            )}
        >
            <App />
        </Sentry.ErrorBoundary>
    </React.StrictMode>
);

// Prefer createRoot for SPA. Only hydrate if #root already has children from
// a react-snap prerender (extremely defensive: also confirm the first child
// is an ELEMENT node, not accidental whitespace/text injection).
const firstChild = rootEl?.firstElementChild;
if (firstChild) {
    ReactDOM.hydrateRoot(rootEl, app);
} else {
    ReactDOM.createRoot(rootEl).render(app);
}
