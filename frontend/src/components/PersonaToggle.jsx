/**
 * PersonaToggle, caregiver / participant swap for the hero.
 *
 * Persists the selection to `localStorage.wayly_persona_intent` so anything
 * downstream (post-auth landing route, article recommendations) can respect
 * the caller's stated persona without a round-trip. Fires a PostHog event
 * `persona_toggle` on switch for the FRONTEND-REBALANCE-1 telemetry schema.
 */
import React, { useEffect, useState } from "react";
import { HandHeart, User } from "lucide-react";
import { track } from "@/lib/analytics";

const PERSONAS = [
    { id: "caregiver", label: "I am a Caregiver", icon: HandHeart, sub: "Helping a parent or partner" },
    { id: "participant", label: "I am a Participant", icon: User, sub: "Managing my own care" },
];

const STORAGE_KEY = "wayly_persona_intent";

export default function PersonaToggle({ onChange, defaultPersona = "caregiver", className = "" }) {
    const [persona, setPersona] = useState(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored === "caregiver" || stored === "participant") return stored;
        } catch { /* non-fatal */ }
        return defaultPersona;
    });

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, persona); } catch { /* non-fatal */ }
        if (onChange) onChange(persona);
    }, [persona, onChange]);

    const select = (id) => {
        if (id === persona) return;
        setPersona(id);
        try { track?.event?.("persona_toggle", { persona: id }); } catch { /* non-fatal */ }
    };

    return (
        <div
            role="tablist"
            aria-label="Choose your persona"
            className={`inline-flex items-center gap-1 rounded-full border border-primary-k/15 bg-surface-2 p-1 shadow-sm ${className}`}
            data-testid="persona-toggle"
        >
            {PERSONAS.map((p) => {
                const active = persona === p.id;
                const Icon = p.icon;
                return (
                    <button
                        key={p.id}
                        role="tab"
                        aria-selected={active}
                        onClick={() => select(p.id)}
                        data-testid={`persona-toggle-${p.id}`}
                        className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                            active
                                ? "bg-primary-k text-white shadow-md"
                                : "text-primary-k hover:bg-white/70"
                        }`}
                    >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        <span>{p.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
