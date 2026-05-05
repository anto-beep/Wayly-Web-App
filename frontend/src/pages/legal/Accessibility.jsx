import React from "react";
import LegalPage from "./LegalPage";

export default function Accessibility() {
    return (
        <LegalPage title="Accessibility Statement" lastUpdated="February 2026">
            <p>
                Kindred is committed to making our product accessible to all Australians, including older
                adults and people with disability.
            </p>

            <h2>Standard</h2>
            <p>
                Our marketing website targets WCAG 2.2 Level AA conformance. Our participant view (designed
                for older adults using the product directly) targets WCAG 2.2 Level AAA conformance.
            </p>

            <h2>Features</h2>
            <ul>
                <li>All interactive elements are keyboard-navigable</li>
                <li>All images have descriptive alt text</li>
                <li>All form fields have visible labels</li>
                <li>Colour contrast meets or exceeds the WCAG minimum ratio</li>
                <li>Text size can be increased without loss of functionality</li>
                <li>The participant view offers text size preference settings (Medium / Large / Extra Large)</li>
                <li>Voice input is supported in the participant view</li>
            </ul>

            <h2>Known limitations</h2>
            <p>
                We are tracking known accessibility gaps and target fix dates internally. If you encounter
                a barrier, please tell us so we can prioritise it.
            </p>

            <h2>Feedback</h2>
            <p>
                If you experience an accessibility barrier, please contact us at{" "}
                <a href="mailto:accessibility@kindred.au">accessibility@kindred.au</a>. We will work to
                resolve it.
            </p>

            <h2>Third party content</h2>
            <p>
                Some embedded third-party content (e.g. payment processing) may not meet our accessibility
                standards. We are working with our providers to improve this.
            </p>
        </LegalPage>
    );
}
