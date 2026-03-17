"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check, Palette, RefreshCw, Sparkles, Wallet, AlertCircle, CheckCircle, XCircle, Send, ChevronDown, ExternalLink, Loader2, Gift, Trash2 } from "lucide-react";
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

type LbFormData = {
  title: string;
  slug: string;
  description: string;
  pricePerOpenCrc: string;
  recipientAddress: string;
  accentColor: string;
};

const defaultLbForm: LbFormData = {
  title: "",
  slug: "",
  description: "",
  pricePerOpenCrc: "10",
  recipientAddress: "",
  accentColor: "#F59E0B",
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

  const [lbForm, setLbForm] = useState<LbFormData>(defaultLbForm);
  const [lbSubmitting, setLbSubmitting] = useState(false);
  const [lbSuccess, setLbSuccess] = useState<string | null>(null);
  const [lbError, setLbError] = useState("");
  const [lbList, setLbList] = useState<any[]>([]);
  const [lbListLoading, setLbListLoading] = useState(false);
  const [lbDeleting, setLbDeleting] = useState<number | null>(null);
  const [lbConfirmDelete, setLbConfirmDelete] = useState<number | null>(null);

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

  const updateLbField = (field: keyof LbFormData, value: string) => {
    setLbForm((prev) => ({ ...prev, [field]: value }));
  };

  const fetchLbList = async () => {
    setLbListLoading(true);
    try {
      const res = await fetch("/api/lootboxes", { cache: "no-store" });
      if (res.ok) setLbList(await res.json());
    } catch {}
    setLbListLoading(false);
  };

  const handleLbDelete = async (id: number) => {
    setLbDeleting(id);
    try {
      await fetch(`/api/lootboxes/${id}`, {
        method: "DELETE",
        headers: { "x-admin-password": password },
      });
      setLbConfirmDelete(null);
      await fetchLbList();
    } catch {}
    setLbDeleting(null);
  };

  const handleLbSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLbSubmitting(true);
    setLbError("");
    setLbSuccess(null);

    if (!lbForm.title.trim() || !lbForm.slug.trim() || !lbForm.recipientAddress.trim()) {
      setLbError("Titre, slug et adresse de réception sont requis.");
      setLbSubmitting(false);
      return;
    }

    if (!/^[a-z0-9-]+$/.test(lbForm.slug.trim())) {
      setLbError("Le slug doit contenir uniquement des lettres minuscules, chiffres et tirets.");
      setLbSubmitting(false);
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(lbForm.recipientAddress.trim())) {
      setLbError("Adresse Ethereum invalide.");
      setLbSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/lootboxes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify({
          slug: lbForm.slug.trim(),
          title: lbForm.title.trim(),
          description: lbForm.description.trim() || null,
          pricePerOpenCrc: parseInt(lbForm.pricePerOpenCrc) || 10,
          recipientAddress: lbForm.recipientAddress.trim().toLowerCase(),
          accentColor: lbForm.accentColor,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setLbError(data.error);
      } else if (data.slug) {
        setLbSuccess(data.slug);
        setLbForm(defaultLbForm);
        fetchLbList();
      }
    } catch {
      setLbError("Erreur lors de la création.");
    } finally {
      setLbSubmitting(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (authed) fetchLbList(); }, [authed]);

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

        <div className="mt-12 border-t border-ink/10 pt-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-2xl bg-amber-100 flex items-center justify-center">
              <Gift className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-ink">Créer une lootbox</h2>
              <p className="text-sm text-ink/50">Lootbox avec payout automatique (RTP ~98%)</p>
            </div>
          </div>

          {lbSuccess && (
            <div className="mb-6 bg-green-50 border-2 border-green-200 rounded-2xl p-5 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
                <Check className="h-5 w-5" />
                Lootbox créée avec succès !
              </div>
              <p className="text-sm text-green-600">
                Disponible sur{" "}
                <Link href={`/lootbox/${lbSuccess}`} className="underline font-medium hover:text-green-800">
                  /lootbox/{lbSuccess}
                </Link>
              </p>
            </div>
          )}

          <form onSubmit={handleLbSubmit}>
            <div className="space-y-4">
              <Card className="border-2 border-ink/5 shadow-lg">
                <CardContent className="pt-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink/70 mb-1.5">Titre</label>
                      <input
                        type="text"
                        value={lbForm.title}
                        onChange={(e) => updateLbField("title", e.target.value)}
                        placeholder="Lootbox Bronze"
                        className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink/70 mb-1.5">Slug (URL)</label>
                      <input
                        type="text"
                        value={lbForm.slug}
                        onChange={(e) => updateLbField("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                        placeholder="lootbox-bronze"
                        className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition-colors font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1.5">Description (optionnel)</label>
                    <input
                      type="text"
                      value={lbForm.description}
                      onChange={(e) => updateLbField("description", e.target.value)}
                      placeholder="Ouvre pour 10 CRC, gagne jusqu&apos;à 70 CRC instantanément !"
                      className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-ink/70 mb-1.5">Prix d&apos;ouverture (CRC)</label>
                      <input
                        type="number"
                        min="1"
                        value={lbForm.pricePerOpenCrc}
                        onChange={(e) => updateLbField("pricePerOpenCrc", e.target.value)}
                        className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-ink/70 mb-1.5">Couleur accent</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={lbForm.accentColor}
                          onChange={(e) => updateLbField("accentColor", e.target.value)}
                          className="h-10 w-12 rounded-lg border-2 border-ink/10 cursor-pointer"
                        />
                        <span className="text-sm font-mono text-ink/50">{lbForm.accentColor}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1.5">Adresse de réception (Safe)</label>
                    <input
                      type="text"
                      value={lbForm.recipientAddress}
                      onChange={(e) => updateLbField("recipientAddress", e.target.value)}
                      placeholder="0x..."
                      className="w-full px-4 py-2.5 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-amber-400 transition-colors font-mono"
                    />
                    <p className="text-xs text-ink/40 mt-1">Safe NF Society : 0x960A0784640fD6581D221A56df1c60b65b5ebB6f</p>
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800">
                    <strong>Table de récompenses (RTP ~98%) :</strong>{" "}
                    60% → {Math.round((parseInt(lbForm.pricePerOpenCrc) || 10) * 0.7)} CRC &nbsp;|&nbsp;
                    25% → {Math.round((parseInt(lbForm.pricePerOpenCrc) || 10) * 0.9)} CRC &nbsp;|&nbsp;
                    10% → {Math.round((parseInt(lbForm.pricePerOpenCrc) || 10) * 1.4)} CRC &nbsp;|&nbsp;
                    4% → {Math.round((parseInt(lbForm.pricePerOpenCrc) || 10) * 3.0)} CRC &nbsp;|&nbsp;
                    1% → {Math.round((parseInt(lbForm.pricePerOpenCrc) || 10) * 7.0)} CRC 🎉
                  </div>
                </CardContent>
              </Card>

              {lbError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 text-sm text-red-600">
                  {lbError}
                </div>
              )}

              <Button
                type="submit"
                disabled={lbSubmitting}
                className="w-full h-12 text-lg font-semibold shadow-lg"
                style={{ backgroundColor: lbForm.accentColor }}
              >
                {lbSubmitting ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    Création en cours...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Gift className="h-5 w-5" />
                    Créer la lootbox
                  </span>
                )}
              </Button>
            </div>
          </form>

          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-ink">Lootboxes existantes</h3>
              <button onClick={fetchLbList} className="text-xs text-ink/40 hover:text-ink/60 transition-colors flex items-center gap-1">
                <RefreshCw className={`h-3 w-3 ${lbListLoading ? "animate-spin" : ""}`} />
                Actualiser
              </button>
            </div>
            {lbList.length === 0 ? (
              <p className="text-sm text-ink/40 text-center py-6">Aucune lootbox</p>
            ) : (
              <div className="space-y-2">
                {lbList.map((lb: any) => (
                  <div key={lb.id} className="flex items-center justify-between bg-white/80 border border-ink/5 rounded-xl p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 text-lg" style={{ backgroundColor: (lb.accentColor || "#F59E0B") + "15" }}>
                        🎁
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-ink truncate">{lb.title}</p>
                        <p className="text-xs text-ink/40 font-mono">/lootbox/{lb.slug} — {lb.pricePerOpenCrc} CRC</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${lb.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {lb.status}
                      </span>
                      {lbConfirmDelete === lb.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleLbDelete(lb.id)}
                            disabled={lbDeleting === lb.id}
                            className="px-2 py-1 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                          >
                            {lbDeleting === lb.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Oui"}
                          </button>
                          <button
                            onClick={() => setLbConfirmDelete(null)}
                            className="px-2 py-1 rounded-lg text-xs font-semibold bg-ink/5 text-ink/50 hover:bg-ink/10 transition-colors"
                          >
                            Non
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setLbConfirmDelete(lb.id)}
                          className="p-1.5 rounded-lg text-ink/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-12 border-t border-ink/10 pt-8">
          <PayoutManager password={password} locale={locale} />
        </div>
      </div>
    </main>
  );
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  wrapping: "bg-blue-100 text-blue-800",
  sending: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <AlertCircle className="h-3 w-3" />,
  wrapping: <Loader2 className="h-3 w-3 animate-spin" />,
  sending: <Loader2 className="h-3 w-3 animate-spin" />,
  success: <CheckCircle className="h-3 w-3" />,
  failed: <XCircle className="h-3 w-3" />,
};

function PayoutManager({ password, locale }: { password: string; locale: "fr" | "en" }) {
  const p = translations.payout;
  const [payoutStatus, setPayoutStatus] = useState<any>(null);
  const [payoutList, setPayoutList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ gameType: "reward", recipientAddress: "", amountCrc: "", reason: "" });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualResult, setManualResult] = useState<any>(null);

  async function fetchPayoutData() {
    setLoading(true);
    try {
      const [statusRes, listRes] = await Promise.all([
        fetch("/api/payout/status", { cache: "no-store" }),
        fetch(`/api/payout?limit=20&password=${encodeURIComponent(password)}`, { cache: "no-store" }),
      ]);
      if (statusRes.ok) setPayoutStatus(await statusRes.json());
      if (listRes.ok) {
        const data = await listRes.json();
        setPayoutList(data.payouts || []);
      }
    } catch {}
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPayoutData(); }, []);

  async function handleRetry(payoutId: number) {
    setRetrying(payoutId);
    try {
      await fetch("/api/payout/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId, password }),
      });
      await fetchPayoutData();
    } catch {}
    setRetrying(null);
  }

  async function handleManualPayout(e: React.FormEvent) {
    e.preventDefault();
    setManualSubmitting(true);
    setManualResult(null);
    try {
      const res = await fetch("/api/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          gameType: manualForm.gameType,
          gameId: `manual-${Date.now()}`,
          recipientAddress: manualForm.recipientAddress.trim().toLowerCase(),
          amountCrc: parseInt(manualForm.amountCrc) || 0,
          reason: manualForm.reason || undefined,
        }),
      });
      const data = await res.json();
      setManualResult(data);
      if (data.success) {
        setManualForm({ gameType: "reward", recipientAddress: "", amountCrc: "", reason: "" });
        await fetchPayoutData();
      }
    } catch (err: any) {
      setManualResult({ success: false, error: err.message });
    }
    setManualSubmitting(false);
  }

  const shortAddr = (addr: string) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "—";
  const gnosisScanTx = (hash: string) => `https://gnosisscan.io/tx/${hash}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-ink flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          {p.title[locale]}
        </h2>
        <button onClick={fetchPayoutData} className="text-ink/40 hover:text-ink/60 transition-colors">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {payoutStatus && !payoutStatus.configured && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="font-semibold text-amber-800">{p.notConfigured[locale]}</p>
                <p className="text-sm text-amber-700">{p.missingVars[locale]}: {payoutStatus.missingVars?.join(", ")}</p>
                <button onClick={() => setShowSetup(!showSetup)} className="text-sm text-amber-800 underline flex items-center gap-1">
                  {p.setupGuide[locale]}
                  <ChevronDown className={`h-3 w-3 transition-transform ${showSetup ? "rotate-180" : ""}`} />
                </button>
                {showSetup && (
                  <div className="text-xs text-amber-700 space-y-1 mt-2 bg-amber-100 rounded-lg p-3">
                    <p>{p.setupStep1[locale]}</p>
                    <p>{p.setupStep2[locale]}</p>
                    <p>{p.setupStep3[locale]}</p>
                    <p>{p.setupStep4[locale]}</p>
                    <p>{p.setupStep5[locale]}</p>
                    <p>{p.setupStep6[locale]}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {payoutStatus?.configured && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-ink/40 text-xs">{p.status[locale]}</p>
                <p className="font-semibold text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> {p.configured[locale]}
                </p>
              </div>
              <div>
                <p className="text-ink/40 text-xs">{p.botGas[locale]}</p>
                <p className="font-semibold">{Number(payoutStatus.botXdaiBalance || 0).toFixed(4)}</p>
              </div>
              <div>
                <p className="text-ink/40 text-xs">{p.botWallet[locale]}</p>
                <p className="font-mono text-xs">{shortAddr(payoutStatus.botAddress || "")}</p>
              </div>
              <div>
                <p className="text-ink/40 text-xs">{p.safeBalance[locale]} (ERC-20)</p>
                <p className="font-semibold">{Number(payoutStatus.safeBalance?.erc20 || 0).toFixed(2)} CRC</p>
              </div>
              <div>
                <p className="text-ink/40 text-xs">{p.safeAddress[locale]}</p>
                <p className="font-mono text-xs">{shortAddr(payoutStatus.safeAddress || "")}</p>
              </div>
              <div>
                <p className="text-ink/40 text-xs">{p.safeBalance[locale]} (ERC-1155)</p>
                <p className="font-semibold">{Number(payoutStatus.safeBalance?.erc1155 || 0).toFixed(2)} CRC</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {payoutStatus?.configured && (
        <Card>
          <CardContent className="p-4">
            <button onClick={() => setManualOpen(!manualOpen)} className="w-full flex items-center justify-between text-sm font-semibold text-ink">
              <span className="flex items-center gap-2"><Send className="h-4 w-4" /> {p.manualPayout[locale]}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${manualOpen ? "rotate-180" : ""}`} />
            </button>
            {manualOpen && (
              <form onSubmit={handleManualPayout} className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-ink/40">{p.gameType[locale]}</label>
                    <select value={manualForm.gameType} onChange={(e) => setManualForm(f => ({ ...f, gameType: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="lottery">Lottery</option>
                      <option value="lootbox">Lootbox</option>
                      <option value="game">Game</option>
                      <option value="reward">Reward</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-ink/40">{p.amount[locale]} (CRC)</label>
                    <input type="number" min="1" value={manualForm.amountCrc} onChange={(e) => setManualForm(f => ({ ...f, amountCrc: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" required />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-ink/40">{p.recipient[locale]}</label>
                  <input type="text" placeholder="0x..." value={manualForm.recipientAddress} onChange={(e) => setManualForm(f => ({ ...f, recipientAddress: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" required />
                </div>
                <div>
                  <label className="text-xs text-ink/40">{p.reason[locale]}</label>
                  <input type="text" value={manualForm.reason} onChange={(e) => setManualForm(f => ({ ...f, reason: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                {manualResult && (
                  <div className={`text-sm p-2 rounded-lg ${manualResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {manualResult.success ? `${p.success[locale]} — Tx: ${manualResult.transferTxHash?.slice(0, 12)}...` : manualResult.error}
                  </div>
                )}
                <Button type="submit" disabled={manualSubmitting} className="w-full" size="sm">
                  {manualSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : p.triggerPayout[locale]}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{p.payouts[locale]}</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {payoutList.length === 0 ? (
            <p className="text-sm text-ink/40 text-center py-4">{p.noPayout[locale]}</p>
          ) : (
            <div className="space-y-2">
              {payoutList.map((po: any) => (
                <div key={po.id} className="bg-ink/5 rounded-lg p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[po.status] || "bg-gray-100 text-gray-600"}`}>
                        {statusIcons[po.status]}
                        {(p as any)[po.status]?.[locale] || po.status}
                      </span>
                      <span className="text-xs text-ink/40">{po.gameType}</span>
                    </div>
                    <span className="font-semibold">{po.amountCrc} CRC</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-ink/40">
                    <span className="font-mono">{shortAddr(po.recipientAddress)}</span>
                    <span>{new Date(po.createdAt).toLocaleDateString()}</span>
                  </div>
                  {po.reason && <p className="text-xs text-ink/50">{po.reason}</p>}
                  <div className="flex items-center gap-2 text-xs">
                    {po.wrapTxHash && (
                      <a href={gnosisScanTx(po.wrapTxHash)} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5">
                        {p.wrapTx[locale]} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {po.transferTxHash && (
                      <a href={gnosisScanTx(po.transferTxHash)} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5">
                        {p.transferTx[locale]} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {po.status === "failed" && po.attempts < 3 && (
                      <button onClick={() => handleRetry(po.id)} disabled={retrying === po.id} className="text-amber-600 hover:underline flex items-center gap-0.5">
                        {retrying === po.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        {p.retry[locale]}
                      </button>
                    )}
                  </div>
                  {po.errorMessage && <p className="text-xs text-red-500">{po.errorMessage}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
