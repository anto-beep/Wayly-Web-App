/**
 * SEO + structured data helpers for Wayly.
 *
 * Use <SeoHead /> on every public-facing page to inject:
 *   - <title>, <meta name="description">
 *   - canonical URL
 *   - Open Graph + Twitter card
 *   - One or more <script type="application/ld+json"> blocks
 *
 * Title: ≤60 chars. Description: 140–160 chars. URLs ≤5 path segments.
 */
import React from "react";
import { Helmet } from "react-helmet-async";

export const SITE = {
    name: "Wayly",
    domain: "https://wayly.com.au",
    description:
        "Wayly is the AI assistant for Australian families navigating Support at Home. Decode statements, check classifications, plan budgets — in plain English.",
    twitter: "@waylyhq",
    defaultOgImage: "https://wayly.com.au/og-default.png",
    contactEmail: "support@wayly.com.au",
    locale: "en_AU",
};

const _origin = () => {
    if (typeof window !== "undefined" && window.location) {
        if (window.location.host.endsWith("wayly.com.au")) return SITE.domain;
    }
    return SITE.domain;
};

/** Canonical URL helper. Strips query/hash unless `keepQuery` is set. */
export function canonicalFor(path, { keepQuery = false } = {}) {
    if (!path) path = "/";
    if (!path.startsWith("/")) path = "/" + path;
    if (!keepQuery && typeof window !== "undefined") {
        const idx = path.indexOf("?");
        if (idx >= 0) path = path.slice(0, idx);
    }
    return `${_origin()}${path}`;
}

// ---------------------------------------------------------------------------
// SeoHead — main per-page component
// ---------------------------------------------------------------------------

export default function SeoHead({
    title,
    description,
    path,
    canonical,
    image,
    type = "website",
    noindex = false,
    publishedAt,
    updatedAt,
    author,
    jsonLd,
}) {
    const fullTitle =
        title && title.includes("Wayly")
            ? title
            : title
                ? `${title} | Wayly`
                : "Wayly · AI assistant for Australian Support at Home";
    const desc = description || SITE.description;
    const canonicalUrl = canonical || canonicalFor(path || "/");
    const ogImage = image || SITE.defaultOgImage;
    const ldBlocks = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];

    return (
        <Helmet prioritizeSeoTags>
            <title>{fullTitle.slice(0, 60)}</title>
            <meta name="description" content={desc.slice(0, 160)} />
            <link rel="canonical" href={canonicalUrl} />
            {noindex && <meta name="robots" content="noindex, nofollow" />}
            <meta property="og:site_name" content={SITE.name} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={desc} />
            <meta property="og:url" content={canonicalUrl} />
            <meta property="og:type" content={type} />
            <meta property="og:image" content={ogImage} />
            <meta property="og:locale" content={SITE.locale} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:site" content={SITE.twitter} />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={desc} />
            <meta name="twitter:image" content={ogImage} />
            {type === "article" && publishedAt && (
                <meta property="article:published_time" content={publishedAt} />
            )}
            {type === "article" && updatedAt && (
                <meta property="article:modified_time" content={updatedAt} />
            )}
            {type === "article" && author && (
                <meta property="article:author" content={author} />
            )}
            {ldBlocks.map((block, i) => (
                <script key={i} type="application/ld+json">
                    {JSON.stringify(block)}
                </script>
            ))}
        </Helmet>
    );
}

// ---------------------------------------------------------------------------
// JSON-LD generators
// ---------------------------------------------------------------------------

export function organizationLd() {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: SITE.name,
        url: SITE.domain,
        logo: `${SITE.domain}/logo.png`,
        sameAs: [
            "https://www.linkedin.com/company/wayly",
            "https://twitter.com/waylyhq",
        ],
        contactPoint: [{
            "@type": "ContactPoint",
            email: SITE.contactEmail,
            contactType: "customer support",
            areaServed: "AU",
            availableLanguage: ["en"],
        }],
    };
}

export function websiteLd() {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SITE.name,
        url: SITE.domain,
        inLanguage: "en-AU",
        publisher: { "@type": "Organization", name: SITE.name },
        potentialAction: {
            "@type": "SearchAction",
            target: `${SITE.domain}/resources/articles?q={query}`,
            "query-input": "required name=query",
        },
    };
}

export function softwareApplicationLd({ name, description, url, category = "BusinessApplication", screenshot, faqs }) {
    const base = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name,
        description,
        url,
        applicationCategory: category,
        operatingSystem: "Web",
        offers: {
            "@type": "Offer",
            availability: "https://schema.org/InStock",
        },
        publisher: { "@type": "Organization", name: SITE.name, url: SITE.domain },
    };
    if (screenshot) base.screenshot = screenshot;
    if (faqs) base.mainEntity = faqs;
    return base;
}

export function faqLd(faqs) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: {
                "@type": "Answer",
                text: f.a,
            },
        })),
    };
}

export function howToLd({ name, description, steps }) {
    return {
        "@context": "https://schema.org",
        "@type": "HowTo",
        name,
        description,
        step: steps.map((s, i) => ({
            "@type": "HowToStep",
            position: i + 1,
            name: s.name,
            text: s.text,
        })),
    };
}

export function articleLd({ headline, description, url, image, datePublished, dateModified, author, reviewedBy, citation }) {
    const ld = {
        "@context": "https://schema.org",
        "@type": "Article",
        headline,
        description,
        url,
        image: image || SITE.defaultOgImage,
        datePublished,
        dateModified: dateModified || datePublished,
        publisher: {
            "@type": "Organization",
            name: SITE.name,
            logo: { "@type": "ImageObject", url: `${SITE.domain}/logo.png` },
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
    };
    if (author) {
        ld.author = {
            "@type": "Person",
            name: author.name,
            ...(author.url ? { url: author.url } : {}),
            ...(author.sameAs ? { sameAs: author.sameAs } : {}),
            ...(author.jobTitle ? { jobTitle: author.jobTitle } : {}),
        };
    }
    if (reviewedBy) {
        ld.reviewedBy = {
            "@type": "Person",
            name: reviewedBy.name,
            ...(reviewedBy.jobTitle ? { jobTitle: reviewedBy.jobTitle } : {}),
            ...(reviewedBy.sameAs ? { sameAs: reviewedBy.sameAs } : {}),
        };
    }
    if (citation && citation.length) {
        ld.citation = citation.map((c) => ({
            "@type": "CreativeWork",
            name: c.title || c.name,
            url: c.url,
            ...(c.publisher ? { publisher: { "@type": "Organization", name: c.publisher } } : {}),
        }));
    }
    return ld;
}

export function breadcrumbLd(items) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((it, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: it.name,
            ...(it.url ? { item: it.url.startsWith("http") ? it.url : `${SITE.domain}${it.url}` } : {}),
        })),
    };
}
