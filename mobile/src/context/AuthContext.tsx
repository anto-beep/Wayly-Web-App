import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

import { apiFetch, clearTokens, getToken, setTokens } from "@/src/lib/api";

export type WaylyUser = {
  id: string;
  email: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  role: string;
  plan: string;
  household_id?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  cancel_at_period_end?: boolean | null;
};

type AuthState = {
  user: WaylyUser | null;
  loading: boolean; // initial session check
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

export type SignupPayload = {
  email: string;
  password: string;
  name: string;
  first_name?: string;
  last_name?: string;
  mobile?: string;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

WebBrowser.maybeCompleteAuthSession();

function extractSessionId(url: string): string | null {
  if (!url) return null;
  const frag = url.includes("#") ? url.split("#")[1] : "";
  const query = url.includes("?") ? url.split("?")[1].split("#")[0] : "";
  const params = new URLSearchParams(frag || query);
  return params.get("session_id");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<WaylyUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiFetch<WaylyUser>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  // Initial session check on mount.
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ token: string; refresh_token?: string; user: WaylyUser }>(
      "/auth/login",
      { method: "POST", auth: false, body: { email: email.trim().toLowerCase(), password } }
    );
    await setTokens(data.token, data.refresh_token);
    setUser(data.user);
  }, []);

  const signup = useCallback(async (payload: SignupPayload) => {
    const data = await apiFetch<{ token: string; refresh_token?: string; user: WaylyUser }>(
      "/auth/signup",
      {
        method: "POST",
        auth: false,
        body: {
          email: payload.email.trim().toLowerCase(),
          password: payload.password,
          name: payload.name.trim(),
          first_name: payload.first_name,
          last_name: payload.last_name,
          mobile: payload.mobile,
          role: "caregiver",
          // Free plan retired; match web default. Billing/activation is completed
          // on the web (mobile is view-only for plans per product decision).
          plan: "family",
        },
      }
    );
    await setTokens(data.token, data.refresh_token);
    setUser(data.user);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl =
      Platform.OS === "web"
        ? `${window.location.origin}/`
        : Linking.createURL("auth");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    let returnedUrl: string | null = null;
    if (Platform.OS === "web") {
      window.location.href = authUrl; // full-page redirect; handled on mount
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
    if (result.type === "success" && result.url) returnedUrl = result.url;
    if (!returnedUrl) return; // user cancelled

    const sessionId = extractSessionId(returnedUrl);
    if (!sessionId) throw new Error("Could not complete Google sign-in");
    const data = await apiFetch<{ token: string; refresh_token?: string; user: WaylyUser }>(
      "/auth/google-session",
      { method: "POST", auth: false, body: { session_id: sessionId } }
    );
    await setTokens(data.token, data.refresh_token);
    setUser(data.user);
  }, []);

  // Handle Google redirect on the Expo web preview (session_id in URL).
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const sid = extractSessionId(window.location.href);
    if (!sid) return;
    (async () => {
      try {
        const data = await apiFetch<{ token: string; refresh_token?: string; user: WaylyUser }>(
          "/auth/google-session",
          { method: "POST", auth: false, body: { session_id: sid } }
        );
        await setTokens(data.token, data.refresh_token);
        setUser(data.user);
        window.history.replaceState(null, "", window.location.pathname);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      /* best-effort */
    }
    await clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, signup, loginWithGoogle, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
