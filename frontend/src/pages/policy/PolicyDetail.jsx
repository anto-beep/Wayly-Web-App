import React from "react";
import { useParams } from "react-router-dom";
import ContentPage from "@/components/ContentPage";
import { policyBySlug } from "@/data/policies";
import { Navigate } from "react-router-dom";

export default function PolicyDetail() {
    const { slug } = useParams();
    const policy = policyBySlug(slug);
    if (!policy) return <Navigate to="/policy" replace />;
    return (
        <ContentPage
            title={policy.title}
            description={policy.description}
            url={`/policy/${policy.slug}`}
            breadcrumbs={[
                { label: "Home", href: "/" },
                { label: "Policy", href: "/policy" },
                { label: policy.h1 },
            ]}
            overline={policy.overline}
            h1={policy.h1}
            intro={policy.intro}
            keyTakeaways={policy.keyTakeaways}
            sections={policy.sections}
            faqs={policy.faqs}
            related={policy.related}
        />
    );
}
