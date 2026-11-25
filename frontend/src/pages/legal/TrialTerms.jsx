import React from "react";
import LegalPage from "@/pages/legal/LegalPage";
import { Link } from "react-router-dom";
import { TRIAL_DAYS, PLAN_PRICE, PLAN_LABEL } from "@/config/planFacts";

/**
 * Free Trial Terms, CONV-1 v2 Workstream E6.
 *
 * The canonical, plain-English statement of how the free trial works, so the
 * same facts appear consistently wherever the trial is offered. DRAFT , 
 * pending legal review. Figures pull from planFacts (single source of truth).
 */
export default function TrialTerms() {
    return (
        <LegalPage
            title="Free Trial Terms"
            path="/legal/trial-terms"
            lastUpdated="Draft, pending legal review"
            description="How Wayly's 7-day free trial works: what you get, when you're charged, and how to cancel."
        >
            <div
                data-testid="trial-draft-banner"
                className="not-prose mb-8 rounded-xl border border-gold/50 bg-gold/10 px-4 py-3 text-sm text-primary-k"
            >
                <strong>Draft.</strong> These terms are being finalised with our legal adviser and
                may change before they take effect.
            </div>

            <p>
                These terms cover Wayly's free trial. They sit alongside our{" "}
                <Link to="/legal/terms">Terms of Service</Link> and{" "}
                <Link to="/legal/refund-policy">Refund Policy</Link>.
            </p>

            <h2>What the trial includes</h2>
            <p>
                A new {PLAN_LABEL.solo} or {PLAN_LABEL.family} subscription starts with a{" "}
                {TRIAL_DAYS}-day free trial that unlocks every Wayly tool. You get the full paid
                experience for the trial period, at no cost.
            </p>

            <h2>Card required at signup</h2>
            <p>
                A valid payment card is required to start the trial. You are{" "}
                <strong>not charged during the {TRIAL_DAYS}-day trial</strong>.
            </p>

            <h2>What happens when the trial ends</h2>
            <ul>
                <li>
                    If you do nothing, your subscription begins automatically and your card is
                    charged for the first period: {PLAN_PRICE.solo}/fortnight ({PLAN_LABEL.solo}) or{" "}
                    {PLAN_PRICE.family}/fortnight ({PLAN_LABEL.family}).
                </li>
                <li>It then renews each fortnight until you cancel.</li>
                <li>
                    If you cancel before the trial ends, you are never charged and your account
                    moves to the free tier.
                </li>
            </ul>

            <h2>Cancel any time</h2>
            <p>
                You can cancel during the trial, or at any time afterwards, from{" "}
                <strong>Settings → Billing → Cancel plan</strong> in a couple of clicks. There are
                no phone calls, no "are you sure" mazes, and no cancellation fees.
            </p>

            <h2>One trial per person</h2>
            <p>
                The free trial is intended as a one-time offer per customer. We may decline a
                repeat trial for an account or card that has already used one.
            </p>

            <h2>Free tier after the trial</h2>
            <p>
                You do not have to subscribe to keep using Wayly. If your trial ends without
                upgrading, your account becomes a free account with a limited number of checks, and
                your saved results stay with you. See{" "}
                <Link to="/pricing">Pricing</Link> for what each plan includes.
            </p>

            <h2>Questions</h2>
            <p>
                Contact us from the <Link to="/contact">Contact page</Link> and we will reply
                within one business day.
            </p>
        </LegalPage>
    );
}
