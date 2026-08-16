import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/**
 * "Back to About" breadcrumb, rendered on tool landing pages only when
 * the visitor arrived via a /about cluster card. Two signals:
 *
 *  1. URL query `?from=about`, set by the About cluster cards.
 *  2. `sessionStorage.getItem("wayly:about-entry") === "1"`, sticks for
 *     the tab session so deeper tool navigation still shows the crumb.
 *
 * On first mount with `?from=about`, we set the sessionStorage flag and
 * strip the query from the URL so the address bar stays clean.
 *
 * Renders null when neither signal is present, i.e. the visitor arrived
 * some other way (all-AI-tools index, search, direct link).
 */
export default function AboutBackLink() {
    const { search, pathname } = useLocation();
    const [show, setShow] = useState(false);

    useEffect(() => {
        try {
            const params = new URLSearchParams(search);
            if (params.get("from") === "about") {
                sessionStorage.setItem("wayly:about-entry", "1");
                // Strip the ?from=about param so browser refresh doesn't loop the
                // flag setter and the shared URL is clean.
                params.delete("from");
                const cleanQs = params.toString();
                window.history.replaceState(
                    null,
                    "",
                    pathname + (cleanQs ? `?${cleanQs}` : ""),
                );
            }
            setShow(sessionStorage.getItem("wayly:about-entry") === "1");
        } catch {
            /* sessionStorage may throw in private mode; degrade gracefully */
        }
    }, [search, pathname]);

    if (!show) return null;
    return (
        <Link
            to="/about"
            data-testid="about-back-link"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-k hover:text-primary-k transition-colors"
        >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to About
        </Link>
    );
}
