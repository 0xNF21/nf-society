"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type FlagStatus = "enabled" | "coming_soon" | "hidden";

type Flags = Record<string, FlagStatus>;

interface FlagContext {
  flags: Flags;
  isEnabled: (key: string) => boolean;
  isVisible: (key: string) => boolean;
  flagStatus: (key: string) => FlagStatus;
  loading: boolean;
}

/**
 * Flags pour lesquels l'absence en DB ou un /api/flags qui throw doit
 * retourner "hidden" cote client (fail-closed). Miroir de la logique
 * fail-closed du backend (src/lib/stakes.ts, PR #45).
 *
 * Sans cette protection, un /api/flags qui foire fait apparaitre des
 * boutons "Top up" / "Pay CRC" alors que le serveur les refuse — UX
 * cassee + utilisateur qui pense pouvoir agir.
 */
const FAIL_CLOSED_FLAGS = new Set(["real_stakes", "chance_games_xp_only"]);

function defaultStatus(key: string): FlagStatus {
  return FAIL_CLOSED_FLAGS.has(key) ? "hidden" : "enabled";
}

const FeatureFlagContext = createContext<FlagContext>({
  flags: {},
  isEnabled: () => true,
  isVisible: () => true,
  flagStatus: (key: string) => defaultStatus(key),
  loading: true,
});

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<Flags>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/flags")
      .then((r) => r.json())
      .then((data) => {
        setFlags(data.flags || {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const flagStatus = useCallback(
    (key: string): FlagStatus => {
      if (!(key in flags)) return defaultStatus(key);
      return flags[key];
    },
    [flags]
  );

  const isEnabled = useCallback(
    (key: string) => flagStatus(key) === "enabled",
    [flagStatus]
  );

  const isVisible = useCallback(
    (key: string) => flagStatus(key) !== "hidden",
    [flagStatus]
  );

  return (
    <FeatureFlagContext.Provider value={{ flags, isEnabled, isVisible, flagStatus, loading }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagContext);
}
