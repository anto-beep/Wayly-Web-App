import React from "react";
import { router } from "expo-router";

import { ReactivateLock } from "@/src/components/ReactivateLock";
import { useAuth } from "@/src/context/AuthContext";

/**
 * ViewOnlyToolGate — wraps a tool screen. When the plan is inactive (view_only)
 * the tool is hard-locked (no reveal, nothing can run) and replaced by the
 * shared ReactivateLock. Full-access users get the tool unchanged.
 */
export function ViewOnlyToolGate({ children }: { children: React.ReactNode }) {
  const { viewOnly } = useAuth();
  if (!viewOnly) return <>{children}</>;
  return <ReactivateLock featureLabel="this tool" onBack={() => router.back()} />;
}

export default ViewOnlyToolGate;
