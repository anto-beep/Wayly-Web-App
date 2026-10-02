/**
 * useParticipantPrefill, a tool-shared hook that keeps a "participant name"
 * text field in sync with the currently active participant selected in the
 * Participants switcher.
 *
 * Behaviour:
 *   - On first render, if `value` is empty, we prefill with the active
 *     participant's name and return it via `onChange`.
 *   - When the active participant changes (via ParticipantSwitcher), if the
 *     current `value` is either empty OR matches the previously-active
 *     participant's name, we auto-update to the new participant's name. If
 *     the user typed something custom, we leave their input alone.
 *
 * Usage:
 *   const { activeParticipantName } = useParticipantPrefill({
 *       value: form.participant_name,
 *       onChange: (name) => setForm(f => ({ ...f, participant_name: name })),
 *   });
 */
import { useEffect, useRef } from "react";
import { useParticipants } from "@/context/ParticipantsContext";

export function useParticipantPrefill({ value, onChange, enabled = true }) {
    const { active } = useParticipants();
    const lastActiveName = useRef(null);
    const activeName = participantDisplayName(active);

    useEffect(() => {
        if (!enabled) return;
        if (!activeName) { lastActiveName.current = null; return; }

        const trimmed = (value || "").trim();
        const prev = lastActiveName.current;

        // First fill: field is empty, seed it from the active participant.
        // Auto-swap: field matches the previously active participant's name,
        // meaning the caregiver hasn't overridden it, update to the new one.
        if (!trimmed || (prev && trimmed === prev)) {
            if (trimmed !== activeName) onChange(activeName);
        }
        lastActiveName.current = activeName;
    }, [activeName, enabled]);

    return { activeParticipantName: activeName, activeParticipant: active };
}

export function participantDisplayName(p) {
    if (!p) return "";
    const composed = `${p.first_name || ""} ${p.last_name || ""}`.trim();
    return composed || p.name || "";
}

export default useParticipantPrefill;
