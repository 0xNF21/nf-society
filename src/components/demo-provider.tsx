"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { computeLevel, getLevelName, xpToNextLevel, XP_REWARDS } from "@/lib/xp";

const INITIAL_DEMO = {
  address: "0xdemo0000000000000000000000000000000dead",
  name: "DemoPlayer",
  xp: 0,
  xpSpent: 0,
  level: 1,
  streak: 0,
  imageUrl: "/logo-color.png",
};

export type DemoPlayer = typeof INITIAL_DEMO;

type DemoContextType = {
  isDemo: boolean;
  demoPlayer: DemoPlayer;
  enterDemo: () => void;
  exitDemo: () => void;
  addXp: (action: string) => number; // returns XP gained
  spendXp: (amount: number) => boolean; // returns success
  addStreak: () => void;
};

const DemoContext = createContext<DemoContextType>({
  isDemo: false,
  demoPlayer: INITIAL_DEMO,
  enterDemo: () => {},
  exitDemo: () => {},
  addXp: () => 0,
  spendXp: () => false,
  addStreak: () => {},
});

export const DEMO_PLAYER = INITIAL_DEMO;

export function useDemo() {
  return useContext(DemoContext);
}

function loadDemoProgress(): typeof INITIAL_DEMO {
  try {
    const raw = localStorage.getItem("nf-demo-progress");
    if (raw) {
      const data = JSON.parse(raw);
      return { ...INITIAL_DEMO, ...data };
    }
  } catch {}
  return { ...INITIAL_DEMO };
}

function saveDemoProgress(player: typeof INITIAL_DEMO) {
  try {
    localStorage.setItem("nf-demo-progress", JSON.stringify({
      xp: player.xp,
      xpSpent: player.xpSpent,
      level: player.level,
      streak: player.streak,
    }));
  } catch {}
}

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);
  const [demoPlayer, setDemoPlayer] = useState<typeof INITIAL_DEMO>(INITIAL_DEMO);

  useEffect(() => {
    const saved = localStorage.getItem("nf-demo");
    if (saved === "true") {
      setIsDemo(true);
      setDemoPlayer(loadDemoProgress());
    }
  }, []);

  const enterDemo = useCallback(() => {
    setIsDemo(true);
    localStorage.setItem("nf-demo", "true");
    const progress = loadDemoProgress();
    setDemoPlayer(progress);
  }, []);

  const exitDemo = useCallback(() => {
    setIsDemo(false);
    localStorage.removeItem("nf-demo");
    localStorage.removeItem("nf-demo-progress");
    setDemoPlayer(INITIAL_DEMO);
  }, []);

  const addXp = useCallback((action: string): number => {
    const xpGain = XP_REWARDS[action] ?? 0;
    if (xpGain === 0) return 0;

    setDemoPlayer(prev => {
      const newXp = prev.xp + xpGain;
      const newLevel = computeLevel(newXp);
      const updated = { ...prev, xp: newXp, level: newLevel };
      saveDemoProgress(updated);
      return updated;
    });

    return xpGain;
  }, []);

  const spendXp = useCallback((amount: number): boolean => {
    let success = false;
    setDemoPlayer(prev => {
      const available = prev.xp - prev.xpSpent;
      if (available < amount) return prev;
      success = true;
      const updated = { ...prev, xpSpent: prev.xpSpent + amount };
      saveDemoProgress(updated);
      return updated;
    });
    return success;
  }, []);

  const addStreak = useCallback(() => {
    setDemoPlayer(prev => {
      const newStreak = prev.streak + 1;
      let updated = { ...prev, streak: newStreak };
      // Bonus XP for 7-day streak
      if (newStreak > 0 && newStreak % 7 === 0) {
        const bonusXp = XP_REWARDS["streak_7days"] ?? 0;
        updated = { ...updated, xp: updated.xp + bonusXp, level: computeLevel(updated.xp + bonusXp) };
      }
      saveDemoProgress(updated);
      return updated;
    });
  }, []);

  return (
    <DemoContext.Provider value={{ isDemo, demoPlayer, enterDemo, exitDemo, addXp, spendXp, addStreak }}>
      {children}
    </DemoContext.Provider>
  );
}
