import React from "react";

/**
 * Skeleton Suspense fallback. Replaces the spinner that flashed on every
 * lazy-loaded route change. Mimics the MarketingHeader + a content shell so
 * the layout doesn't jump when the real page resolves.
 */
export default function RouteSkeleton() {
    return (
        <div className="min-h-screen bg-kindred animate-pulse" aria-hidden="true" data-testid="route-skeleton">
            {/* header shell */}
            <div className="bg-primary-k">
                <div className="mx-auto max-w-7xl px-6 h-[64px] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-white/20" />
                        <div className="h-4 w-16 rounded bg-white/20" />
                    </div>
                    <div className="hidden md:flex items-center gap-6">
                        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-3 w-14 rounded bg-white/20" />)}
                    </div>
                    <div className="h-8 w-24 rounded-full bg-gold/40" />
                </div>
            </div>
            {/* hero shell */}
            <div className="mx-auto max-w-7xl px-6 pt-16 pb-24">
                <div className="h-3 w-20 rounded bg-primary-k/15" />
                <div className="mt-5 space-y-3">
                    <div className="h-9 w-3/4 rounded bg-primary-k/15" />
                    <div className="h-9 w-2/3 rounded bg-primary-k/15" />
                </div>
                <div className="mt-6 space-y-2 max-w-2xl">
                    <div className="h-3 w-full rounded bg-muted-k/20" />
                    <div className="h-3 w-11/12 rounded bg-muted-k/20" />
                    <div className="h-3 w-9/12 rounded bg-muted-k/20" />
                </div>
                <div className="mt-8 flex gap-3">
                    <div className="h-10 w-40 rounded-full bg-primary-k/20" />
                    <div className="h-10 w-32 rounded-full bg-primary-k/10" />
                </div>
                {/* content grid shell */}
                <div className="mt-16 grid sm:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-surface border border-kindred rounded-2xl p-6 space-y-3">
                            <div className="h-4 w-8 rounded bg-primary-k/15" />
                            <div className="h-5 w-3/4 rounded bg-primary-k/15" />
                            <div className="space-y-2">
                                <div className="h-3 w-full rounded bg-muted-k/15" />
                                <div className="h-3 w-5/6 rounded bg-muted-k/15" />
                                <div className="h-3 w-4/6 rounded bg-muted-k/15" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <span className="sr-only">Loading</span>
        </div>
    );
}
