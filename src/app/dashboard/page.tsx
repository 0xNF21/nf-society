"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check, Palette, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale, LanguageSwitcher } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

type FormData = {
  title: string;
  organizer: string;
  description: string;
  ticketPriceCrc: string;
  recipientAddress: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  theme: string;
  commissionPercent: string;
};

const defaultForm: FormData = {
  title: "",
  organizer: "",
  description: "",
  ticketPriceCrc: "5",
  recipientAddress: "",
  primaryColor: "#251B9F",
  accentColor: "#FF491B",
  logoUrl: "",
  theme: "light",
  commissionPercent: "5",
};

export default function DashboardPage() {
  const [form, setForm] = useState<FormData>(defaultForm);
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { locale } = useLocale();
  const d = translations.dashboard;

  const handleAuth = async () => {
    if (!password.trim()) return;
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthed(true);
      } else {
        setAuthError(d.incorrectPassword[locale]);
      }
    } catch {
      setAuthError(d.connectionError[locale]);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess(null);

    if (!form.title.trim() || !form.organizer.trim() || !form.recipientAddress.trim()) {
      setError(d.validationError[locale]);
      setSubmitting(false);
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(form.recipientAddress.trim())) {
      setError(d.addressError[locale]);
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/lotteries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          title: form.title.trim(),
          organizer: form.organizer.trim(),
          description: form.description.trim() || null,
          ticketPriceCrc: parseInt(form.ticketPriceCrc) || 5,
          recipientAddress: form.recipientAddress.trim().toLowerCase(),
          primaryColor: form.primaryColor,
          accentColor: form.accentColor,
          logoUrl: form.logoUrl.trim() || null,
          theme: form.theme,
          commissionPercent: parseInt(form.commissionPercent) || 5,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.slug) {
        setSuccess(data.slug);
        setForm(defaultForm);
      }
    } catch {
      setError(d.createError[locale]);
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (!authed) {
    return (
      <main className="px-4 py-10 md:py-16">
        <div className="mx-auto max-w-md">
          <div className="text-center mb-8 relative">
            <div className="absolute right-0 top-0">
              <LanguageSwitcher />
            </div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-6">
              <ArrowLeft className="h-4 w-4" />
              {d.backToHome[locale]}
            </Link>
            <h1 className="font-display text-3xl font-bold text-ink mt-4">{d.title[locale]}</h1>
            <p className="text-ink/50 mt-2">{d.loginSubtitle[locale]}</p>
          </div>
          <Card className="border-2 border-ink/5 shadow-xl">
            <CardContent className="pt-6 space-y-4">
              <input
                type="password"
                placeholder={d.adminPasswordPlaceholder[locale]}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                className="w-full px-4 py-3 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine transition-colors"
              />
              {authError && <p className="text-sm text-red-600">{authError}</p>}
              <Button onClick={handleAuth} disabled={authLoading || !password.trim()} className="w-full h-11">
                {authLoading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {d.verifying[locale]}
                  </span>
                ) : (
                  d.login[locale]
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-10 md:py-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
              <ArrowLeft className="h-4 w-4" />
              {d.backToHome[locale]}
            </Link>
            <h1 className="font-display text-3xl font-bold text-ink">{d.createTitle[locale]}</h1>
            <p className="text-ink/50 mt-1">{d.createSubtitle[locale]}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <div
              className="h-12 w-12 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: form.primaryColor + "20" }}
            >
              <Sparkles className="h-6 w-6" style={{ color: form.primaryColor }} />
            </div>
          </div>
        </div>

        {success && (
          <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-2xl p-5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
              <Check className="h-5 w-5" />
              {d.successTitle[locale]}
            </div>
            <p className="text-sm text-green-600">
              {d.successLink[locale]}{" "}
              <Link href={`/loterie/${success}`} className="underline font-medium hover:text-green-800">
                /loterie/{success}
              </Link>
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <Card className="border-2 border-ink/5 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">{d.generalInfo[locale]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1.5">{d.lotteryTitle[locale]}</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => updateField("title", e.target.value)}
                    placeholder={d.lotteryTitlePlaceholder[locale]}
                    className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1.5">{d.organizer[locale]}</label>
                  <input
                    type="text"
                    value={form.organizer}
                    onChange={(e) => updateField("organizer", e.target.value)}
                    placeholder={d.organizerPlaceholder[locale]}
                    className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1.5">{d.description[locale]}</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    placeholder={d.descriptionPlaceholder[locale]}
                    rows={3}
                    className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine transition-colors resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-ink/5 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">{d.gameSettings[locale]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1.5">{d.ticketPrice[locale]}</label>
                    <input
                      type="number"
                      min="1"
                      value={form.ticketPriceCrc}
                      onChange={(e) => updateField("ticketPriceCrc", e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1.5">{d.daoCommission[locale]}</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={form.commissionPercent}
                      onChange={(e) => updateField("commissionPercent", e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1.5">{d.recipientAddress[locale]}</label>
                  <input
                    type="text"
                    value={form.recipientAddress}
                    onChange={(e) => updateField("recipientAddress", e.target.value)}
                    placeholder="0x..."
                    className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm font-mono focus:outline-none focus:border-marine transition-colors"
                  />
                  <p className="text-xs text-ink/30 mt-1">{d.recipientNote[locale]}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-ink/5 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Palette className="h-5 w-5 text-ink/40" />
                  {d.visualStyle[locale]}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1.5">{d.primaryColor[locale]}</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={form.primaryColor}
                        onChange={(e) => updateField("primaryColor", e.target.value)}
                        className="h-10 w-10 rounded-lg border-2 border-ink/10 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={form.primaryColor}
                        onChange={(e) => updateField("primaryColor", e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-ink/10 rounded-xl text-sm font-mono focus:outline-none focus:border-marine transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1.5">{d.accentColor[locale]}</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={form.accentColor}
                        onChange={(e) => updateField("accentColor", e.target.value)}
                        className="h-10 w-10 rounded-lg border-2 border-ink/10 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={form.accentColor}
                        onChange={(e) => updateField("accentColor", e.target.value)}
                        className="flex-1 px-3 py-2 border-2 border-ink/10 rounded-xl text-sm font-mono focus:outline-none focus:border-marine transition-colors"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1.5">{d.logoUrl[locale]}</label>
                  <input
                    type="text"
                    value={form.logoUrl}
                    onChange={(e) => updateField("logoUrl", e.target.value)}
                    placeholder="https://..."
                    className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1.5">{d.theme[locale]}</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => updateField("theme", "light")}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.theme === "light"
                          ? "border-marine bg-marine/5 text-marine"
                          : "border-ink/10 text-ink/50 hover:border-ink/20"
                      }`}
                    >
                      {d.themeLight[locale]}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField("theme", "dark")}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        form.theme === "dark"
                          ? "border-marine bg-marine/5 text-marine"
                          : "border-ink/10 text-ink/50 hover:border-ink/20"
                      }`}
                    >
                      {d.themeDark[locale]}
                    </button>
                  </div>
                </div>

                <div className="mt-4 p-4 rounded-2xl border-2 border-dashed border-ink/10">
                  <p className="text-xs text-ink/40 mb-3 font-medium">{d.preview[locale]}</p>
                  <div className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: form.primaryColor + "20" }}
                    >
                      <Sparkles className="h-5 w-5" style={{ color: form.primaryColor }} />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{form.title || d.defaultTitle[locale]}</p>
                      <p className="text-xs text-ink/40">{d.by[locale]} {form.organizer || d.defaultOrganizer[locale]}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <div
                      className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                      style={{ backgroundColor: form.primaryColor }}
                    >
                      {form.ticketPriceCrc || "5"} CRC
                    </div>
                    <div
                      className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
                      style={{ backgroundColor: form.accentColor }}
                    >
                      Accent
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-sm text-red-600">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-12 text-lg font-semibold shadow-lg"
              style={{ backgroundColor: form.primaryColor }}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  {d.creating[locale]}
                </span>
              ) : (
                d.createButton[locale]
              )}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
