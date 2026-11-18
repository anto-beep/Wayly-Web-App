import React from "react";

// Shared article visual building blocks. Kept intentionally small and
// token-driven (primary-k / muted-k / surface / kindred / gold + the teal
// #0E4D52 and cyan #2BC4D6 brand accents) so every article renders on-brand.

// Lead/hero image shown under the article excerpt. 16:9 on desktop, a touch
// taller on phones so faces are not cropped too tight.
export function ArticleHero({ src, alt, caption, contain }) {
    if (!src) return null;
    return (
        <figure className="mt-8 overflow-hidden rounded-3xl border border-kindred bg-surface-2 shadow-sm" data-testid="article-hero-image">
            <div className="relative w-full aspect-[4/3] sm:aspect-[16/9]">
                <img
                    src={src}
                    alt={alt || ""}
                    loading="eager"
                    className={`absolute inset-0 h-full w-full ${contain ? "object-contain p-2" : "object-cover"}`}
                />
            </div>
            {caption && <figcaption className="px-4 py-2 text-xs text-muted-k">{caption}</figcaption>}
        </figure>
    );
}

// Inline supporting image used inside a section.
export function SectionFigure({ src, alt, caption }) {
    if (!src) return null;
    return (
        <figure className="mt-6 overflow-hidden rounded-2xl border border-kindred bg-surface-2" data-testid="article-section-image">
            <div className="relative w-full aspect-[16/9]">
                <img src={src} alt={alt || ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            </div>
            {caption && <figcaption className="px-4 py-2 text-xs text-muted-k">{caption}</figcaption>}
        </figure>
    );
}

// Branded numbered step flow, built from howto.steps (or any {name,text}[]).
export function StepFlow({ title, steps }) {
    if (!steps?.length) return null;
    return (
        <section className="mt-10 rounded-3xl border border-kindred bg-surface p-6 sm:p-8" data-testid="article-stepflow">
            {title && <h2 className="font-heading text-xl text-primary-k tracking-tight m-0">{title}</h2>}
            <ol className="mt-5 space-y-5">
                {steps.map((s, i) => (
                    <li key={i} className="flex gap-4" data-testid={`stepflow-step-${i}`}>
                        <span className="relative flex-none">
                            <span className="grid place-items-center h-9 w-9 rounded-full bg-[#0E4D52] text-white font-heading text-sm">{i + 1}</span>
                            {i < steps.length - 1 && <span aria-hidden className="absolute left-1/2 top-9 -translate-x-1/2 w-px h-[calc(100%+0.75rem)] bg-kindred" />}
                        </span>
                        <div className="min-w-0 pb-1">
                            <div className="font-heading text-base text-primary-k leading-snug">{s.name}</div>
                            {s.text && <p className="mt-1 text-sm text-muted-k leading-relaxed">{s.text}</p>}
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    );
}

// Simple horizontal bar chart for 2-5 numeric comparisons. Accurate numbers
// come from `display`; `value` only drives bar width.
export function BarCompare({ title, note, items }) {
    if (!items?.length) return null;
    const max = Math.max(...items.map((i) => i.value || 0), 1);
    return (
        <figure className="mt-8 rounded-3xl border border-kindred bg-surface p-6 sm:p-7" data-testid="article-barchart">
            {title && <figcaption className="font-heading text-base text-primary-k mb-4">{title}</figcaption>}
            <div className="space-y-3.5">
                {items.map((it, i) => (
                    <div key={i}>
                        <div className="flex items-baseline justify-between text-sm text-primary-k mb-1">
                            <span>{it.label}</span>
                            <span className="font-semibold tabular-nums">{it.display}</span>
                        </div>
                        <div className="h-3 rounded-full bg-surface-2 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-[#2BC4D6] to-[#0E4D52]"
                                style={{ width: `${Math.max(6, ((it.value || 0) / max) * 100)}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
            {note && <p className="mt-4 text-xs text-muted-k leading-relaxed">{note}</p>}
        </figure>
    );
}

// Compact grid of headline figures.
export function FigureStats({ title, items }) {
    if (!items?.length) return null;
    return (
        <section className="mt-8" data-testid="article-figurestats">
            {title && <h2 className="font-heading text-xl text-primary-k tracking-tight">{title}</h2>}
            <div className={`mt-4 grid gap-4 ${items.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                {items.map((it, i) => (
                    <div key={i} className="rounded-2xl border border-kindred bg-surface p-5" data-testid={`figurestat-${i}`}>
                        <div className="font-heading text-2xl text-[#0E4D52] tabular-nums leading-none">{it.value}</div>
                        <div className="mt-2 text-sm text-primary-k font-medium">{it.label}</div>
                        {it.sub && <p className="mt-1 text-xs text-muted-k leading-relaxed">{it.sub}</p>}
                    </div>
                ))}
            </div>
        </section>
    );
}
