"use client";

import { useEffect, useRef } from "react";

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
 * Token is initialized synchronously so it's available on the first render.
 */
export function usePlayerToken(gameKey: string, slug: string) {
  const storageKey = `${gameKey}-${slug}-token`;
  const tokenRef = useRef<string>(getOrCreateToken(storageKey));

  // Handle URL injection (?setToken=) for mobile deep links
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("setToken");

    if (urlToken) {
      localStorage.setItem(storageKey, urlToken);
      tokenRef.current = urlToken;
      window.history.replaceState({}, "", window.location.pathname);
    } else if (!tokenRef.current) {
      // SSR fallback: generate token if ref was empty (server render)
      tokenRef.current = getOrCreateToken(storageKey);
    }
  }, [storageKey]);

  return tokenRef;
}
