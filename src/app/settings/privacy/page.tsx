"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Loader2, Copy, QrCode, CheckCircle2, Wallet } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { useMiniApp } from "@/components/miniapp-provider";
import { Switch } from "@/components/ui/switch";

type PrivacyKey =
  | "hidePnl"
  | "hideTotalBet"
  | "hideXpSpent"
  | "hideGameHistory"
  | "hideFromLeaderboard"
  | "hideFromSearch";

type Settings = Record<PrivacyKey, boolean>;

const DEFAULT_SETTINGS: Settings = {
  hidePnl: false,
  hideTotalBet: false,
  hideXpSpent: false,
  hideGameHistory: false,
  hideFromLeaderboard: false,
  hideFromSearch: false,
};

type AuthState = "idle" | "loading" | "waiting" | "confirmed" | "expired";

const SESSION_KEY = "nf-privacy-session";

export default function PrivacyPage() {
  const { locale } = useLocale();
  const t = translations.privacy;
  const tm = translations.miniapp;
  const { isMiniApp, walletAddress, sendPayment } = useMiniApp();

  const [authState, setAuthState] = useState<AuthState>("idle");
  const [authToken, setAuthToken] = useState("");
  const [authError, setAuthError] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verifiedAddress, setVerifiedAddress] = useState("");
  const [miniAppPaying, setMiniAppPaying] = useState(false);
  const [miniAppError, setMiniAppError] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<PrivacyKey | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Restore session from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) {
        setLoading(false);
        return;
      }
      const parsed = JSON.parse(raw);
      const age = Date.now() - (parsed.timestamp ?? 0);
      if (age > 60 * 60 * 1000 || !parsed.token) {
        localStorage.removeItem(SESSION_KEY);
        setLoading(false);
        return;
      }
      setAuthToken(parsed.token);
      setVerifiedAddress(parsed.address || "");
      setAuthState("confirmed");
    } catch {
      setLoading(false);
    }
  }, []);

  // Fetch settings once authenticated
  const fetchSettings = useCallback(async (token: string) => {
    try {
      const res = await fetch(`/api/privacy?token=${token}`);
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem(SESSION_KEY);
          setAuthState("idle");
          setAuthToken("");
          setVerifiedAddress("");
        }
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.settings) setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authState === "confirmed" && authToken) {
      fetchSettings(authToken);
    }
  }, [authState, authToken, fetchSettings]);

  // Cleanup polling
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startAuth = async () => {
    setAuthState("loading");
    setAuthError("");
    try {
      const res = await fetch("/api/shop/auth", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.paymentLink) {
        setAuthError(data.error || t.authError[locale]);
        setAuthState("idle");
        return;
      }
      setAuthToken(data.token);
      setPaymentLink(data.paymentLink);
      setQrCode(data.qrCode || "");
      setAuthState("waiting");

      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/shop/auth?token=${data.token}`);
          const pollData = await pollRes.json();
          if (pollData.status === "confirmed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setVerifiedAddress(pollData.address);
            setAuthState("confirmed");
            localStorage.setItem(
              SESSION_KEY,
              JSON.stringify({ token: data.token, address: pollData.address, timestamp: Date.now() }),
            );
          } else if (pollData.status === "expired") {
            if (pollRef.current) clearInterval(pollRef.current);
            setAuthState("expired");
          }
        } catch {}
      }, 3000);
    } catch {
      setAuthState("idle");
    }
  };

  const handleMiniAppPay = async () => {
    if (!paymentLink) return;
    setMiniAppPaying(true);
    setMiniAppError(null);
    try {
      const match = paymentLink.match(/transfer\/(0x[a-fA-F0-9]+)\//);
      const recipient = match?.[1] || "";
      await sendPayment(recipient, 1, `shop_auth:${authToken}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === "string" ? err : tm.rejected[locale];
      setMiniAppError(msg);
    } finally {
      setMiniAppPaying(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleSetting = async (key: PrivacyKey, value: boolean) => {
    const prev = settings[key];
    setSettings((s) => ({ ...s, [key]: value }));
    setSavingKey(key);
    try {
      const res = await fetch("/api/privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: authToken, settings: { [key]: value } }),
      });
      if (!res.ok) {
        setSettings((s) => ({ ...s, [key]: prev }));
      }
    } catch {
      setSettings((s) => ({ ...s, [key]: prev }));
    } finally {
      setSavingKey(null);
    }
  };

  if (loading && authState === "confirmed") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-marine" />
      </div>
    );
  }

  // ─── Auth screen ───
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

        {authState === "idle" && (
          <div className="space-y-4">
            {authError && (
              <p className="text-sm text-red-500 text-center bg-red-50 rounded-xl py-2 px-3">{authError}</p>
            )}
            <button
              onClick={startAuth}
              className="w-full py-3 bg-marine text-white font-bold rounded-xl hover:bg-marine/90 transition-colors"
            >
              {t.connectBtn[locale]}
            </button>
          </div>
        )}

        {authState === "loading" && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-marine" />
          </div>
        )}

        {authState === "waiting" && (
          <div className="space-y-4">
            {isMiniApp && walletAddress ? (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-ink/[0.03] border border-ink/5">
                  <Wallet className="w-4 h-4 text-ink/40" />
                  <span className="text-xs text-ink/60 font-mono truncate">{walletAddress}</span>
                </div>
                <button
                  onClick={handleMiniAppPay}
                  disabled={miniAppPaying}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-marine text-white font-bold rounded-xl hover:bg-marine/90 transition-colors disabled:opacity-50"
                >
                  {miniAppPaying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {tm.paying[locale]}
                    </>
                  ) : (
                    t.payBtn[locale]
                  )}
                </button>
                {miniAppError && (
                  <p className="text-xs text-red-500 text-center">{miniAppError}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-ink/60 text-center">{t.waitingDesc[locale]}</p>
                <div className="flex gap-2">
                  <button
                    onClick={copyLink}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-ink/5 text-ink font-semibold rounded-xl hover:bg-ink/10 transition-colors"
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? t.copied[locale] : t.copyLink[locale]}
                  </button>
                  <button
                    onClick={() => setShowQr((v) => !v)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-ink/5 text-ink font-semibold rounded-xl hover:bg-ink/10 transition-colors"
                  >
                    <QrCode className="w-4 h-4" />
                    QR
                  </button>
                </div>
                {showQr && qrCode && (
                  <div className="flex justify-center">
                    <img src={qrCode} alt="QR" className="w-56 h-56 rounded-xl" />
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 text-sm text-ink/50">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t.waitingPayment[locale]}
                </div>
              </>
            )}
          </div>
        )}

        {authState === "expired" && (
          <div className="space-y-4 text-center">
            <p className="text-sm text-red-500">{t.expired[locale]}</p>
            <button
              onClick={() => setAuthState("idle")}
              className="px-4 py-2 bg-marine text-white font-semibold rounded-xl hover:bg-marine/90 transition-colors"
            >
              {t.retry[locale]}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Settings screen ───
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
        {toggleRow("hideXpSpent", t.hideXpSpent[locale], t.hideXpSpentDesc[locale])}
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
