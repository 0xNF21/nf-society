"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

interface BalancePayButtonProps {
  gameKey: string;
  slug: string;
  amountCrc: number;
  playerToken: string | undefined;
  /** Player address (miniapp walletAddress, saved profile, or demo). Required. */
  address: string | undefined;
  /** Game-specific extras — ballValue (plinko), mineCount (mines), pickCount (keno), choice (coin_flip). */
  extras?: {
    ballValue?: number;
    mineCount?: number;
    pickCount?: number;
    choice?: "heads" | "tails";
  };
  /** Called when the debit succeeds and the game row is created. */
  onSuccess?: (result: any) => void;
  accentColor: string;
}

/**
 * Pay-from-balance option.
 *
 * Renders a card with a single button "Pay X CRC from my balance" when the
 * connected address has enough balance. Clicks POST /api/wallet/pay-game,
 * which atomically debits the balance and provisions the game-side row
 * (multi slot or chance round). On success, emits onSuccess(result) and
 * disables itself.
 *
 * Renders nothing when:
 * - address is missing
 * - playerToken is not ready yet
 * - balance is known and below amount (parent renders the normal on-chain
 *   flow and the user pays directly on-chain)
 *
 * This component deliberately DOES NOT hide or replace the existing on-chain
 * payment UI — both options stay visible to the user. Parents must render
 * their normal ChancePayment / GamePayment below this.
 */
export function BalancePayButton({
  gameKey,
  slug,
  amountCrc,
  playerToken,
  address,
  extras,
  onSuccess,
  accentColor,
}: BalancePayButtonProps) {
  const { locale } = useLocale();
  const t = translations.wallet;

  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!address) {
      setLoading(false);
      setBalance(null);
      return;
    }
    try {
      const res = await fetch(`/api/wallet/balance?address=${encodeURIComponent(address)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (typeof data.balanceCrc === "number") setBalance(data.balanceCrc);
      else setBalance(0);
    } catch {
      setBalance(0);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  async function handlePay() {
    if (!address || !playerToken || paying || success) return;
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/pay-game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameKey,
          slug,
          address,
          playerToken,
          amount: amountCrc,
          ...(extras?.ballValue !== undefined ? { ballValue: extras.ballValue } : {}),
          ...(extras?.mineCount !== undefined ? { mineCount: extras.mineCount } : {}),
          ...(extras?.pickCount !== undefined ? { pickCount: extras.pickCount } : {}),
          ...(extras?.choice !== undefined ? { choice: extras.choice } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        // Map API errors to user-friendly messages
        const err = data?.error || "error";
        setError(mapError(err, locale));
        // Refresh balance in case of concurrent change
        fetchBalance();
        return;
      }
      setSuccess(true);
      setBalance(data.balanceAfter);
      onSuccess?.(data);
    } catch (err: any) {
      setError(err?.message || t.error[locale]);
    } finally {
      setPaying(false);
    }
  }

  // Guards: don't render if we can't meaningfully show this option
  if (!address) return null;
  if (!playerToken) return null;
  if (loading) return null;
  if (balance === null) return null;
  if (balance < amountCrc) return null; // parent will render normal on-chain UI

  return (
    <div className="rounded-2xl border border-marine/20 bg-gradient-to-br from-marine/[0.04] to-citrus/[0.04] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink/50">
          <Wallet className="h-3.5 w-3.5" />
          {t.payWithBalance[locale]}
        </div>
        <span className="text-xs text-ink/50 tabular-nums">
          {balance.toFixed(2)} CRC {t.available[locale]}
        </span>
      </div>

      {success ? (
        <div className="flex items-center gap-2 justify-center rounded-xl bg-green-50 border border-green-200 p-3">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm font-semibold text-green-700">
            {t.balanceDebited[locale].replace("%REMAINING%", (balance).toFixed(2))}
          </span>
        </div>
      ) : (
        <Button
          className="w-full h-12 text-base font-bold"
          style={{ backgroundColor: accentColor }}
          onClick={handlePay}
          disabled={paying}
        >
          {paying ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t.paying[locale]}</>
          ) : (
            t.payFromBalanceBtn[locale].replace("%AMOUNT%", amountCrc.toFixed(2).replace(/\.00$/, ""))
          )}
        </Button>
      )}
      {error && <p className="text-xs text-red-500 text-center font-semibold">{error}</p>}
      {!success && (
        <p className="text-center text-[11px] text-ink/40">{t.orPayDirect[locale]}</p>
      )}
    </div>
  );
}

function mapError(code: string, locale: "fr" | "en"): string {
  const t = translations.wallet;
  switch (code) {
    case "insufficient_balance":
      return t.errorInsufficientBalance[locale];
    case "wrong_bet":
      return t.errorWrongBet[locale];
    case "already_joined":
      return t.errorAlreadyJoined[locale];
    case "already_full":
      return t.errorAlreadyFull[locale];
    case "invalid_bet":
      return t.errorInvalidBet[locale];
    case "invalid_param":
      return t.errorInvalidParam[locale];
    case "not_found":
    case "table_not_found":
      return t.errorNotFound[locale];
    default:
      return t.error[locale];
  }
}
