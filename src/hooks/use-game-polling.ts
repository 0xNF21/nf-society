"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Polls game state at a regular interval.
 * Fetches from GET /api/{gameKey}/{slug}.
 */
export function useGamePolling<T = Record<string, unknown>>(
  gameKey: string,
  slug: string,
  interval = 2000,
) {
  const [game, setGame] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch(`/api/${gameKey}/${slug}`);
      if (res.ok) {
        const data = await res.json();
        // Normalize: some routes wrap in { game: ... }
        setGame(data.game ?? data);
      }
    } catch {}
    setLoading(false);
  }, [gameKey, slug]);

  useEffect(() => {
    fetchGame();
    pollRef.current = setInterval(fetchGame, interval);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchGame, interval]);

  return { game, loading, fetchGame, setGame };
}
