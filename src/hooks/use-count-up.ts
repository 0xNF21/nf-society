"use client";

import { useEffect, useRef, useState } from "react";

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Animates a number from 0 to `target` over `duration` ms.
 * Starts when `enabled` becomes true (only once per hook instance).
 *
 * Returns the current animated value, or null if not yet enabled or target is null.
 */
export function useCountUp(
  target: number | null,
  options: { duration?: number; enabled?: boolean } = {},
): number | null {
  const { duration = 1500, enabled = true } = options;
  const [value, setValue] = useState<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || target == null || startedRef.current) return;
    startedRef.current = true;

    const startTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutExpo(t);
      setValue(Math.round(target * eased));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, target, duration]);

  return value;
}
