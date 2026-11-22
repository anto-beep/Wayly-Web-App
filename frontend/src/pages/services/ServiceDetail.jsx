import React from "react";
import { useParams } from "react-router-dom";
import ContentPage from "@/components/ContentPage";
import { serviceBySlug } from "@/data/services";
import { Navigate } from "react-router-dom";

export default function ServiceDetail() {
    const { slug } = useParams();
    const service = serviceBySlug(slug);
    if (!service) return <Navigate to="/services" replace />;
    return (
        <ContentPage
            title={service.title}
            description={service.description}
            url={`/services/${service.slug}`}
            breadcrumbs={[
                { label: "Home", href: "/" },
                { label: "Services", href: "/services" },
                { label: service.h1 },
            ]}
            overline={service.overline}
            h1={service.h1}
            intro={service.intro}
            keyTakeaways={service.keyTakeaways}
            sections={service.sections}
            faqs={service.faqs}
            related={service.related}
        />
    );
}
