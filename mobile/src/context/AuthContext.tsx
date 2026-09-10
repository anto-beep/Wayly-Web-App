import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import * as AppleAuthentication from "expo-apple-authentication";

import { apiFetch, clearTokens, getToken, setTokens, setReadOnlyMode } from "@/src/lib/api";

WebBrowser.maybeCompleteAuthSession();

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS,
// THIS BREAKS THE AUTH.
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

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
  // "active" | "trial" → full access; "view_only" → read-only. Admins: "active".
  access_state?: string | null;
};

type AuthState = {
  user: WaylyUser | null;
  loading: boolean; // initial session check
  viewOnly: boolean; // access_state === "view_only" → read-only mode
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
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
  role?: "caregiver" | "participant";
  plan?: string;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<WaylyUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Set the user AND keep the api-layer read-only flag in sync.
  const applyUser = useCallback((u: WaylyUser | null) => {
    setUser(u);
    setReadOnlyMode(!!u && u.access_state === "view_only");
  }, []);

  // Wayly's own Google OAuth (native client id). Yields a Google ID token
  // which we verify server-side at POST /auth/google and swap for a Wayly JWT.
  // Wayly's own Google OAuth (native client ids). On iOS the native iOS
  // client is used (Google blocks the web-client implicit flow on native);
  // on the Expo web preview the web client is used. Yields a Google ID token
  // which we verify server-side at POST /auth/google and swap for a Wayly JWT.
  const [, googleResponse, googlePromptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    webClientId: GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiFetch<WaylyUser>("/auth/me");
      applyUser(me);
    } catch {
      applyUser(null);
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

  const completeGoogle = useCallback(async (idToken: string) => {
    const data = await apiFetch<{ token: string; refresh_token?: string; user: WaylyUser }>(
      "/auth/google",
      { method: "POST", auth: false, body: { credential: idToken } }
    );
    await setTokens(data.token, data.refresh_token);
    applyUser(data.user);
  }, []);

  // React to the Google auth response (id_token comes back here).
  useEffect(() => {
    if (googleResponse?.type === "success") {
      const idToken =
        (googleResponse.params as Record<string, string> | undefined)?.id_token ||
        (googleResponse.authentication as { idToken?: string } | null)?.idToken;
      if (idToken) completeGoogle(idToken).catch(() => {});
    }
  }, [googleResponse, completeGoogle]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ token: string; refresh_token?: string; user: WaylyUser }>(
      "/auth/login",
      { method: "POST", auth: false, body: { email: email.trim().toLowerCase(), password } }
    );
    await setTokens(data.token, data.refresh_token);
    applyUser(data.user);
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
          role: payload.role || "caregiver",
          plan: payload.plan || "family",
        },
      }
    );
    await setTokens(data.token, data.refresh_token);
    applyUser(data.user);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    // Opens the Google sign-in flow; the id_token is handled by the
    // googleResponse effect above once the user returns.
    await googlePromptAsync();
  }, [googlePromptAsync]);

  // Sign in with Apple (native iOS). The identity token is verified server-side
  // at POST /auth/apple, which links by verified email or creates an account.
  const loginWithApple = useCallback(async () => {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const identityToken = credential.identityToken;
    if (!identityToken) throw new Error("Apple did not return an identity token");
    const fullName = credential.fullName
      ? [credential.fullName.givenName, credential.fullName.familyName].filter(Boolean).join(" ").trim()
      : undefined;
    const data = await apiFetch<{ token: string; refresh_token?: string; user: WaylyUser }>(
      "/auth/apple",
      { method: "POST", auth: false, body: { identity_token: identityToken, email: credential.email || undefined, full_name: fullName || undefined } }
    );
    await setTokens(data.token, data.refresh_token);
    applyUser(data.user);
  }, [applyUser]);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      /* best-effort */
    }
    await clearTokens();
    applyUser(null);
  }, [applyUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        viewOnly: !!user && user.access_state === "view_only",
        login,
        signup,
        loginWithGoogle,
        loginWithApple,
        logout,
        refreshUser,
      }}
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
