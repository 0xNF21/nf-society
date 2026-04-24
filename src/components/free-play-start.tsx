"use client";

import { useMemo, useState } from "react";
import { Copy, Check, Loader2, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { crcToXp } from "@/lib/stakes-utils";

export type FreePlayStartProps = {
  /** Clef du jeu (matche la route `POST /api/{gameKey}/start-free`). */
  gameKey: string;
  /** Slug / id de la partie (multi) ou de la table (chance). */
  gameSlug: string;
  /** Adresse du joueur (meme convention que le flow CRC — peut etre demo). */
  address: string | null | undefined;
  /** Token anti-triche genere cote client. */
  playerToken: string;
  /**
   * Montant de la mise, exprime en CRC (valeur stockee en DB dans `bet_crc`).
   * Le composant applique `crcToXp` (x10) pour l'affichage cote UI.
   */
  betCrc: number;
  /**
   * Deja "paye" ? En 2-player mode : true si creator (p1 deja assigne) et partie
   * en waiting_p2, OU si ce joueur est deja l'un des 2 joueurs.
   * En single-player (chance) : toujours false jusqu'a ce qu'on demarre une main.
   */
  alreadyJoined?: boolean;
  /** Appele apres demarrage reussi de la partie. Le parent doit rafraichir le game state. */
  onStarted: (result: { xpAfter: number }) => void;
  /** Optionnel : route cote serveur (par defaut `/api/{gameKey}/start-free`). */
  endpoint?: string;
  /** Optionnel : payload additionnel envoye au endpoint (ex: extras pour chance). */
  extraBody?: Record<string, unknown>;
  /** Nombre actuel de joueurs (pour afficher "1/2 en attente..."). */
  currentPlayers?: number;
  /** Nombre max de joueurs pour un multi. */
  maxPlayers?: number;
  /** Chance game : pas d'attente J2, on demarre tout seul. */
  isChance?: boolean;
};

export function FreePlayStart({
  gameKey,
  gameSlug,
  address,
  playerToken,
  betCrc,
  alreadyJoined,
  onStarted,
  endpoint,
  extraBody,
  currentPlayers,
  maxPlayers,
  isChance,
}: FreePlayStartProps) {
  const { locale } = useLocale();
  const t = translations.freePlayStart;

  const betXp = useMemo(() => crcToXp(betCrc), [betCrc]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleStart = async () => {
    if (!address) {
      setError(t.connectFirst[locale]);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const url = endpoint || `/api/${gameKey}/start-free`;
      const body = {
        slug: gameSlug,
        tableSlug: gameSlug,
        address,
        playerToken,
        amount: betCrc,
        ...extraBody,
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const key = data?.error as string | undefined;
        const msgMap: Record<string, string> = {
          insufficient_xp: t.errInsufficientXp[locale],
          already_full: t.errAlreadyFull[locale],
          already_joined: t.errAlreadyJoined[locale],
          wrong_bet: t.errWrongBet[locale],
          not_found: t.errNotFound[locale],
          table_not_found: t.errNotFound[locale],
        };
        setError(msgMap[key ?? ""] ?? t.errGeneric[locale]);
        return;
      }
      onStarted({ xpAfter: typeof data.xpAfter === "number" ? data.xpAfter : 0 });
    } catch {
      setError(t.errGeneric[locale]);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const slotCount = typeof currentPlayers === "number" && typeof maxPlayers === "number"
    ? `${currentPlayers}/${maxPlayers}`
    : null;

  return (
    <Card className="border-marine/20">
      <CardContent className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-marine/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-marine" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest text-ink/50 dark:text-white/50">
              {t.title[locale]}
            </div>
            <div className="font-display text-2xl font-bold text-ink dark:text-white">
              {t.betLabel[locale]} :{" "}
              <span className="tabular-nums">{betXp.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")}</span>{" "}
              XP
            </div>
          </div>
          {slotCount && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-marine/10 text-marine text-xs font-bold">
              <Users className="h-3.5 w-3.5" />
              {slotCount}
            </div>
          )}
        </div>

        {alreadyJoined ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              {isChance ? t.starting[locale] : t.waitingP2[locale]}
            </div>
            {!isChance && (
              <>
                <p className="text-xs text-ink/50 dark:text-white/50 text-center">
                  {t.waitingJoin[locale]}
                </p>
                <Button variant="outline" onClick={handleCopyLink} className="w-full">
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      {t.copied[locale]}
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      {t.copyLink[locale]}
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            <Button
              onClick={handleStart}
              disabled={loading || !address}
              className="w-full bg-marine hover:bg-marine/90 text-white font-bold py-6 text-base"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  {t.starting[locale]}
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  {isChance ? t.playBtn[locale] : t.joinBtn[locale]} ({betXp.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} XP)
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
