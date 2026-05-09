import React from "react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { Link } from "react-router-dom";

/**
 * LegalPage — shared layout for all /legal/* documents.
 * Title + subtitle + last-updated + body content.
 */
export default function LegalPage({ title, lastUpdated, children }) {
    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <main className="mx-auto max-w-3xl px-6 py-16">
                <div className="mb-8 pb-6 border-b border-kindred">
                    <Link to="/" className="text-sm text-muted-k hover:text-primary-k">← Back to Wayly</Link>
                    <h1 className="font-heading text-4xl sm:text-5xl text-primary-k mt-4" data-testid="legal-page-title">
                        {title}
                    </h1>
                    {lastUpdated && (
                        <p className="text-sm text-muted-k mt-3">Last updated: {lastUpdated}</p>
                    )}
                </div>
                <article
                    className="prose prose-slate max-w-none text-primary-k leading-relaxed
                               [&_h2]:font-heading [&_h2]:text-2xl [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-primary-k
                               [&_h3]:font-medium [&_h3]:text-lg [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-primary-k
                               [&_p]:my-3 [&_p]:text-base
                               [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-3
                               [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-3
                               [&_a]:text-primary-k [&_a]:underline hover:[&_a]:text-[#16294a]"
                    data-testid="legal-page-body"
                >
                    {children}
                </article>
            </main>
            <Footer />
        </div>
    );
}
