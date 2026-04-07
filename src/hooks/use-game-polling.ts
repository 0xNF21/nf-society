"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { GAME_REGISTRY } from "@/lib/game-registry";

/**
 * Polls game state at a regular interval.
 * Also auto-scans payments when game is in waiting status.
 */
export function useGamePolling<T = Record<string, unknown>>(
  gameKey: string,
  slug: string,
  interval = 2000,
) {
  const [game, setGame] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const scanRef = useRef<NodeJS.Timeout | null>(null);
  const statusRef = useRef<string>("");

  const config = GAME_REGISTRY[gameKey];

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch(`/api/${gameKey}/${slug}`);
      if (res.ok) {
        const data = await res.json();
        const g = data.game ?? data;
        setGame(g);
        statusRef.current = g?.status || "";
      }
    } catch {}
    setLoading(false);
  }, [gameKey, slug]);

  const scanPayments = useCallback(async () => {
    if (!config) return;
    try {
      await fetch(`${config.scanRoute}?gameSlug=${slug}`, { method: "POST" });
      await fetchGame();
    } catch {}
  }, [config, slug, fetchGame]);

  // Game polling
  useEffect(() => {
    fetchGame();
    pollRef.current = setInterval(fetchGame, interval);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchGame, interval]);

  // Auto-scan payments when waiting
  useEffect(() => {
    if (!config) return;

    const checkAndScan = () => {
      const s = statusRef.current;
      if (s === "waiting_p1" || s === "waiting_p2") {
        scanPayments();
      }
    };

    // Initial scan after a short delay
    const initTimeout = setTimeout(checkAndScan, 1000);
    scanRef.current = setInterval(checkAndScan, 5000);

    return () => {
      clearTimeout(initTimeout);
      if (scanRef.current) clearInterval(scanRef.current);
    };
  }, [config, scanPayments]);

  return { game, loading, fetchGame, setGame };
}
