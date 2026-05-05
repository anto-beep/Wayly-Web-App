import React from "react";
import LegalPage from "./LegalPage";

export default function Terms() {
    return (
        <LegalPage title="Terms of Service" lastUpdated="February 2026">
            <h2>1. What Kindred is and is not</h2>
            <p>
                Kindred is an information tool. It is not a registered aged-care provider, financial adviser,
                legal adviser, or healthcare provider. Nothing on Kindred is advice of any kind. AI outputs
                may contain errors. Always verify before acting.
            </p>

            <h2>2. What you are agreeing to</h2>
            <p>
                By using Kindred you agree to use it only for lawful purposes, not to share your account,
                and to verify AI outputs before acting on them.
            </p>

            <h2>3. AI accuracy and limitation of liability</h2>
            <p>
                Kindred's AI tools may produce incorrect results. Kindred is not responsible for losses
                arising from reliance on AI-generated outputs. Our liability to you is capped at the amount
                you paid us in the 12 months before any claim. We are not liable for consequential or
                indirect losses.
            </p>

            <h2>4. Your data</h2>
            <p>
                We store your data in Australia. We do not sell it. We do not use it to train AI models
                without your consent. If you delete your account, your data is permanently deleted within
                30 days.
            </p>

            <h2>5. Subscriptions and cancellation</h2>
            <p>
                Plans are billed monthly or annually. Cancel anytime with one click. 30-day full refund on
                any paid plan. Trials are free, no card required, one per person.
            </p>

            <h2>6. Changes to these terms</h2>
            <p>
                We will give you 30 days notice of any material change to these terms. Continued use after
                the notice period means you accept the changes.
            </p>

            <h2>7. Governing law</h2>
            <p>
                These terms are governed by the laws of Victoria, Australia. Disputes are subject to the
                jurisdiction of Victorian courts.
            </p>
        </LegalPage>
    );
}
