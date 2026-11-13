import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { LifeBuoy, ArrowRight } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Contextual Help Centre links for a Wayly tool/page.
 * Renders published help articles tagged with `toolKey`. Renders nothing when
 * there are none, so it is always safe to drop onto a tool page.
 *
 *   <ContextualHelp toolKey="statement-decoder" />
 */
export default function ContextualHelp({ toolKey, title = "Related help", limit = 3, className = "" }) {
    const [articles, setArticles] = useState([]);

    useEffect(() => {
        let alive = true;
        if (!toolKey) return undefined;
        axios.get(`${API}/public/help/articles`, { params: { tool_key: toolKey, limit } })
            .then((r) => { if (alive) setArticles(r.data.articles || []); })
            .catch(() => { if (alive) setArticles([]); });
        return () => { alive = false; };
    }, [toolKey, limit]);

    if (!articles.length) return null;

    return (
        <aside className={`rounded-2xl border border-kindred bg-surface p-4 ${className}`} data-testid={`contextual-help-${toolKey}`} aria-label="Related help articles">
            <div className="flex items-center gap-2 text-primary-k">
                <LifeBuoy className="h-4 w-4" />
                <span className="font-heading text-base">{title}</span>
            </div>
            <ul className="mt-3 space-y-2">
                {articles.map((a) => (
                    <li key={a.slug}>
                        <Link to={`/help/a/${a.slug}`} data-testid={`contextual-help-link-${a.slug}`}
                            className="group inline-flex items-center gap-1.5 text-sm text-primary-k hover:underline">
                            {a.title} <ArrowRight className="h-3.5 w-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                        </Link>
                    </li>
                ))}
            </ul>
            <Link to="/help" className="mt-3 inline-block text-xs text-muted-k hover:text-primary-k">Browse the Help Centre →</Link>
        </aside>
    );
}
