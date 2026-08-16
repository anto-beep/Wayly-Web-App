/**
 * GlobalStandingBanner
 *
 * A single mount slot at the app root that renders persistent
 * StandingBanners fired from the global api interceptor
 * (`wayly:rate-limit`, `wayly:service-unavailable`) or the offline
 * queue recovery path. Unlike a toast, these banners stay until the
 * user dismisses them.
 */
import React, { useEffect, useState } from "react";
import { StandingBanner } from "./components/StandingBanner.jsx";

export function GlobalStandingBannerHost() {
    const [banners, setBanners] = useState([]); // { id, variant, title, body }

    useEffect(() => {
        const push = (b) => setBanners((prev) => {
            // Dedupe by title to avoid stacking the same message.
            const kept = prev.filter((x) => x.title !== b.title);
            return [...kept, { id: Math.random().toString(36).slice(2), ...b }];
        });

        const onRateLimit = (e) => push({
            variant: "warning",
            title: "You've reached the usage limit",
            body: e.detail?.message || "You've reached the usage limit. Sign up free for more.",
        });
        const onServiceUnavailable = (e) => push({
            variant: "error",
            title: "Our AI is taking a short break",
            body: e.detail?.message || "Our AI is taking a short break. Try again in a few minutes.",
        });

        window.addEventListener("wayly:rate-limit", onRateLimit);
        window.addEventListener("wayly:service-unavailable", onServiceUnavailable);
        return () => {
            window.removeEventListener("wayly:rate-limit", onRateLimit);
            window.removeEventListener("wayly:service-unavailable", onServiceUnavailable);
        };
    }, []);

    if (!banners.length) return null;
    return (
        <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[9997] w-full max-w-xl px-4 space-y-2"
            data-testid="uxf-global-banner-host"
        >
            {banners.map((b) => (
                <StandingBanner
                    key={b.id}
                    variant={b.variant}
                    title={b.title}
                    onDismiss={() => setBanners((prev) => prev.filter((x) => x.id !== b.id))}
                    testId={`uxf-global-banner-${b.variant}`}
                >
                    {b.body}
                </StandingBanner>
            ))}
        </div>
    );
}

export default GlobalStandingBannerHost;
