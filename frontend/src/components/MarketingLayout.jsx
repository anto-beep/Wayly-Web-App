import React from "react";
import { Outlet } from "react-router-dom";

/**
 * MarketingLayout — a pathless layout route wrapping every public / marketing
 * page. Page-navigation motion was removed (it felt distracting), so this is
 * now just a plain structural wrapper. Kept in place so the public routes stay
 * grouped and we can re-introduce (opt-in) motion later if desired.
 */
export default function MarketingLayout() {
    return (
        <div className="wayly-public" data-testid="marketing-motion-root">
            <Outlet />
        </div>
    );
}
