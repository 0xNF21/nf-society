"use client";

import { useState, useCallback } from "react";
import { ArrowLeft, Shield, Loader2, Lock, LogIn, Eye, EyeOff, Clock } from "lucide-react";
import Link from "next/link";

type FlagStatus = "enabled" | "coming_soon" | "hidden";

interface Flag {
  key: string;
  status: FlagStatus;
  label: string;
  category: string;
  updatedAt: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  chance: "border-amber-200 bg-amber-50/50",
  multiplayer: "border-violet-200 bg-violet-50/50",
  general: "border-sky-200 bg-sky-50/50",
};

const CATEGORY_LABELS: Record<string, string> = {
  chance: "Jeux de chance",
  multiplayer: "Jeux multijoueur",
  general: "General",
};

const STATUS_CONFIG: Record<FlagStatus, { label: string; icon: typeof Eye; color: string; bg: string }> = {
  enabled:     { label: "Actif",       icon: Eye,    color: "text-green-600", bg: "bg-green-100 border-green-300" },
  coming_soon: { label: "Coming Soon", icon: Clock,  color: "text-amber-600", bg: "bg-amber-100 border-amber-300" },
  hidden:      { label: "Cache",       icon: EyeOff, color: "text-ink/40",    bg: "bg-ink/5 border-ink/10" },
};

const STATUS_ORDER: FlagStatus[] = ["enabled", "coming_soon", "hidden"];

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchFlags = useCallback(async (pwd: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/flags", {
        headers: { "x-admin-password": pwd },
      });
      if (!res.ok) throw new Error("Unauthorized");
      const data = await res.json();
      setFlags(data.flags || []);
      setAuthenticated(true);
      setError("");
    } catch {
      setError("Mot de passe incorrect");
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchFlags(password);
  };

  const cycleStatus = async (key: string, currentStatus: FlagStatus) => {
    const currentIdx = STATUS_ORDER.indexOf(currentStatus);
    const nextStatus = STATUS_ORDER[(currentIdx + 1) % STATUS_ORDER.length];
    setToggling(key);
    try {
      const res = await fetch("/api/admin/flags", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify({ key, status: nextStatus }),
      });
      if (!res.ok) throw new Error("Failed");
      setFlags((prev) =>
        prev.map((f) => (f.key === key ? { ...f, status: nextStatus } : f))
      );
    } catch {
      setError("Erreur lors du changement");
    } finally {
      setToggling(null);
    }
  };

  // Group flags by category
  const grouped = flags.reduce<Record<string, Flag[]>>((acc, flag) => {
    const cat = flag.category || "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(flag);
    return acc;
  }, {});

  if (!authenticated) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-marine/10 flex items-center justify-center">
              <Shield className="h-8 w-8 text-marine" />
            </div>
            <h1 className="font-display text-2xl font-bold text-ink dark:text-white">Admin</h1>
            <p className="text-sm text-ink/50 dark:text-white/50">
              Panneau d&apos;administration NF Society
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/30" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe admin"
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-ink/10 dark:border-white/10 bg-white dark:bg-white/5 text-ink dark:text-white focus:border-marine focus:outline-none transition-colors"
                autoFocus
              />
            </div>
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-marine text-white font-semibold hover:bg-marine/90 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
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
        <div className="w-full max-w-2xl flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Link>
          </div>

          <header className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-xl bg-marine/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-marine" />
            </div>
            <h1 className="font-display text-3xl font-bold text-ink dark:text-white">
              Feature Flags
            </h1>
            <p className="text-sm text-ink/50 dark:text-white/50">
              Controle la visibilite de chaque fonctionnalite
            </p>
            <div className="flex items-center justify-center gap-4 pt-2">
              {STATUS_ORDER.map((s) => {
                const cfg = STATUS_CONFIG[s];
                const Icon = cfg.icon;
                return (
                  <div key={s} className={`flex items-center gap-1.5 text-xs ${cfg.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    <span className="font-medium">{cfg.label}</span>
                  </div>
                );
              })}
            </div>
          </header>

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-600 dark:text-red-400 text-center">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {Object.entries(grouped).map(([category, categoryFlags]) => (
              <div key={category} className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink/40 dark:text-white/40 px-1">
                  {CATEGORY_LABELS[category] || category}
                </h2>
                <div className="space-y-2">
                  {categoryFlags.map((flag) => {
                    const cfg = STATUS_CONFIG[flag.status] || STATUS_CONFIG.enabled;
                    const StatusIcon = cfg.icon;
                    return (
                      <div
                        key={flag.key}
                        className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                          flag.status === "enabled"
                            ? CATEGORY_COLORS[category] || "border-ink/10 bg-white/80"
                            : flag.status === "coming_soon"
                              ? "border-amber-200 bg-amber-50/30 dark:border-amber-800/50 dark:bg-amber-900/10"
                              : "border-ink/5 bg-ink/5 dark:border-white/5 dark:bg-white/5 opacity-50"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink dark:text-white text-sm">
                              {flag.label}
                            </span>
                            <span className="text-[10px] font-mono text-ink/30 dark:text-white/30 bg-ink/5 dark:bg-white/10 px-1.5 py-0.5 rounded">
                              {flag.key}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => cycleStatus(flag.key, flag.status)}
                          disabled={toggling === flag.key}
                          className={`shrink-0 ml-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 ${cfg.bg} ${cfg.color}`}
                        >
                          {toggling === flag.key ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <StatusIcon className="h-3.5 w-3.5" />
                          )}
                          {cfg.label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {flags.length === 0 && !loading && (
            <p className="text-center text-ink/40 dark:text-white/40 py-8">
              Aucun flag configure
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
