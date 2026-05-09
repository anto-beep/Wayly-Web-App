import React from "react";
import LegalPage from "./LegalPage";

export default function Privacy() {
    return (
        <LegalPage title="Privacy Policy" lastUpdated="February 2026">
            <h2>1. Who we are</h2>
            <p>
                Wayly Pty Ltd (ABN: [ABN placeholder]). Privacy Officer: <a href="mailto:privacy@wayly.com.au">privacy@wayly.com.au</a>.
            </p>

            <h2>2. What information we collect</h2>
            <ul>
                <li>Account information: name, email, password (hashed)</li>
                <li>Profile information: photo, nickname, timezone, language</li>
                <li>Household information: participant name, classification, provider, family members</li>
                <li>Statement data: the text of Support at Home statements you submit</li>
                <li>Usage data: pages visited, tools used, session information</li>
                <li>Payment information: processed by Stripe, we do not store card numbers</li>
                <li>Communications: support emails, feedback</li>
            </ul>

            <h2>3. Why we collect it</h2>
            <ul>
                <li>To provide the Wayly service</li>
                <li>To process payments</li>
                <li>To send you notifications you have opted into</li>
                <li>To improve the product (using anonymised, aggregated data)</li>
                <li>To comply with legal obligations</li>
            </ul>

            <h2>4. How we use AI</h2>
            <p>
                When you use Wayly's AI tools, the text you submit is sent to Anthropic's Claude API for
                processing. Anthropic is located in the United States. This is a cross-border disclosure
                under APP 8. Anthropic's data handling terms apply to this processing. We send only the
                minimum data necessary for the task. We do not use your personal data to train AI models
                without your explicit consent.
            </p>

            <h2>5. Who we share data with</h2>
            <ul>
                <li>Anthropic (AI processing — US)</li>
                <li>AWS (hosting — Australia)</li>
                <li>Stripe (payments — US)</li>
                <li>Customer.io or equivalent (email — disclosed location)</li>
                <li>PostHog (analytics — disclosed location)</li>
            </ul>
            <p>We do not sell data to any third party.</p>

            <h2>6. How long we keep it</h2>
            <p>
                Active account: retained while account is active. Deleted account: permanently deleted
                within 30 days. Legal hold: if required by law, may be retained longer.
            </p>

            <h2>7. Your rights under the Australian Privacy Principles</h2>
            <p>Access. Correction. Deletion. Portability. Complaint.</p>

            <h2>8. Cookies</h2>
            <p>
                See our <a href="/legal/cookies">Cookie Policy</a> for details on what cookies we use,
                why, and how to disable them.
            </p>

            <h2>9. Children</h2>
            <p>
                Wayly is not intended for use by people under 18. We do not knowingly collect data from
                children.
            </p>

            <h2>10. Complaints</h2>
            <p>
                If you believe we have breached your privacy, contact us at{" "}
                <a href="mailto:privacy@wayly.com.au">privacy@wayly.com.au</a>. If unsatisfied with our response,
                you may complain to the Office of the Australian Information Commissioner at{" "}
                <a href="https://oaic.gov.au" target="_blank" rel="noreferrer">oaic.gov.au</a>.
            </p>
        </LegalPage>
    );
}
