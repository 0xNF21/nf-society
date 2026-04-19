"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { User, X, Search, Loader2, ChevronRight, LogOut } from "lucide-react";
import { LanguageSwitcher, useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { useMiniApp } from "@/components/miniapp-provider";
import { translations } from "@/lib/i18n";
import { getLevelName, xpToNextLevel } from "@/lib/xp";
import { WalletBalanceCard } from "@/components/wallet-balance-card";

type SavedProfile = {
  address: string;
  name: string;
  imageUrl: string | null;
};

type SearchResult = {
  address: string;
  name: string;
  imageUrl: string | null;
};

type PlayerData = {
  level: number;
  levelName: string;
  xp: number;
  xpToNext: number;
  streak: number;
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ProfileModal() {
  const { locale } = useLocale();
  const { isDemo, demoPlayer } = useDemo();
  const { isMiniApp, walletAddress } = useMiniApp();
  const tp = translations.profile;
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedProfile | null>(null);
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debouncedQuery = useDebounce(query, 350);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fermer avec Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Charger profil sauvegardé au montage (ou injecter démo / Mini App)
  useEffect(() => {
    if (isDemo) {
      setSaved({ address: demoPlayer.address, name: demoPlayer.name, imageUrl: demoPlayer.imageUrl });
      setPlayer({
        level: demoPlayer.level,
        levelName: getLevelName(demoPlayer.level),
        xp: demoPlayer.xp,
        xpToNext: xpToNextLevel(demoPlayer.xp),
        streak: demoPlayer.streak,
      });
      return;
    }
    // Mini App: auto-connect avec le wallet Circles
    if (isMiniApp && walletAddress) {
      fetch(`/api/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: [walletAddress] }),
      })
        .then(r => r.json())
        .then(data => {
          const p = data.profiles?.[walletAddress.toLowerCase()];
          setSaved({
            address: walletAddress,
            name: p?.name || `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
            imageUrl: p?.imageUrl || null,
          });
        })
        .catch(() => {
          setSaved({
            address: walletAddress,
            name: `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`,
            imageUrl: null,
          });
        });
      return;
    }
    try {
      const raw = localStorage.getItem("nfs_profile");
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, [isDemo, demoPlayer, isMiniApp, walletAddress]);

  // Charger données XP quand profil connu
  useEffect(() => {
    if (isDemo || !saved?.address) return;
    fetch(`/api/players/${saved.address}`)
      .then(r => r.json())
      .then(d => setPlayer(d))
      .catch(() => {});
  }, [saved, isDemo]);

  // Recherche Circles
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) { setResults([]); return; }
    setSearching(true);
    fetch(`/api/profiles/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then(r => r.json())
      .then(d => setResults(d.results ?? []))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, [debouncedQuery]);

  // Focus input à l'ouverture
  useEffect(() => {
    if (open && !saved) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, saved]);

  function selectProfile(result: SearchResult) {
    const profile: SavedProfile = { address: result.address, name: result.name, imageUrl: result.imageUrl };
    localStorage.setItem("nfs_profile", JSON.stringify(profile));
    setSaved(profile);
    setQuery("");
    setResults([]);
  }

  function disconnect() {
    localStorage.removeItem("nfs_profile");
    setSaved(null);
    setPlayer(null);
    setQuery("");
  }

  const progressPct = player
    ? Math.min(Math.round(((player.xp - getXpForLevel(player.level)) / (getXpForLevel(player.level + 1) - getXpForLevel(player.level) || 1)) * 100), 100)
    : 0;

  return (
    <>
      {/* Barre haut droite : langue + daily + profil */}
      <div style={{ position: "fixed", top: 12, right: 12, zIndex: 40, display: "flex", alignItems: "center", gap: 6 }}>
        <div className="rounded-full shadow-sm border border-ink/10 bg-white/90 dark:bg-white/10 backdrop-blur-sm px-2 py-1.5">
          <LanguageSwitcher />
        </div>
        <button
          onClick={() => window.dispatchEvent(new Event("open-daily-modal"))}
          className="flex items-center gap-1.5 rounded-full shadow-md border border-ink/10 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/40 backdrop-blur-sm px-2.5 py-2 hover:shadow-lg transition-all hover:scale-[1.02]"
          title="Daily"
        >
          <span className="text-base">🎰</span>
          <span className="text-xs font-bold text-amber-700 dark:text-amber-300 hidden sm:inline">Daily</span>
        </button>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full shadow-md border border-ink/10 bg-white/90 dark:bg-white/10 backdrop-blur-sm px-2.5 py-2 hover:bg-white dark:hover:bg-white/15 transition-all hover:shadow-lg"
        >
          {saved?.imageUrl ? (
            <img src={saved.imageUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <User className="h-4 w-4 text-marine dark:text-blue-400" />
          )}
          <span className="text-sm font-semibold text-ink hidden sm:inline">
            {saved ? saved.name || `${saved.address.slice(0, 6)}…${saved.address.slice(-4)}` : tp.button[locale]}
          </span>
          {player && (
            <span className="text-xs font-bold text-marine dark:text-blue-400 bg-marine/10 dark:bg-blue-400/20 px-1.5 py-0.5 rounded-full">
              Lv.{player.level}
            </span>
          )}
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-ink/10 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-ink/5">
              <h2 className="text-base font-bold text-ink">{tp.title[locale]}</h2>
              <button onClick={() => setOpen(false)} className="text-ink/50 hover:text-ink transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {saved ? (
              /* Profil connecté */
              <div className="p-5 space-y-4 overflow-y-auto">
                {/* Identité */}
                <div className="flex items-center gap-3">
                  {saved.imageUrl ? (
                    <img src={saved.imageUrl} alt="" className="h-12 w-12 rounded-full object-cover shadow" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-marine/10 flex items-center justify-center shadow">
                      <span className="text-lg font-black text-marine">{(saved.name || "?").slice(0, 2).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-ink truncate">{saved.name || tp.title[locale]}</p>
                    <p className="text-xs font-mono text-ink/50 truncate">{saved.address}</p>
                  </div>
                </div>

                {/* XP + Niveau */}
                {player && (
                  <div className="rounded-xl bg-ink/[0.03] border border-ink/5 p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-ink/40 font-bold uppercase tracking-widest">{tp.levelLabel[locale]}</span>
                      <span className="text-sm font-black text-marine">Lv.{player.level} — {player.levelName}</span>
                    </div>
                    <div className="h-2 rounded-full bg-ink/10 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #251B9F, #FF491B)" }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-ink/50">
                      <span>{player.xp.toLocaleString()} XP</span>
                      {player.level < 10 && <span>+{player.xpToNext} {locale === "fr" ? "pour" : "to"} Lv.{player.level + 1}</span>}
                    </div>
                    {player.streak > 0 && (
                      <p className="text-xs font-semibold text-citrus">🔥 Streak {player.streak} {locale === "fr" ? `jour${player.streak > 1 ? "s" : ""}` : `day${player.streak > 1 ? "s" : ""}`}</p>
                    )}
                  </div>
                )}

                {/* Solde CRC (wallet) — works in both real and demo mode */}
                <WalletBalanceCard address={saved.address} />

                {/* Actions */}
                <div className="flex gap-2">
                  <Link
                    href={`/player/${saved.address}`}
                    onClick={() => setOpen(false)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-marine text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    {tp.viewProfile[locale]} <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    onClick={disconnect}
                    className="px-3 py-2.5 rounded-xl border border-ink/10 text-ink/40 hover:text-ink hover:border-ink/20 transition-colors"
                    title={tp.disconnectTitle[locale]}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              /* Recherche profil */
              <div className="p-5 space-y-4 overflow-y-auto">
                <p className="text-sm text-ink/50">{tp.searchHint[locale]}</p>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/50" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={tp.placeholder[locale]}
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-ink/15 bg-white text-sm focus:outline-none focus:border-marine/50 focus:ring-2 focus:ring-marine/10 transition-all"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/50 animate-spin" />
                  )}
                </div>

                {results.length > 0 && (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {results.map(r => (
                      <button
                        key={r.address}
                        onClick={() => selectProfile(r)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-ink/5 transition-colors text-left"
                      >
                        {r.imageUrl ? (
                          <img src={r.imageUrl} alt="" className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-marine/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-bold text-marine">{(r.name || "?").slice(0, 2).toUpperCase()}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-ink truncate">{r.name}</p>
                          <p className="text-xs font-mono text-ink/50 truncate">{r.address}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {query.length >= 2 && !searching && results.length === 0 && (
                  <p className="text-sm text-ink/50 text-center py-2">{tp.noResults[locale]}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// XP requis par niveau (doit correspondre à src/lib/xp.ts)
function getXpForLevel(level: number): number {
  const xpTable: Record<number, number> = { 1:0, 2:100, 3:250, 4:500, 5:1000, 6:2000, 7:4000, 8:7000, 9:12000, 10:20000 };
  return xpTable[level] ?? 20000;
}
