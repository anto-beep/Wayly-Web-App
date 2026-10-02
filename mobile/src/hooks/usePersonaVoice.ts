import { useEffect, useState } from "react";

import { useAuth } from "@/src/context/AuthContext";
import { apiFetch } from "@/src/lib/api";

/**
 * usePersonaVoice — mobile mirror of web `lib/usePersonaVoice.js`.
 *
 * Single source of truth for participant-vs-caregiver language across the
 * app so result panels and guided journeys speak one consistent voice.
 * Resolution order: active journey persona (OJ-1) → user.role → "participant".
 */
export type Persona = "caregiver" | "participant";

export type Voice = {
  persona: Persona;
  isParticipant: boolean;
  isCaregiver: boolean;
  subject: string; // they | you
  subjectTitle: string; // They | You
  object: string; // them | you
  possessive: string; // their | your
  possessiveTitle: string; // Their | Your
  reflexive: string; // themself | yourself
  personDescriptor: string; // "the person you support" | "you"
  personDescriptorTitle: string;
  planPossessive: string; // "their plan" | "your plan"
};

const VOICES: Record<Persona, Voice> = {
  participant: {
    persona: "participant",
    isParticipant: true,
    isCaregiver: false,
    subject: "you",
    subjectTitle: "You",
    object: "you",
    possessive: "your",
    possessiveTitle: "Your",
    reflexive: "yourself",
    personDescriptor: "you",
    personDescriptorTitle: "You",
    planPossessive: "your plan",
  },
  caregiver: {
    persona: "caregiver",
    isParticipant: false,
    isCaregiver: true,
    subject: "they",
    subjectTitle: "They",
    object: "them",
    possessive: "their",
    possessiveTitle: "Their",
    reflexive: "themself",
    personDescriptor: "the person you support",
    personDescriptorTitle: "The person you support",
    planPossessive: "their plan",
  },
};

let _cache: { key: string | null; persona: Persona | null } = { key: null, persona: null };

export function usePersonaVoice(): Voice {
  const { user } = useAuth();
  const roleHint: Persona | null = user?.role === "participant" ? "participant" : user?.role === "caregiver" ? "caregiver" : null;
  const [persona, setPersona] = useState<Persona | null>(_cache.persona || roleHint);

  useEffect(() => {
    let alive = true;
    const uid = user?.id || "anon";
    if (_cache.key === uid && _cache.persona) {
      setPersona(_cache.persona);
      return;
    }
    (async () => {
      try {
        if (!user?.id) return;
        const res = await apiFetch<{ journey?: { persona?: string } }>("/journeys/current?include_completed=1").catch(() => null);
        if (!alive || !res) return;
        const p = res?.journey?.persona;
        const finalPersona: Persona | null = p === "caregiver" || p === "participant" ? p : roleHint;
        if (finalPersona) {
          _cache = { key: uid, persona: finalPersona };
          setPersona(finalPersona);
        }
      } catch {
        /* silent */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return VOICES[persona === "caregiver" ? "caregiver" : "participant"];
}
