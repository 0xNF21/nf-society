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

const FeatureFlagContext = createContext<FlagContext>({
  flags: {},
  isEnabled: () => true,
  isVisible: () => true,
  flagStatus: () => "enabled",
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
      if (!(key in flags)) return "enabled";
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
