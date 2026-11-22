import React, { createContext, useCallback, useContext, useState } from "react";

type DrawerState = { open: boolean; openDrawer: () => void; closeDrawer: () => void };
const DrawerContext = createContext<DrawerState | undefined>(undefined);

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  return <DrawerContext.Provider value={{ open, openDrawer, closeDrawer }}>{children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerState {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useDrawer must be used within DrawerProvider");
  return ctx;
}
