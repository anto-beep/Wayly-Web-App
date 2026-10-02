/**
 * usePersonaVoice, single source of truth for participant vs caregiver
 * language across the app.
 *
 * Resolution order:
 *   1. Active OJ-1 journey persona (locked from signup or explicit choice)
 *   2. Signed-in user.role (`caregiver` | `participant`)
 *   3. Fallback: "participant" (self-serve tone; safe default for public tools)
 *
 * Returned voice object provides ready-to-use pronouns and short
 * subject/object forms so pages can render the right voice without
 * per-file conditionals.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const VOICES = {
    participant: {
        persona: "participant",
        isParticipant: true,
        isCaregiver: false,
        subject: "you",
        object: "you",
        possessive: "your",
        possessiveTitle: "Your",
        reflexive: "yourself",
        personDescriptor: "you",       // e.g. "we'll estimate what you pay"
        personDescriptorTitle: "You",
        planPossessive: "your plan",
        theyOrYou: "you",
        theyAreOrYouAre: "you're",
    },
    caregiver: {
        persona: "caregiver",
        isParticipant: false,
        isCaregiver: true,
        subject: "they",
        object: "them",
        possessive: "their",
        possessiveTitle: "Their",
        reflexive: "themself",
        personDescriptor: "the person you support",
        personDescriptorTitle: "The person you support",
        planPossessive: "their plan",
        theyOrYou: "they",
        theyAreOrYouAre: "they're",
    },
};

// Module-level cache, one fetch per session; a signal is broadcast on
// journey persona lock so consumers refresh.
let _cache = { key: null, persona: null };

export function usePersonaVoice() {
    const { user } = useAuth();
    const [persona, setPersona] = useState(_cache.persona);

    useEffect(() => {
        let alive = true;
        const uid = user?.id || "anon";
        const roleHint = (user?.role || "").toLowerCase();
        // Fast local hint first, never leave the page speaking wrong voice.
        if (!persona && (roleHint === "caregiver" || roleHint === "participant")) {
            setPersona(roleHint);
        }
        // Then reconcile with the authoritative journey record.
        if (_cache.key === uid && _cache.persona) {
            if (alive) setPersona(_cache.persona);
            return;
        }
        (async () => {
            try {
                if (!user?.id) return;
                const res = await api.get("/journeys/current?include_completed=1").catch(() => null);
                if (!alive) return;
                const p = res?.data?.journey?.persona;
                const finalPersona = (p === "caregiver" || p === "participant") ? p
                    : (roleHint === "caregiver" || roleHint === "participant") ? roleHint
                    : null;
                if (finalPersona) {
                    _cache = { key: uid, persona: finalPersona };
                    setPersona(finalPersona);
                }
            } catch { /* silent */ }
        })();

        const onChange = (e) => {
            const p = e?.detail?.persona;
            if (p === "caregiver" || p === "participant") {
                _cache = { key: uid, persona: p };
                setPersona(p);
            }
        };
        window.addEventListener("wayly:persona-changed", onChange);
        return () => {
            alive = false;
            window.removeEventListener("wayly:persona-changed", onChange);
        };
    }, [user, persona]);

    const key = persona === "caregiver" ? "caregiver" : "participant";
    return VOICES[key];
}

/** Broadcast a persona change so open pages refresh in place. */
export function broadcastPersonaChange(persona) {
    try {
        window.dispatchEvent(new CustomEvent("wayly:persona-changed", { detail: { persona } }));
    } catch { /* noop */ }
}
