import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { apiFetch, getActiveParticipantId, setActiveParticipantId } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";

export type Participant = {
  id: string;
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  is_primary?: boolean;
  provider_name?: string | null;
  classification_level?: number | null;
  color_index?: number | null;
};

type RawParticipant = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  preferred_name?: string | null;
  is_primary?: boolean;
  provider_name?: string | null;
  classification?: number | null;
  classification_level?: number | null;
  color_index?: number | null;
  status?: string | null;
};

function normalize(p: RawParticipant): Participant {
  const name =
    p.preferred_name?.trim() ||
    [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
    "Participant";
  return {
    id: p.id,
    display_name: name,
    first_name: p.first_name,
    last_name: p.last_name,
    is_primary: p.is_primary,
    provider_name: p.provider_name,
    classification_level: p.classification_level ?? p.classification ?? null,
    color_index: p.color_index,
  };
}

type ParticipantState = {
  participants: Participant[];
  active: Participant | null;
  activeId: string;
  loading: boolean;
  setActive: (id: string) => Promise<void>;
  reload: () => Promise<void>;
};

const ParticipantContext = createContext<ParticipantState | undefined>(undefined);

export function ParticipantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setParticipants([]);
      setActiveId("");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ items?: RawParticipant[]; participants?: RawParticipant[] }>("/participants");
      const raw = res?.items || res?.participants || [];
      const list = raw
        .filter((p) => p.status !== "removed" && p.status !== "purged")
        .map(normalize);
      setParticipants(list);
      const stored = await getActiveParticipantId();
      const validStored = list.find((p) => p.id === stored);
      const next = validStored?.id || list.find((p) => p.is_primary)?.id || list[0]?.id || "";
      setActiveId(next);
      if (next) await setActiveParticipantId(next);
    } catch {
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const setActive = useCallback(async (id: string) => {
    setActiveId(id);
    await setActiveParticipantId(id);
  }, []);

  const active = participants.find((p) => p.id === activeId) || null;

  return (
    <ParticipantContext.Provider
      value={{ participants, active, activeId, loading, setActive, reload }}
    >
      {children}
    </ParticipantContext.Provider>
  );
}

export function useParticipants(): ParticipantState {
  const ctx = useContext(ParticipantContext);
  if (!ctx) throw new Error("useParticipants must be used within ParticipantProvider");
  return ctx;
}
