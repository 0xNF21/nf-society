"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, ChevronDown, ArrowDownCircle, ArrowUpCircle, Trophy, Gift, Coins, ExternalLink } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";

type LedgerEntry = {
  id: number;
  address: string;
  kind: string;
  amountCrc: number;
  balanceAfter: number;
  reason: string | null;
  txHash: string | null;
  gameType: string | null;
  gameSlug: string | null;
  createdAt: string;
  /** Real 0x on-chain tx hash when available (topup, cashout payout). Null
   *  for synthetic internal hashes (balance debits, prizes, house mirrors). */
  onchainTxHash: string | null;
};

const GNOSISSCAN_TX = "https://gnosisscan.io/tx/";

interface LedgerHistoryProps {
  address: string;
}

/**
 * Compact ledger view for ProfileModal. Shows the 5 most-recent wallet_ledger
 * entries by default, with a "Voir tout" toggle to expand to 20. Demo mode
 * renders a placeholder — there's no per-user ledger in demo.
 *
 * Entries are grouped visually by "in" (topup, prize, cashout-refund) vs
 * "out" (debit, cashout). The raw kind is surfaced on hover for audit.
 */
export function LedgerHistory({ address }: LedgerHistoryProps) {
  const { locale } = useLocale();
  const { isDemo } = useDemo();
  const t = translations.wallet;

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (isDemo || !address) return;
    setLoading(true);
    try {
      const limit = expanded ? 20 : 5;
      const res = await fetch(
        `/api/wallet/ledger?address=${encodeURIComponent(address)}&limit=${limit}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (Array.isArray(data.entries)) setEntries(data.entries);
    } catch {
      // silent — empty list is fine
    } finally {
      setLoading(false);
    }
  }, [address, expanded, isDemo]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  if (isDemo) {
    return (
      <div className="rounded-xl bg-ink/[0.03] border border-ink/5 p-3 text-center">
        <p className="text-xs text-ink/40">{t.historyDemoHint[locale]}</p>
      </div>
    );
  }

  if (!loading && entries.length === 0) {
    return (
      <div className="rounded-xl bg-ink/[0.03] border border-ink/5 p-3 text-center">
        <p className="text-xs text-ink/40">{t.historyEmpty[locale]}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-ink/[0.02] border border-ink/5 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-ink/5">
        <span className="text-xs font-bold uppercase tracking-widest text-ink/40">
          {t.historyTitle[locale]}
        </span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-ink/30" />}
      </div>

      <ul className={`divide-y divide-ink/5 ${expanded ? "max-h-80 overflow-y-auto" : ""}`}>
        {entries.map((e) => (
          <LedgerEntryRow key={e.id} entry={e} locale={locale} />
        ))}
      </ul>

      {entries.length >= 5 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1 py-2 text-xs font-semibold text-marine/70 hover:text-marine border-t border-ink/5"
        >
          <ChevronDown
            className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          {expanded ? t.historyLess[locale] : t.historyMore[locale]}
        </button>
      )}
    </div>
  );
}

function LedgerEntryRow({ entry, locale }: { entry: LedgerEntry; locale: "fr" | "en" }) {
  const t = translations.wallet;
  const isCredit = entry.amountCrc > 0;

  const Icon = iconFor(entry.kind);
  const iconColor = isCredit ? "text-green-500" : "text-red-500";
  const amountColor = isCredit ? "text-green-600" : "text-red-600";
  const prefix = isCredit ? "+" : "";

  const label = labelFor(entry, locale);
  const dateLabel = formatDate(entry.createdAt, locale);

  const onchainHash = entry.onchainTxHash;
  const href = onchainHash ? `${GNOSISSCAN_TX}${onchainHash}` : null;

  const content = (
    <>
      <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-ink/80 truncate flex items-center gap-1">
          {label}
          {onchainHash && <ExternalLink className="h-3 w-3 text-ink/30 shrink-0" />}
        </p>
        <p className="text-[11px] text-ink/40">{dateLabel}</p>
      </div>
      <span className={`text-sm font-black tabular-nums shrink-0 ${amountColor}`}>
        {prefix}
        {entry.amountCrc.toFixed(2).replace(/\.00$/, "")} CRC
      </span>
    </>
  );

  const tooltip = `${t.historyKind[locale]}: ${entry.kind}${
    onchainHash ? `\n${t.historyTxHash[locale]}: ${onchainHash}` : ""
  }`;

  if (href) {
    return (
      <li>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={tooltip}
          className="flex items-center gap-2 px-3 py-2 hover:bg-marine/5 transition-colors"
        >
          {content}
        </a>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2" title={tooltip}>
      {content}
    </li>
  );
}

function iconFor(kind: string) {
  switch (kind) {
    case "topup":
    case "cashout-refund":
      return ArrowDownCircle;
    case "cashout":
      return ArrowUpCircle;
    case "prize":
      return Trophy;
    case "commission":
    case "house-bet":
    case "house-payout":
      return Gift;
    case "debit":
    default:
      return Coins;
  }
}

function labelFor(entry: LedgerEntry, locale: "fr" | "en"): string {
  const t = translations.wallet;
  // Prefer the stored reason — it's already localized-ish ("Bet coin_flip classic",
  // "Prize lootbox lootbox-bronze"). Fall back to a kind-based label.
  if (entry.reason) return entry.reason;
  const kindLabels: Record<string, { fr: string; en: string }> = {
    topup: t.historyKindTopup,
    debit: t.historyKindDebit,
    prize: t.historyKindPrize,
    cashout: t.historyKindCashout,
    "cashout-refund": t.historyKindCashoutRefund,
    commission: t.historyKindCommission,
  };
  const label = kindLabels[entry.kind];
  if (label) return label[locale];
  return entry.kind;
}

function formatDate(iso: string, locale: "fr" | "en"): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
