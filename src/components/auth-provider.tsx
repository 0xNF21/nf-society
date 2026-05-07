"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useMiniApp } from "@/components/miniapp-provider";
import { AuthConnectModal } from "@/components/auth-connect-modal";

/**
 * Auth session state for the client. The actual proof token lives in an
 * HttpOnly cookie set by the server — we never see it here. We just track
 * whether the user is authenticated and what address the server trusts.
 *
 * The provider hydrates on mount via GET /api/auth/session, and exposes
 * helpers to start a login flow (Mini App or Standalone) and to log out.
 *
 * The connect modal is rendered inline by the provider so any component
 * that has access to `useAuthSession()` can call `openLogin()` to trigger
 * the auth flow.
 *
 * Wallet switch detection (Mini App only) : when `walletAddress` from the
 * Circles bridge changes and no longer matches `address`, we auto-logout
 * the local session so the user re-authenticates with the new wallet.
 */

interface AuthContextValue {
  /** True if a valid server session exists. */
  isAuthenticated: boolean;
  /** Trusted wallet address (lowercased) when authenticated. */
  address: string | null;
  /** Where the session was created. */
  origin: "miniapp" | "standalone" | "unknown" | null;
  /** Session sliding expiration (ISO). */
  expiresAt: string | null;
  /** True while the initial /api/auth/session lookup is pending. */
  loading: boolean;
  /** Re-fetch the session state from the server. */
  refresh: () => Promise<void>;
  /** Revoke the session and clear the cookie. */
  logout: () => Promise<void>;
  /** Open the auth modal — used as the recovery path when a route returns 401. */
  openLogin: () => void;
  /** Close the auth modal manually. */
  closeLogin: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  address: null,
  origin: null,
  expiresAt: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
  openLogin: () => {},
  closeLogin: () => {},
});

type SessionInfo = {
  isAuthenticated: boolean;
  address: string | null;
  origin: "miniapp" | "standalone" | "unknown" | null;
  expiresAt: string | null;
};

const EMPTY: SessionInfo = {
  isAuthenticated: false,
  address: null,
  origin: null,
  expiresAt: null,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { walletAddress: miniAppAddress, isMiniApp } = useMiniApp();
  const [session, setSession] = useState<SessionInfo>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const openLogin = useCallback(() => setModalOpen(true), []);
  const closeLogin = useCallback(() => setModalOpen(false), []);

  const fetchSession = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();
      if (data?.authenticated) {
        setSession({
          isAuthenticated: true,
          address: typeof data.address === "string" ? data.address.toLowerCase() : null,
          origin: data.origin ?? null,
          expiresAt: data.expiresAt ?? null,
        });
      } else {
        setSession(EMPTY);
      }
    } catch (err) {
      console.error("[auth] session fetch failed:", err);
      setSession(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial hydration on mount.
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Mini App wallet switch detection : if the Circles host reports a
  // different wallet than the session, the server-side session is stale.
  // We logout locally so the next sensitive action prompts re-auth with
  // the new wallet.
  useEffect(() => {
    if (!isMiniApp) return;
    if (!session.isAuthenticated || !session.address) return;
    if (!miniAppAddress) return;
    if (miniAppAddress.toLowerCase() === session.address.toLowerCase()) return;

    // Address mismatch — invalidate the local session.
    (async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      } catch {
        // Even on error, refresh state.
      }
      setSession(EMPTY);
    })();
  }, [isMiniApp, miniAppAddress, session.isAuthenticated, session.address]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (err) {
      console.error("[auth] logout failed:", err);
    } finally {
      setSession(EMPTY);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: session.isAuthenticated,
        address: session.address,
        origin: session.origin,
        expiresAt: session.expiresAt,
        loading,
        refresh: fetchSession,
        logout,
        openLogin,
        closeLogin,
      }}
    >
      {children}
      <AuthConnectModal open={modalOpen} onClose={closeLogin} />
    </AuthContext.Provider>
  );
}

export function useAuthSession() {
  return useContext(AuthContext);
}
