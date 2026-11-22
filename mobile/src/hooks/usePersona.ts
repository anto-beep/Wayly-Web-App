import { useAuth } from "@/src/context/AuthContext";

export type Persona = "caregiver" | "participant";

// Mirrors the web/backend rule: role "participant" -> participant voice,
// everything else -> caregiver voice. Used to personalise copy and to pass
// the persona to persona-aware endpoints (e.g. /public/csc/run).
export function usePersona(): Persona {
  const { user } = useAuth();
  return user?.role === "participant" ? "participant" : "caregiver";
}
