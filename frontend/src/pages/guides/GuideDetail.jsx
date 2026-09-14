import React from "react";
import { useParams } from "react-router-dom";
import ContentPage from "@/components/ContentPage";
import { guideBySlug } from "@/data/guides";
import { Navigate } from "react-router-dom";

export default function GuideDetail() {
    const { slug } = useParams();
    const guide = guideBySlug(slug);
    if (!guide) return <Navigate to="/guides" replace />;
    return (
        <ContentPage
            title={guide.title}
            description={guide.description}
            url={`/guides/${guide.slug}`}
            breadcrumbs={[
                { label: "Home", href: "/" },
                { label: "Guides", href: "/guides" },
                { label: guide.h1 },
            ]}
            overline={guide.overline}
            h1={guide.h1}
            intro={guide.intro}
            keyTakeaways={guide.keyTakeaways}
            sections={guide.sections}
            faqs={guide.faqs}
            related={guide.related}
        />
    );
}
