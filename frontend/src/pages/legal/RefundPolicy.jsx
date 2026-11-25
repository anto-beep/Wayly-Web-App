import React from "react";
import LegalPage from "@/pages/legal/LegalPage";
import { Link } from "react-router-dom";
import { TRIAL_DAYS, PLAN_PRICE } from "@/config/planFacts";

/**
 * Refund Policy, CONV-1 v2 Workstream E5.
 *
 * Plain-English refund policy. Stance: cancel any time, no refunds on
 * part-months. All figures pull from planFacts so they never drift from
 * Pricing/Signup.
 */
export default function RefundPolicy() {
    return (
        <LegalPage
            title="Refund Policy"
            path="/legal/refund-policy"
            lastUpdated="25 November 2026"
            description="How Wayly's free trial, billing and refunds work for Australian Support at Home subscribers."
        >
            <p>
                This policy explains how billing, cancellation and refunds work for a paid Wayly
                subscription (Solo or Family). It should be read alongside our{" "}
                <Link to="/legal/terms">Terms of Service</Link> and{" "}
                <Link to="/legal/trial-terms">Free Trial Terms</Link>.
            </p>

            <h2>Your {TRIAL_DAYS}-day free trial</h2>
            <p>
                Every paid plan starts with a {TRIAL_DAYS}-day free trial. You are not charged
                during the trial. If you cancel before the trial ends, you are never billed and
                there is nothing to refund.
            </p>

            <h2>When you are charged</h2>
            <p>
                If you do not cancel during the trial, your subscription begins and your card is
                charged at the start of your first paid period: {PLAN_PRICE.solo} per fortnight for
                Solo, or {PLAN_PRICE.family} per fortnight for Family. Each period renews
                automatically until you cancel.
            </p>

            <h2>Cancelling</h2>
            <p>
                You can cancel at any time from <strong>Settings → Billing → Cancel plan</strong>,
                in a couple of clicks, with no retention hoops. When you cancel:
            </p>
            <ul>
                <li>You keep full access until the end of the period you have already paid for.</li>
                <li>You are not charged again.</li>
                <li>
                    Your data is kept for 30 days in case you come back, then permanently deleted.
                </li>
            </ul>

            <h2>Refunds</h2>
            <p>
                Because you can cancel at any time and keep access until the end of the current
                period, <strong>we do not refund part-used periods</strong>. Cancelling stops
                future charges rather than refunding the period you are in.
            </p>
            <p>
                We may still issue a refund at our discretion, for example if you were charged in
                error or because of a genuine fault on our side. If something does not look right
                with a charge, contact us and we will look into it promptly.
            </p>

            <h2>Your rights under Australian Consumer Law</h2>
            <p>
                Nothing in this policy limits your rights under the Australian Consumer Law. Our
                services come with guarantees that cannot be excluded. If a service is not
                delivered with due care and skill, or is not fit for its stated purpose, you may be
                entitled to a remedy, including a refund, regardless of the general position above.
            </p>

            <h2>How to reach us</h2>
            <p>
                Email us from the <Link to="/contact">Contact page</Link> and we will reply within
                one business day.
            </p>
        </LegalPage>
    );
}
