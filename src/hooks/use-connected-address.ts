"use client";

import { useState, useEffect } from "react";
import { useMiniApp } from "@/components/miniapp-provider";

/**
 * Returns the best-known player address for the current session:
 * - In the Circles Mini App: the wallet address pushed by the host.
 * - In standalone: the address the user "claimed" via ProfileModal
 *   search + save (persisted in localStorage under "nfs_profile").
 *
 * Returns `null` until the address resolves (avoids SSR flash and lets
 * callers skip rendering balance-related UI until the identity is known).
 *
 * Note: in standalone, this is NOT a cryptographic proof of ownership —
 * the user could have saved someone else's profile. Phase 3d will layer
 * a payment-proof (NF Auth pattern) on top of cashout / balance debits.
 */
export function useConnectedAddress(): string | null {
  const { isMiniApp, walletAddress } = useMiniApp();
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

  return isMiniApp ? (walletAddress || null) : standaloneAddr;
}
