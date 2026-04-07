"use client";

import { useState, useEffect, useRef } from "react";
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
  const lastScanRef = useRef(0);

  const config = GAME_REGISTRY[gameKey];
  const scanRoute = config?.scanRoute;

  useEffect(() => {
    let active = true;
    let timer: NodeJS.Timeout;

    async function tick() {
      if (!active) return;

      try {
        // Fetch game state
        const res = await fetch(`/api/${gameKey}/${slug}`);
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          const g = data.game ?? data;
          setGame(g);

          // Auto-scan if waiting for payment
          const status = g?.status;
          console.log(`[GamePolling] ${gameKey}/${slug} status=${status} scanRoute=${scanRoute}`);
          if ((status === "waiting_p1" || status === "waiting_p2") && scanRoute) {
            const now = Date.now();
            if (now - lastScanRef.current > 4000) {
              lastScanRef.current = now;
              console.log(`[GamePolling] Scanning ${scanRoute}?gameSlug=${slug}`);
              try {
                await fetch(`${scanRoute}?gameSlug=${slug}`, { method: "POST" });
                // Re-fetch after scan
                if (!active) return;
                const res2 = await fetch(`/api/${gameKey}/${slug}`);
                if (res2.ok) {
                  const data2 = await res2.json();
                  setGame(data2.game ?? data2);
                }
              } catch {}
            }
          }
        }
      } catch {}

      setLoading(false);

      if (active) {
        timer = setTimeout(tick, interval);
      }
    }

    tick();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [gameKey, slug, interval, scanRoute]);

  const fetchGame = async () => {
    try {
      const res = await fetch(`/api/${gameKey}/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setGame(data.game ?? data);
      }
    } catch {}
  };

  return { game, loading, fetchGame, setGame };
}
