import React from "react";
import LegalPage from "./LegalPage";

export default function Accessibility() {
    return (
        <LegalPage title="Accessibility Statement" path="/legal/accessibility" description="Wayly’s accessibility commitments for older Australians and carers using assistive tech. WCAG 2.2 AA target, larger text, high-contrast, keyboard and screen-reader support." lastUpdated="February 2026">
            <p>
                Wayly is committed to ensuring digital accessibility for people with disability. We are
                continually improving the user experience for everyone and applying the relevant
                accessibility standards.
            </p>

            <h2>Our commitment to accessibility</h2>
            <p>
                Wayly is dedicated to making our digital platforms usable and accessible to all Australians,
                including older adults and individuals with disability. We strive to meet and exceed the Web
                Content Accessibility Guidelines (WCAG) 2.2.
            </p>

            <h2>Conformance status</h2>
            <p>
                This website is partially conformant with WCAG 2.2. Partially conformant means that some
                parts of the content do not yet fully conform to the accessibility standard.
            </p>
            <ul>
                <li><strong>Marketing website:</strong> we aim for WCAG 2.2 Level AA conformance.</li>
                <li><strong>Participant view</strong> (designed for older adults using the product directly): we aim for WCAG 2.2 Level AAA conformance.</li>
            </ul>

            <h2>Accessibility features</h2>
            <p>We have implemented several features to enhance accessibility:</p>
            <ul>
                <li><strong>Keyboard navigation:</strong> all interactive elements are fully operable via keyboard.</li>
                <li><strong>Visible focus indicators:</strong> a clear focus indicator is provided for all interactive elements, with at least a 3:1 contrast ratio against adjacent colours.</li>
                <li><strong>Alt text for images:</strong> meaningful images have descriptive alternative text, and decorative images are marked appropriately.</li>
                <li><strong>Form labels:</strong> all form fields have visible, permanent labels.</li>
                <li><strong>Colour contrast:</strong> body text on our marketing site meets a minimum contrast ratio of 4.5:1.</li>
                <li><strong>Resizable text:</strong> text can be zoomed to 200% without loss of content or functionality.</li>
                <li><strong>Text size preferences:</strong> the participant view offers Medium, Large and Extra Large text settings.</li>
                <li><strong>Voice input</strong> is supported in the participant view.</li>
                <li><strong>Reduced motion:</strong> we respect the <code>prefers-reduced-motion</code> setting to minimise animation for users sensitive to motion.</li>
                <li><strong>Language and landmarks:</strong> the page declares <code>lang=&quot;en-AU&quot;</code>, and landmark regions (header, main, navigation, footer) are present.</li>
                <li><strong>Heading hierarchy:</strong> headings are logically structured, with no levels skipped.</li>
            </ul>

            <h2>Technical specifications</h2>
            <p>Accessibility of this website relies on the following technologies:</p>
            <ul>
                <li>HTML</li>
                <li>WAI-ARIA</li>
                <li>CSS</li>
                <li>JavaScript</li>
            </ul>

            <h2>Known limitations</h2>
            <p>
                Despite our best efforts, some limitations may remain. We are aware of the following and are
                working to resolve them:
            </p>
            <ul>
                <li><strong>Participant view complexity:</strong> because the participant view is highly dynamic and interactive, some complex components or third-party integrations may present minor barriers to full AAA conformance. We audit and update these areas continuously.</li>
                <li><strong>External content:</strong> links to external websites may lead to content that does not meet our accessibility standards.</li>
            </ul>

            <h2>Testing methodology</h2>
            <p>We use a multi-faceted approach to test accessibility:</p>
            <ul>
                <li><strong>Automated testing</strong> with tools such as axe-core to catch common issues.</li>
                <li><strong>Manual testing</strong>, including keyboard-only navigation and screen-reader checks.</li>
                <li><strong>User testing</strong> with people, including people with disability, to gather real feedback.</li>
                <li><strong>External review:</strong> we intend to commission external accessibility experts for comprehensive reviews.</li>
            </ul>

            <h2>Assistive technology support</h2>
            <p>This website has been tested with:</p>
            <ul>
                <li><strong>Screen readers:</strong> NVDA, JAWS, VoiceOver (macOS/iOS) and TalkBack (Android).</li>
                <li><strong>Browsers:</strong> the latest versions of Chrome, Firefox, Safari and Edge.</li>
            </ul>

            <h2>Feedback and contact</h2>
            <p>
                We welcome your feedback on the accessibility of Wayly. If you encounter a barrier or have a
                suggestion, please tell us so we can prioritise it.
            </p>
            <ul>
                <li>Accessibility-specific feedback: <a href="mailto:accessibility@wayly.com.au">accessibility@wayly.com.au</a></li>
                <li>General enquiries: <a href="mailto:hello@wayly.com.au">hello@wayly.com.au</a></li>
            </ul>
            <p>We aim to respond to accessibility feedback within one business day.</p>

            <h2>Legal compliance</h2>
            <p>
                This statement aligns with our commitment to comply with the Disability Discrimination Act
                1992 (Cth).
            </p>

            <p className="text-sm text-muted-k">Next scheduled review: August 2026.</p>
        </LegalPage>
    );
}
