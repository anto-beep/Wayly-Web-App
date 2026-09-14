import React from "react";
import LegalPage from "./LegalPage";

export default function AIDisclaimer() {
    return (
        <LegalPage title="AI Accuracy Disclaimer" path="/legal/ai-disclaimer" description="How Wayly handles AI accuracy in aged-care tools: what our AI does, its limitations, your responsibilities, automated-decision disclosure, and what to do if you spot an error in a Support at Home result." lastUpdated="February 2026">
            <p>
                This disclaimer outlines how Wayly uses artificial intelligence (AI) to help deliver our
                services. We are committed to transparency and want you to understand the capabilities and
                limitations of our AI tools.
            </p>

            <h2>What Wayly’s AI tools do</h2>
            <p>
                Wayly’s AI tools use large language models to read, interpret and summarise Support at Home
                monthly statements and related documents, so Australian families can understand complex
                aged-care information more easily. In practice, they help with:
            </p>
            <ul>
                <li><strong>Information synthesis:</strong> summarising and extracting the key figures from your statements and plans.</li>
                <li><strong>Content generation:</strong> drafting letters, emails and follow-ups you review before sending.</li>
                <li><strong>Personalised assistance:</strong> tailored suggestions and answers based on the information you provide.</li>
                <li><strong>Task automation:</strong> streamlining repetitive checks so you spend less time on paperwork.</li>
            </ul>
            <p>These tools are built to augment your own judgement, not replace it.</p>

            <h2>Limitations of AI outputs</h2>
            <p>While Wayly strives for accuracy, AI-generated outputs have inherent limitations. Our AI tools may:</p>
            <ul>
                <li>Produce incorrect, misleading or incomplete information — outputs should always be reviewed for factual accuracy.</li>
                <li>Reflect biases present in their training data.</li>
                <li>Rely on program rules that have changed since our last update (outdated information).</li>
                <li>Lack genuine real-world understanding — they operate on patterns in data, not human reasoning.</li>
            </ul>
            <p>Specific to Support at Home, our AI may also:</p>
            <ul>
                <li>Misread or misinterpret statement text, particularly in non-standard formats.</li>
                <li>Apply incorrect contribution rates based on wrong assumptions about pension status.</li>
                <li>Flag correct charges as anomalies, or miss genuine errors.</li>
                <li>Produce incorrect dollar figures through arithmetic errors.</li>
                <li>Misclassify a service into the wrong funding stream.</li>
                <li>Fail to account for provider-specific arrangements not visible in the statement text.</li>
            </ul>
            <p>Wayly accepts no liability for any loss or damage arising from reliance on AI-generated content.</p>

            <h2>Your responsibilities</h2>
            <p>As a user of Wayly’s AI tools, you are responsible for:</p>
            <ul>
                <li><strong>Verification:</strong> independently verifying the accuracy and appropriateness of any AI output before relying on it or sharing it.</li>
                <li><strong>Critical assessment:</strong> applying your own judgement and critical thinking to AI-generated content.</li>
                <li><strong>Appropriate use:</strong> ensuring your use of AI tools aligns with our Terms of Service and applicable laws.</li>
                <li><strong>Data privacy:</strong> not inputting sensitive information beyond what is needed for the task.</li>
            </ul>

            <h2>What you should always do</h2>
            <p>Before taking any action based on a Wayly AI output:</p>
            <ol>
                <li>Compare the output against your original statement.</li>
                <li>Verify dollar figures directly with your provider.</li>
                <li>Contact My Aged Care (1800 200 422) for official information.</li>
                <li>Speak to a qualified professional for advice on your specific situation.</li>
            </ol>

            <h2>What Wayly is not</h2>
            <ul>
                <li>Wayly is not a registered Support at Home provider.</li>
                <li>Wayly is not a financial adviser or financial services licensee.</li>
                <li>Wayly is not a legal services provider.</li>
                <li>Wayly is not a healthcare or clinical services provider.</li>
                <li>Wayly is not a source of definitive truth, and is not a substitute for professional judgement or consultation.</li>
            </ul>
            <p>Nothing produced by Wayly’s tools is financial, legal or clinical advice.</p>

            <h2>Privacy Act 1988 (Cth) disclosure: automated decision-making</h2>
            <p>
                In line with Australia’s Privacy Act 1988 (Cth), Wayly may use AI tools that contribute to
                automated decision-making. Where such a decision would have a significant effect on an
                individual, we aim to provide notice and an opportunity for review. Currently our AI tools
                function as assistive technologies for information processing and content creation, rather
                than making final, autonomous decisions about individuals without human oversight. Every
                automated result carries an on-screen note explaining that it was produced automatically and
                inviting you to have it checked. We are committed to aligning with evolving regulatory
                guidance on automated decision-making.
            </p>

            <h2>Adopted safety standard</h2>
            <p>
                Wayly adheres to the principles of the <strong>Voluntary AI Safety Standard 2024</strong>
                {" "}adopted by the Australian Government. This standard guides our responsible development
                and deployment of AI, focusing on safety, fairness, transparency, human oversight and
                accountability.
            </p>

            <h2>Contact us</h2>
            <p>If you have questions about this disclaimer, our AI tools, or how your data is used:</p>
            <ul>
                <li>General enquiries: <a href="mailto:hello@wayly.com.au">hello@wayly.com.au</a></li>
                <li>Support: <a href="mailto:support@wayly.com.au">support@wayly.com.au</a></li>
            </ul>

            <p className="text-sm text-muted-k">Next scheduled review: August 2026.</p>
        </LegalPage>
    );
}
