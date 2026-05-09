"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { useAuthSession } from "@/components/auth-provider";
import { useLocale } from "@/components/language-provider";
import { Switch } from "@/components/ui/switch";
import { translations } from "@/lib/i18n";

type PrivacyKey =
  | "hidePnl"
  | "hideTotalBet"
  | "hideFragmentsSpent"
  | "hideGameHistory"
  | "hideFromLeaderboard"
  | "hideFromSearch";

type Settings = Record<PrivacyKey, boolean>;

const DEFAULT_SETTINGS: Settings = {
  hidePnl: false,
  hideTotalBet: false,
  hideFragmentsSpent: false,
  hideGameHistory: false,
  hideFromLeaderboard: false,
  hideFromSearch: false,
};

type AuthState = "idle" | "confirmed";

export default function PrivacyPage() {
  const { locale } = useLocale();
  const t = translations.privacy;
  const { address: sessionAddress, loading: authLoading, openLogin } = useAuthSession();

  const [authState, setAuthState] = useState<AuthState>("idle");
  const [verifiedAddress, setVerifiedAddress] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<PrivacyKey | null>(null);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (sessionAddress) {
      setVerifiedAddress(sessionAddress);
      setAuthState("confirmed");
      return;
    }

    setVerifiedAddress("");
    setAuthState("idle");
    setLoading(false);
  }, [authLoading, sessionAddress]);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/privacy", {
        cache: "no-store",
        credentials: "include",
      });
      if (res.status === 401) {
        setVerifiedAddress("");
        setAuthState("idle");
        return;
      }
      if (!res.ok) return;

      const data = await res.json();
      if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      if (typeof data.address === "string") setVerifiedAddress(data.address);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authState === "confirmed") {
      void fetchSettings();
    }
  }, [authState, fetchSettings]);

  const startAuth = () => openLogin();

  const toggleSetting = async (key: PrivacyKey, value: boolean) => {
    const prev = settings[key];
    setSettings((s) => ({ ...s, [key]: value }));
    setSavingKey(key);
    try {
      const res = await fetch("/api/privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ settings: { [key]: value } }),
      });
      if (res.status === 401) {
        setSettings((s) => ({ ...s, [key]: prev }));
        setVerifiedAddress("");
        setAuthState("idle");
        openLogin();
        return;
      }
      if (!res.ok) {
        setSettings((s) => ({ ...s, [key]: prev }));
      }
    } catch {
      setSettings((s) => ({ ...s, [key]: prev }));
    } finally {
      setSavingKey(null);
    }
  };

  if (authLoading || (loading && authState === "confirmed")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-marine" />
      </div>
    );
  }

  if (authState !== "confirmed") {
    return (
      <div className="min-h-screen px-4 py-8 max-w-md mx-auto">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.back[locale]}
        </Link>

        <div className="text-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-marine/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-marine" />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-2">{t.title[locale]}</h1>
          <p className="text-sm text-ink/50">{t.authDesc[locale]}</p>
        </div>

        <button
          onClick={startAuth}
          className="w-full py-3 bg-marine text-white font-bold rounded-xl hover:bg-marine/90 transition-colors"
        >
          {t.connectBtn[locale]}
        </button>
      </div>
    );
  }

  const toggleRow = (key: PrivacyKey, label: string, description: string) => (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-ink/5 last:border-0">
      <div className="flex-1 min-w-0">
        <label htmlFor={key} className="text-sm font-semibold text-ink dark:text-white cursor-pointer">
          {label}
        </label>
        <p className="text-xs text-ink/50 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 pt-0.5">
        {savingKey === key && <Loader2 className="w-3 h-3 animate-spin text-ink/40" />}
        <Switch
          id={key}
          checked={settings[key]}
          onCheckedChange={(v) => toggleSetting(key, v)}
          disabled={savingKey === key}
          aria-label={label}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen px-4 py-8 max-w-md mx-auto">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        {t.back[locale]}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink mb-1">{t.title[locale]}</h1>
        <p className="text-sm text-ink/50">{t.subtitle[locale]}</p>
        {verifiedAddress && (
          <p className="text-xs text-ink/40 mt-2 font-mono truncate">{verifiedAddress}</p>
        )}
      </div>

      <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-ink/10 shadow-sm p-4 mb-4">
        <h3 className="text-xs font-bold text-ink/40 uppercase tracking-widest mb-2">
          {t.sectionStats[locale]}
        </h3>
        {toggleRow("hidePnl", t.hidePnl[locale], t.hidePnlDesc[locale])}
        {toggleRow("hideTotalBet", t.hideTotalBet[locale], t.hideTotalBetDesc[locale])}
        {toggleRow("hideFragmentsSpent", t.hideFragmentsSpent[locale], t.hideFragmentsSpentDesc[locale])}
      </div>

      <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-ink/10 shadow-sm p-4 mb-4">
        <h3 className="text-xs font-bold text-ink/40 uppercase tracking-widest mb-2">
          {t.sectionHistory[locale]}
        </h3>
        {toggleRow("hideGameHistory", t.hideGameHistory[locale], t.hideGameHistoryDesc[locale])}
      </div>

      <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-ink/10 shadow-sm p-4 mb-4">
        <h3 className="text-xs font-bold text-ink/40 uppercase tracking-widest mb-2">
          {t.sectionVisibility[locale]}
        </h3>
        {toggleRow("hideFromLeaderboard", t.hideFromLeaderboard[locale], t.hideFromLeaderboardDesc[locale])}
        {toggleRow("hideFromSearch", t.hideFromSearch[locale], t.hideFromSearchDesc[locale])}
      </div>

      <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100 text-xs text-amber-700">
        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <p>{t.disclaimer[locale]}</p>
      </div>
    </div>
  );
}
