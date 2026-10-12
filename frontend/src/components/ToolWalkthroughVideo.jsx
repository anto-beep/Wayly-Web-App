import React from "react";

// Public "How to use" walkthrough videos for the AI tools. These are hosted as
// public customer-assets URLs (not bundled in the repo, ~20-57 MB each) and are
// shown to everyone — signed in or not — mirroring the mobile walkthrough.
const TOOL_VIDEOS = {
    "classification-self-check": {
        url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/4fa3799b3cb708b6_Classification%20Self%20Check%20Tutorial_Final%20Video.mp4",
        title: "How to use the Classification Self-Check",
        blurb: "A quick walkthrough: answer a few questions about daily life and Wayly estimates the likely Support at Home classification band, and what to prepare for a reassessment.",
    },
    "budget-calculator": {
        url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/a0cfa3871b867b69_Budget%20and%20Lifetime%20Cap%20Calculator%20Guide%20Final%20Video.mp4",
        title: "How to use the Budget & Lifetime Cap Calculator",
        blurb: "A quick walkthrough: enter your classification and details, then read your annual budget, quarterly usable amount, per-stream split and lifetime cap projection.",
    },
    "contribution-estimator": {
        url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/45c48093c2a27434_How%20to%20Use%20the%20Contribution%20Estimator_Final%20Video.mp4",
        title: "How to use the Contribution Estimator",
        blurb: "A quick walkthrough: answer a few questions about your situation and finances, then see your estimated weekly contribution and who pays what.",
    },
    "invoice-checker": {
        url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/609d6ef86fb8be9c_How%20to%20Use%20the%20Invoice%20Checker_Final_Video.mp4",
        title: "How to use the Invoice Checker",
        blurb: "A quick walkthrough: upload a provider invoice and Wayly checks every line against the rules, flags anything worth raising, and drafts the question to ask.",
    },
    "care-plan-reviewer": {
        url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/07ac3879a42c3422_Using%20the%20Support%20Plan%20Reviewer%20Tool_Final%20Video.mp4",
        title: "How to use the Support Plan Reviewer",
        blurb: "A quick walkthrough: upload or paste a support plan and Wayly finds gaps, runs safety checks, and gives you questions to raise with your provider.",
    },
    "provider-price-checker": {
        url: "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/7a0532dbddef3684_Using%20the%20Provider%20Price%20Checker%20Final%20Video.mp4",
        title: "How to use the Provider Price Checker",
        blurb: "A quick walkthrough: enter a service and the rate charged, then see how it compares against the indicative market range for Support at Home.",
    },
};

export default function ToolWalkthroughVideo({ slug }) {
    const v = TOOL_VIDEOS[slug];
    if (!v) return null;
    return (
        <section className="max-w-5xl mx-auto px-4 sm:px-8 mt-10 mb-2" data-testid={`${slug}-how-to-video`} aria-label={v.title}>
            <div className="text-center max-w-2xl mx-auto">
                <span className="overline">Watch the walkthrough</span>
                <h2 className="font-heading text-3xl text-primary-k tracking-tight mt-3">{v.title}</h2>
                <p className="mt-3 text-muted-k leading-relaxed">{v.blurb}</p>
            </div>
            <div className="mt-8 max-w-4xl mx-auto">
                <div className="rounded-2xl overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-kindred bg-black">
                    <video
                        src={v.url}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full aspect-video bg-black"
                        data-testid={`${slug}-how-to-video-player`}
                    >
                        Sorry, your browser does not support embedded videos.
                    </video>
                </div>
            </div>
        </section>
    );
}
