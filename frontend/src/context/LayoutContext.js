import { createContext, useContext } from "react";

/**
 * Signals to descendants (e.g. MarketingHeader) that they're already
 * inside the authenticated app Layout, so they should NOT render their
 * own marketing top-nav (avoiding the double-header issue on AI tool
 * pages accessed by logged-in users).
 */
export const LayoutContext = createContext({ inLayout: false });

export function useInLayout() {
    return useContext(LayoutContext).inLayout;
}
