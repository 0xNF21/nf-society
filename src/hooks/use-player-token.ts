"use client";

import { useEffect, useRef } from "react";

/**
 * Manages player token for multiplayer game identification.
 * Handles URL injection (?setToken=), localStorage persistence, and auto-generation.
 */
export function usePlayerToken(gameKey: string, slug: string) {
  const tokenRef = useRef<string>("");

  useEffect(() => {
    const storageKey = `${gameKey}-${slug}-token`;

    // Check URL param first (for mobile injection)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("setToken");

    if (urlToken) {
      localStorage.setItem(storageKey, urlToken);
      tokenRef.current = urlToken;
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        tokenRef.current = stored;
      } else {
        const token = crypto.randomUUID().slice(0, 8);
        localStorage.setItem(storageKey, token);
        tokenRef.current = token;
      }
    }
  }, [gameKey, slug]);

  return tokenRef;
}
