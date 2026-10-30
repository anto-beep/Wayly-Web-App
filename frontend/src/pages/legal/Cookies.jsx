import React from "react";
import LegalPage from "./LegalPage";

export default function Cookies() {
    return (
        <LegalPage title="Cookie Policy" path="/legal/cookies" description="Cookies Wayly uses to keep you signed in, remember your participant context, measure how Australian families use our tools, and — only with your consent — measure our Google advertising." lastUpdated="June 2026">
            <p>
                Wayly uses a small number of cookies to make the product work, to measure how families use
                our tools, and — only if you agree — to measure the performance of our own advertising on
                Google. We never use what you paste or upload into the tools for advertising.
            </p>

            <h2>Essential Cookies (Cannot Be Disabled)</h2>
            <ul>
                <li><strong>Session cookie:</strong> keeps you logged in</li>
                <li><strong>Security cookie:</strong> CSRF protection</li>
                <li>
                    <strong>Rate limit cookie:</strong> tracks Statement Decoder free use (24hr TTL).
                    Contains only: timestamp of last use. No personal information.
                </li>
            </ul>

            <h2>Analytics Cookies (Can Be Disabled)</h2>
            <ul>
                <li><strong>Plausible Analytics:</strong> cookieless by default, no cookie set</li>
                <li>
                    <strong>PostHog:</strong> session recording for logged-in product improvement.
                    Contains anonymised session data. PII fields are masked.
                </li>
            </ul>

            <h2>Preference Cookies</h2>
            <ul>
                <li>Language preference</li>
                <li>Appearance preference (light/dark/system)</li>
                <li>Onboarding progress</li>
            </ul>

            <h2>Advertising Cookies (Google Ads &amp; Meta) — Off by Default</h2>
            <ul>
                <li>
                    <strong>Google Ads / Google tag:</strong> measures which of our Google ads lead people
                    to start a Wayly trial. These cookies are <strong>denied by default</strong> and only
                    load after you choose “Accept all” (or enable advertising under “Choose”) in the cookie
                    banner. Choose “Only necessary” and none are set. They carry standard web-analytics
                    signals only — never your statement contents, dollar amounts, classification levels,
                    names or service details — and are not loaded inside the signed-in app or dashboard.
                </li>
                <li>
                    <strong>Meta Pixel:</strong> measures which of our Facebook and Instagram ads lead
                    people to start a Wayly trial. It follows the exact same rule — <strong>revoked by
                    default</strong>, nothing sent to Meta until you accept advertising in the banner, the
                    same privacy limits, and never loaded inside the signed-in app or dashboard.
                </li>
            </ul>

            <h2>Changing Your Choice</h2>
            <p>
                On your first visit we show a cookie banner with “Accept all”, “Only necessary” and
                “Choose”, and we remember your choice. You can clear Wayly&apos;s cookies in your browser at
                any time to be asked again.
            </p>

            <h2>How to Disable</h2>
            <p>
                Manage cookies in your browser settings. Disabling essential cookies will prevent Wayly
                from working correctly.
            </p>
        </LegalPage>
    );
}
