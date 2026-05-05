import React from "react";
import LegalPage from "./LegalPage";

export default function AIDisclaimer() {
    return (
        <LegalPage title="AI Accuracy Disclaimer" lastUpdated="February 2026">
            <h2>What our AI tools do</h2>
            <p>
                Kindred's AI tools use large language models to read, interpret, and summarise Support at
                Home monthly statements and related documents. They are designed to help Australian families
                understand complex aged-care information more easily.
            </p>

            <h2>What they cannot guarantee</h2>
            <p>Our AI tools may:</p>
            <ul>
                <li>Misread or misinterpret statement text, particularly in non-standard formats</li>
                <li>Apply incorrect contribution rates based on incorrect assumptions about pension status</li>
                <li>Flag items as anomalies that are in fact correct charges</li>
                <li>Miss genuine errors or anomalies</li>
                <li>Produce incorrect dollar figures through arithmetic errors</li>
                <li>Misclassify services into the wrong funding stream</li>
                <li>Fail to account for provider-specific arrangements not visible in the statement text</li>
                <li>Be based on program rules that have changed since our last update</li>
            </ul>

            <h2>What you should always do</h2>
            <p>Before taking any action based on a Kindred AI output:</p>
            <ol>
                <li>Compare the output against your original statement</li>
                <li>Verify dollar figures directly with your provider</li>
                <li>Contact My Aged Care (1800 200 422) for official information</li>
                <li>Speak to a qualified professional for advice on your specific situation</li>
            </ol>

            <h2>What Kindred is not</h2>
            <ul>
                <li>Kindred is not a registered Support at Home provider.</li>
                <li>Kindred is not a financial adviser or financial services licensee.</li>
                <li>Kindred is not a legal services provider.</li>
                <li>Kindred is not a healthcare or clinical services provider.</li>
            </ul>
            <p>Nothing produced by Kindred's tools is financial, legal, or clinical advice.</p>

            <h2>Voluntary AI Safety Standard</h2>
            <p>
                Kindred has adopted Australia's Voluntary AI Safety Standard (2024). We are committed to
                transparency about AI capabilities and limitations, human oversight of AI outputs, and
                ongoing improvement of our tools.
            </p>
        </LegalPage>
    );
}
