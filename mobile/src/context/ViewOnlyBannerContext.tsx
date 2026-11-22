import React, { createContext, useContext, useMemo, useState } from "react";

import { useAuth } from "@/src/context/AuthContext";

/**
 * Shares whether the top ViewOnlyBanner is currently occupying the safe-area
 * top of the screen. The banner itself already pads for the notch/status bar,
 * so WaylyHeader must NOT re-apply insets.top while the banner is visible —
 * otherwise the two safe-area blocks stack and the header grows too tall,
 * pushing the logo and avatar down. Dismiss state is lifted here so the header
 * reclaims the inset the moment the banner is dismissed.
 */
type Ctx = { visible: boolean; dismiss: () => void };

const ViewOnlyBannerCtx = createContext<Ctx>({ visible: false, dismiss: () => {} });

export function ViewOnlyBannerProvider({ children }: { children: React.ReactNode }) {
  const { user, viewOnly } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const visible = !!user && !!viewOnly && !dismissed;
  const value = useMemo(() => ({ visible, dismiss: () => setDismissed(true) }), [visible]);
  return <ViewOnlyBannerCtx.Provider value={value}>{children}</ViewOnlyBannerCtx.Provider>;
}

export function useViewOnlyBanner() {
  return useContext(ViewOnlyBannerCtx);
}

export default ViewOnlyBannerProvider;
