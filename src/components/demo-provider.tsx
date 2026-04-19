"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { computeLevel, getLevelName, xpToNextLevel, XP_REWARDS } from "@/lib/xp";

const DEMO_INITIAL_BALANCE = 100; // Starting demo CRC balance

const INITIAL_DEMO = {
  address: "0xdemo0000000000000000000000000000000dead",
  name: "DemoPlayer",
  xp: 0,
  xpSpent: 0,
  level: 1,
  streak: 0,
  balanceCrc: DEMO_INITIAL_BALANCE,
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
  /** Credit the demo CRC balance (topup, game win). Always succeeds. */
  creditDemoBalance: (amount: number) => number;
  /** Debit the demo CRC balance (game bet, cashout). Returns false on insufficient funds. */
  debitDemoBalance: (amount: number) => boolean;
};

const DemoContext = createContext<DemoContextType>({
  isDemo: false,
  demoPlayer: INITIAL_DEMO,
  enterDemo: () => {},
  exitDemo: () => {},
  addXp: () => 0,
  spendXp: () => false,
  addStreak: () => {},
  creditDemoBalance: () => 0,
  debitDemoBalance: () => false,
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
      balanceCrc: player.balanceCrc,
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

  const creditDemoBalance = useCallback((amount: number): number => {
    if (amount <= 0) return 0;
    let newBalance = 0;
    setDemoPlayer(prev => {
      newBalance = Math.round((prev.balanceCrc + amount) * 100) / 100;
      const updated = { ...prev, balanceCrc: newBalance };
      saveDemoProgress(updated);
      return updated;
    });
    return newBalance;
  }, []);

  const debitDemoBalance = useCallback((amount: number): boolean => {
    if (amount <= 0) return false;
    let success = false;
    setDemoPlayer(prev => {
      if (prev.balanceCrc < amount) return prev;
      success = true;
      const updated = {
        ...prev,
        balanceCrc: Math.round((prev.balanceCrc - amount) * 100) / 100,
      };
      saveDemoProgress(updated);
      return updated;
    });
    return success;
  }, []);

  return (
    <DemoContext.Provider value={{ isDemo, demoPlayer, enterDemo, exitDemo, addXp, spendXp, addStreak, creditDemoBalance, debitDemoBalance }}>
      {children}
    </DemoContext.Provider>
  );
}
