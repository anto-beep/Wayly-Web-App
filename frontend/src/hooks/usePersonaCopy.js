/**
 * usePersonaCopy — persona-aware wording driven by the signed-in user's role
 * chosen at signup:
 *   - "participant"  → the user receives care; speak TO them ("you", "your")
 *   - "caregiver" / "family_member" → the user helps someone; speak ABOUT the
 *     participant (their name + "their")
 *
 * One source of truth so copy adapts everywhere. Pass the participant's display
 * name wherever the phrasing needs it (ignored for participants).
 *
 * Example:
 *   const persona = usePersonaCopy();
 *   persona.whose("Sam")   // caregiver → "Sam's"     participant → "your"
 *   persona.careInfo("Sam")// caregiver → "Sam's aged care information"
 *                          // participant → "your aged care information"
 */
import { useAuth } from "@/context/AuthContext";

export function usePersonaCopy() {
    const { user } = useAuth();
    const role = (user?.role || "caregiver").toLowerCase();
    const isParticipant = role === "participant";
    const clean = (n) => (n && String(n).trim()) || "";

    return {
        role,
        isParticipant,
        isCaregiver: !isParticipant,
        // Subject: participant → "you"; caregiver → the participant's name (or "them")
        who: (name) => (isParticipant ? "you" : clean(name) || "them"),
        // Possessive: participant → "your"; caregiver → "Sam's" / "their"
        whose: (name) => (isParticipant ? "your" : clean(name) ? `${clean(name)}'s` : "their"),
        // Reflexive
        themself: isParticipant ? "yourself" : "them",
        // "your aged care information" vs "Sam's / their aged care information"
        careInfo: (name) =>
            isParticipant
                ? "your aged care information"
                : `${clean(name) ? `${clean(name)}'s` : "their"} aged care information`,
    };
}

export default usePersonaCopy;
