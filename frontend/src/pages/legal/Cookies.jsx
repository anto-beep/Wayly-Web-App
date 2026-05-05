import React from "react";
import LegalPage from "./LegalPage";

export default function Cookies() {
    return (
        <LegalPage title="Cookie Policy" lastUpdated="February 2026">
            <p>
                Kindred uses a small number of cookies to make the product work. We do not use advertising
                cookies or tracking cookies for third-party advertising purposes.
            </p>

            <h2>Essential cookies (cannot be disabled)</h2>
            <ul>
                <li><strong>Session cookie:</strong> keeps you logged in</li>
                <li><strong>Security cookie:</strong> CSRF protection</li>
                <li>
                    <strong>Rate limit cookie:</strong> tracks Statement Decoder free use (24hr TTL).
                    Contains only: timestamp of last use. No personal information.
                </li>
            </ul>

            <h2>Analytics cookies (can be disabled)</h2>
            <ul>
                <li><strong>Plausible Analytics:</strong> cookieless by default — no cookie set</li>
                <li>
                    <strong>PostHog:</strong> session recording for logged-in product improvement.
                    Contains anonymised session data. PII fields are masked.
                </li>
            </ul>

            <h2>Preference cookies</h2>
            <ul>
                <li>Language preference</li>
                <li>Appearance preference (light/dark/system)</li>
                <li>Onboarding progress</li>
            </ul>

            <h2>How to disable</h2>
            <p>
                Manage cookies in your browser settings. Disabling essential cookies will prevent Kindred
                from working correctly.
            </p>
        </LegalPage>
    );
}
