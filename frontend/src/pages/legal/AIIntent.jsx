import React from "react";
import LegalPage from "./LegalPage";

export default function AIIntent() {
    return (
        <LegalPage title="Our commitment when our AI gets it wrong" lastUpdated="February 2026">
            <p>
                We know our AI tools can make mistakes. We say so on every page. This page explains what we
                commit to do when an error causes a real problem.
            </p>

            <h2>Our commitment</h2>

            <h3>1. We will listen</h3>
            <p>
                If you contact us because a Kindred AI output produced an error that caused you a problem,
                we will take it seriously. Contact: <a href="mailto:errors@kindred.au">errors@kindred.au</a>{" "}
                with the subject line "AI Error Report". We will acknowledge your report within 2 business
                days.
            </p>

            <h3>2. We will investigate</h3>
            <p>
                We will review the specific output that caused the problem, identify what went wrong, and
                assess whether it was a genuine AI error, a data issue, or a user interpretation issue.
                We will tell you what we found.
            </p>

            <h3>3. We will be honest</h3>
            <p>
                If our AI made a clear error, we will say so. We will not hide behind disclaimers when the
                fault is ours.
            </p>

            <h3>4. We will act</h3>
            <p>
                Where a Kindred AI error directly caused you a verifiable financial loss, we will work with
                you to understand the impact and determine an appropriate response. This may include a
                refund, a credit, or other remedy depending on the circumstances.
            </p>
            <p>
                We do not guarantee specific outcomes — this is a commitment to good faith action, not an
                unlimited liability warranty. Our full <a href="/legal/terms">Terms of Service</a> apply.
            </p>

            <h3>5. We will improve</h3>
            <p>
                Every confirmed AI error is used to improve the tool. We track error patterns and fix them.
                Your report makes the product better for every family using it.
            </p>

            <h2>How to report an AI error</h2>
            <p>
                Email: <a href="mailto:errors@kindred.au">errors@kindred.au</a><br />
                Subject: AI Error Report<br />
                Include: your account email, the date of the output, a description of the error, and what
                happened as a result.
            </p>

            <h2>What this is not</h2>
            <p>
                This statement of intent is not a legal guarantee or an amendment to our Terms of Service.
                It is a statement of how we intend to behave when things go wrong. We believe in
                accountability and we will honour this commitment.
            </p>

            <h2>Important</h2>
            <p>
                If an AI output has led you to take an action with your provider (for example, raising a
                dispute about a charge), and you are now uncertain whether the AI was correct, the best
                next step is to verify directly with My Aged Care (1800 200 422) or your provider before
                escalating further. We are always available to help you understand what the AI output meant:{" "}
                <a href="mailto:hello@kindred.au">hello@kindred.au</a>.
            </p>
        </LegalPage>
    );
}
