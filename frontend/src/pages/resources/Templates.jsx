import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { TEMPLATES } from "@/data/resources";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";

export default function Templates() {
    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-12 pb-6" data-testid="templates-page">
                <Link to="/resources" className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Resources</Link>
                <span className="overline mt-6 block">Templates</span>
                <h1 className="font-heading text-5xl text-primary-k tracking-tight mt-4 leading-tight">The conversations you weren't sure how to start.</h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Letters, checklists and conversation prompts. Most are paired with one of our AI tools that drafts them for your specific situation.
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-20 grid sm:grid-cols-2 gap-4" data-testid="templates-list">
                {TEMPLATES.map((t) => (
                    <div key={t.slug} className="bg-surface border border-kindred rounded-2xl p-5 flex flex-col" data-testid={`template-${t.slug}`}>
                        <div className="flex items-start gap-3">
                            <div className="h-9 w-9 rounded-full bg-surface-2 flex items-center justify-center flex-shrink-0">
                                <FileText className="h-4 w-4 text-primary-k" />
                            </div>
                            <h3 className="font-heading text-lg text-primary-k">{t.title}</h3>
                        </div>
                        <p className="mt-3 text-sm text-muted-k leading-relaxed flex-1">{t.desc}</p>
                        {t.href === "#" ? (
                            <span className="mt-4 inline-flex items-center gap-1 text-sm text-muted-k">{t.cta}</span>
                        ) : (
                            <Link to={t.href} className="mt-4 inline-flex items-center gap-1 text-sm text-primary-k font-medium">
                                {t.cta} <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        )}
                    </div>
                ))}
            </section>
            <Footer />
        </div>
    );
}
