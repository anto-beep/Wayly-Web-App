/**
 * PageIntro, reusable page header for authenticated tool pages.
 *
 * Renders a structured, outcome-focused introduction:
 *   • Eyebrow (small uppercase tag)
 *   • Title (Title Case; use toTitleCase() at the callsite)
 *   • What this does (1-2 sentence paragraph)
 *   • How to use it (numbered list, 3-4 short steps)
 *   • What you get (outcome bullet(s))
 *
 * Keeps every page consistently informative without designing per-page
 * headers from scratch. Every prop is optional so pages can render just
 * the title + description if they don't need the full anatomy.
 */
import React from "react";
import { Sparkles, ListChecks, Target } from "lucide-react";

export default function PageIntro({
    eyebrow,
    title,
    description,
    whatItDoes,
    howToUse = [],
    whatYouGet = [],
    className = "",
    "data-testid": testId,
    children,
}) {
    return (
        <header className={`space-y-4 ${className}`} data-testid={testId || "page-intro"}>
            {eyebrow && (
                <p className="text-xs uppercase tracking-wider text-primary-k/50">{eyebrow}</p>
            )}
            {title && (
                <h1 className="text-2xl sm:text-3xl font-heading text-primary-k leading-tight">{title}</h1>
            )}
            {description && (
                <p className="text-base text-muted-k max-w-3xl leading-relaxed">{description}</p>
            )}

            {(whatItDoes || howToUse.length > 0 || whatYouGet.length > 0) && (
                <div className="grid gap-4 lg:grid-cols-3 pt-2">
                    {whatItDoes && (
                        <div className="rounded-2xl border border-primary-k/10 bg-white/60 p-4">
                            <div className="flex items-center gap-2 text-primary-k/70">
                                <Sparkles className="w-4 h-4"/>
                                <p className="text-xs uppercase tracking-wider">What This Does</p>
                            </div>
                            <p className="text-sm text-primary-k mt-2 leading-relaxed">{whatItDoes}</p>
                        </div>
                    )}
                    {howToUse.length > 0 && (
                        <div className="rounded-2xl border border-primary-k/10 bg-white/60 p-4">
                            <div className="flex items-center gap-2 text-primary-k/70">
                                <ListChecks className="w-4 h-4"/>
                                <p className="text-xs uppercase tracking-wider">How to Use It</p>
                            </div>
                            <ol className="text-sm text-primary-k mt-2 space-y-1.5 list-decimal pl-5 leading-relaxed">
                                {howToUse.map((step, i) => <li key={i}>{step}</li>)}
                            </ol>
                        </div>
                    )}
                    {whatYouGet.length > 0 && (
                        <div className="rounded-2xl border border-primary-k/10 bg-white/60 p-4">
                            <div className="flex items-center gap-2 text-primary-k/70">
                                <Target className="w-4 h-4"/>
                                <p className="text-xs uppercase tracking-wider">What You Get</p>
                            </div>
                            <ul className="text-sm text-primary-k mt-2 space-y-1.5 list-disc pl-5 leading-relaxed">
                                {whatYouGet.map((line, i) => <li key={i}>{line}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {children}
        </header>
    );
}
