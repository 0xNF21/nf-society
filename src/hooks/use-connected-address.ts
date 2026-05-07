"use client";

import { useState, useEffect } from "react";
import { useMiniApp } from "@/components/miniapp-provider";
import { useAuthSession } from "@/components/auth-provider";

/**
 * Returns the best-known player address for the current session, with auth
 * priority :
 *
 *   1. Auth session (server-trusted)        → highest priority, set after a
 *                                              successful login (Mini App
 *                                              sign_message or 1 CRC payment)
 *   2. Mini App `walletAddress`             → host iframe context (UX hint
 *                                              when no session yet)
 *   3. Standalone `nfs_profile` localStorage → legacy "claimed" profile
 *
 * Returns `null` until at least one source resolves.
 *
 * Once a user logs in via the AuthConnectModal, the session address takes
 * over so the rest of the app picks up the verified identity even if the
 * Mini App walletAddress is still pending or the user has no local profile.
 */
export function useConnectedAddress(): string | null {
  const { isMiniApp, walletAddress } = useMiniApp();
  const { address: sessionAddress } = useAuthSession();
  const [standaloneAddr, setStandaloneAddr] = useState<string | null>(null);

  useEffect(() => {
    if (isMiniApp) return;
    try {
      const raw = localStorage.getItem("nfs_profile");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.address) setStandaloneAddr(parsed.address.toLowerCase());
      }
    } catch {
      // ignore
    }

    // Listen for storage changes (another tab or the same tab's ProfileModal)
    const handler = (e: StorageEvent) => {
      if (e.key !== "nfs_profile") return;
      if (!e.newValue) {
        setStandaloneAddr(null);
        return;
      }
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.address) setStandaloneAddr(parsed.address.toLowerCase());
      } catch {
        // ignore
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [isMiniApp]);

  // 1. Server-trusted session wins.
  if (sessionAddress) return sessionAddress;
  // 2. Mini App context (UX hint).
  if (isMiniApp && walletAddress) return walletAddress;
  // 3. Standalone localStorage fallback.
  return standaloneAddr;
}
