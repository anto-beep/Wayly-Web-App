import React from "react";
import { StyleSheet, View } from "react-native";
import { router, usePathname } from "expo-router";

import { useAuth } from "@/src/context/AuthContext";
import { ReactivateLock } from "@/src/components/ReactivateLock";

// Run/create routes that an inactive (view-only) plan must NOT be able to open.
const HARD_LOCK_EXACT = new Set(["/upload", "/provider-switch", "/budget-scenarios"]);
const HARD_LOCK_PREFIX = ["/tool/", "/switch-decision/", "/switch-settlement/"];

function labelFor(path: string): string {
  if (path.startsWith("/tool/")) return "this tool";
  if (path === "/upload") return "statement upload";
  if (path === "/provider-switch" || path.startsWith("/switch-")) return "provider switching";
  if (path === "/budget-scenarios") return "budget scenarios";
  return "this feature";
}

/**
 * AccessGate — mounted once at the root above the navigator. When the user's
 * plan is inactive and the current route is a run/create surface, it overlays
 * the entire app with the shared ReactivateLock (covering the read-only banner
 * too, so there is never a doubled "inactive" message). Returns null otherwise.
 */
export function AccessGate() {
  const { viewOnly } = useAuth();
  const pathname = usePathname();
  if (!viewOnly) return null;
  const p = (pathname || "").split("?")[0];
  const locked = HARD_LOCK_EXACT.has(p) || HARD_LOCK_PREFIX.some((pre) => p.startsWith(pre));
  if (!locked) return null;
  return (
    <View style={StyleSheet.absoluteFill} testID="access-gate">
      <ReactivateLock featureLabel={labelFor(p)} onBack={() => router.back()} />
    </View>
  );
}

export default AccessGate;
