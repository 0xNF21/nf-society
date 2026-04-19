"use client";

import { useEffect, useRef, useState } from "react";

function getOrCreateToken(storageKey: string): string {
  if (typeof window === "undefined") return "";
  const stored = localStorage.getItem(storageKey);
  if (stored) return stored;
  const token = crypto.randomUUID().slice(0, 8);
  localStorage.setItem(storageKey, token);
  return token;
}

/**
 * Manages player token for multiplayer game identification.
 * Handles URL injection (?setToken=), localStorage persistence, and auto-generation.
 * Forces a re-render when the token is resolved client-side (fixes SSR hydration gap
 * where tokenRef.current could be "" at first render, breaking payment links and restore).
 */
export function usePlayerToken(gameKey: string, slug: string) {
  const storageKey = `${gameKey}-${slug}-token`;
  const tokenRef = useRef<string>(getOrCreateToken(storageKey));
  const [, setVersion] = useState(0);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("setToken");

    if (urlToken) {
      localStorage.setItem(storageKey, urlToken);
      if (tokenRef.current !== urlToken) {
        tokenRef.current = urlToken;
        setVersion((v) => v + 1);
      }
      window.history.replaceState({}, "", window.location.pathname);
    } else if (!tokenRef.current) {
      const fresh = getOrCreateToken(storageKey);
      if (fresh) {
        tokenRef.current = fresh;
        setVersion((v) => v + 1);
      }
    }
  }, [storageKey]);

  return tokenRef;
}
