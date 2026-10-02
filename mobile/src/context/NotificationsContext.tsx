import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { apiFetch } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";

export type Notification = {
  id: string;
  category?: string;
  title?: string;
  body?: string;
  link?: string | null;
  read?: boolean;
  created_at?: string;
};

type NotificationsState = {
  items: Notification[];
  unread: number;
  loading: boolean;
  reload: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsState | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setItems([]);
      setUnread(0);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{ items?: Notification[]; unread?: number }>("/notifications");
      const all = Array.isArray(data?.items) ? data.items : [];
      // Read notifications drop off the list entirely (parity with web) — the
      // bell only ever shows what still needs the user's attention.
      setItems(all.filter((n) => !n.read));
      setUnread(data?.unread || 0);
    } catch {
      /* keep last known state on transient errors */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    reload();
    if (user) {
      pollRef.current = setInterval(reload, 60_000);
    }
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") reload();
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      sub.remove();
    };
  }, [reload, user]);

  const markRead = useCallback(async (id: string) => {
    // Viewing a notification removes it from the list. Optimistically drop it
    // and decrement the badge; roll back if the server call fails.
    const target = items.find((n) => n.id === id);
    if (!target) return;
    const wasUnread = !target.read;
    setItems((prev) => prev.filter((n) => n.id !== id));
    if (wasUnread) setUnread((u) => Math.max(0, u - 1));
    try {
      await apiFetch("/notifications/read", { method: "POST", body: { ids: [id] } });
    } catch {
      setItems((prev) => (prev.some((n) => n.id === id) ? prev : [target, ...prev]));
      if (wasUnread) setUnread((u) => u + 1);
    }
  }, [items]);

  const markAllRead = useCallback(async () => {
    // Mark all read clears the list entirely.
    const hadUnread = unread;
    setItems([]);
    setUnread(0);
    try {
      await apiFetch("/notifications/read", { method: "POST", body: { ids: [] } });
    } catch {
      setUnread(hadUnread);
      reload();
    }
  }, [unread, reload]);

  return (
    <NotificationsContext.Provider value={{ items, unread, loading, reload, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsState {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
