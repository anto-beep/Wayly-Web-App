import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { initSentry, Sentry } from "@/lib/sentry";

initSentry();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
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
  </React.StrictMode>,
);
