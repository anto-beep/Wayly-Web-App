import React from "react";
import { Link } from "react-router-dom";
import { Info, ArrowRight, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Shared wrapper for the logged-out "worked example" panels shown on each tool
// page. Renders the sample ONLY for unauthenticated visitors (logged-in users
// see their real tool, untouched) and constrains to the same 1720px width as
// the Statement Decoder so every tool page reads at one width. Each tool passes
// its real, captured output as children.

export const aud = (n) => "$" + Number(n || 0).toLocaleString("en-AU", { maximumFractionDigits: 0 });
export const aud2 = (n) =>
    "$" + Number(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ToolSampleShell({
    testid,
    badge = "Sample output · not a real person's data",
    titleLead,
    titleAccent,
    description,
    children,
    ctaTitle,
    ctaBody,
    ctaHref = "/signup?plan=solo",
    ctaLabel = "Start a 7-day free trial",
}) {
    const { user } = useAuth();
    if (user) return null;
    return (
        <section className="mx-auto max-w-[1720px] px-6 mt-4 mb-6" data-testid={testid} aria-label="Example tool output">
            <div className="rounded-2xl border border-kindred bg-surface p-6 sm:p-8">
                <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-[#A5512B]"
                    data-testid={`${testid}-badge`}
                >
                    <Info className="h-3.5 w-3.5" /> {badge}
                </span>
                <h2 className="font-heading text-2xl sm:text-3xl tracking-tight mt-4 leading-tight">
                    <span className="text-primary-k">{titleLead} </span>
                    <span className="text-[#A5512B]">{titleAccent}</span>
                </h2>
                {description && <p className="mt-3 text-muted-k leading-relaxed">{description}</p>}

                <div className="mt-6 space-y-5">{children}</div>

                {ctaTitle && (
                    <div
                        className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0E4D52] to-[#13656B] p-6 text-white shadow-sm"
                        data-testid={`${testid}-cta`}
                    >
                        <div className="flex items-start gap-3">
                            <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/15 text-white">
                                <Sparkles className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                                <p className="font-heading text-lg leading-snug text-white">{ctaTitle}</p>
                                <p className="mt-1 text-sm leading-relaxed text-white/85">{ctaBody}</p>
                            </div>
                        </div>
                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                            <Link
                                to={ctaHref}
                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
                                data-testid={`${testid}-cta-primary`}
                            >
                                {ctaLabel} <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link
                                to="/login"
                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/55 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                                data-testid={`${testid}-cta-signin`}
                            >
                                Sign in
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
