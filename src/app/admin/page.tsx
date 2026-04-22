"use client";

import { useState } from "react";
import { ArrowLeft, Shield, Loader2, Lock, LogIn } from "lucide-react";
import Link from "next/link";

import type { Tab } from "./types";
import { TABS } from "./constants";
import { FlagsTab } from "./tabs/flags-tab";
import { LotteriesTab } from "./tabs/lotteries-tab";
import { LootboxesTab } from "./tabs/lootboxes-tab";
import { PayoutsTab } from "./tabs/payouts-tab";
import { XpTab } from "./tabs/xp-tab";
import { ShopTab } from "./tabs/shop-tab";
import { DailyTab } from "./tabs/daily-tab";
import { BadgesTab } from "./tabs/badges-tab";
import { ResetTab } from "./tabs/reset-tab";

/* ─── Main ─── */
export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("flags");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthenticated(true);
      } else {
        setError("Mot de passe incorrect");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-marine/10 flex items-center justify-center">
              <Shield className="h-8 w-8 text-marine" />
            </div>
            <h1 className="font-display text-2xl font-bold text-ink dark:text-white">Admin</h1>
            <p className="text-sm text-ink/50 dark:text-white/50">Panneau d&apos;administration NF Society</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/30" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe admin"
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-ink/10 dark:border-white/10 bg-white dark:bg-white/5 text-ink dark:text-white focus:border-marine focus:outline-none transition-colors"
                autoFocus />
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <button type="submit" disabled={loading || !password}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-marine text-white font-semibold hover:bg-marine/90 disabled:opacity-50 transition-colors">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Connexion
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-3xl flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Link href="/home" className="flex items-center gap-2 text-sm text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Link>
          </div>

          <header className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-xl bg-marine/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-marine" />
            </div>
            <h1 className="font-display text-3xl font-bold text-ink dark:text-white">Administration</h1>
          </header>

          {/* Tabs */}
          <div className="flex gap-1 bg-ink/5 dark:bg-white/5 rounded-2xl p-1">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === key
                    ? "bg-white dark:bg-white/10 text-ink dark:text-white shadow-sm"
                    : "text-ink/40 dark:text-white/40 hover:text-ink/60"
                }`}>
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {activeTab === "flags" && <FlagsTab password={password} />}
          {activeTab === "lotteries" && <LotteriesTab password={password} />}
          {activeTab === "lootboxes" && <LootboxesTab password={password} />}
          {activeTab === "payouts" && <PayoutsTab password={password} />}
          {activeTab === "xp" && <XpTab password={password} />}
          {activeTab === "shop" && <ShopTab password={password} />}
          {activeTab === "daily" && <DailyTab password={password} />}
          {activeTab === "badges" && <BadgesTab password={password} />}
          {activeTab === "reset" && <ResetTab password={password} />}
        </div>
      </div>
    </main>
  );
}
