"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Gamepad2,
  Gift,
  Medal,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/components/language-provider";

const rewards = [
  { key: "memory1", game: "Memory", rank: "#1", amount: "1500 CRC" },
  { key: "memory2", game: "Memory", rank: "#2", amount: "750 CRC" },
  { key: "dames1", game: "Dames", rank: "#1", amount: "1500 CRC" },
  { key: "dames2", game: "Dames", rank: "#2", amount: "750 CRC" },
  { key: "helper", game: "Beta helper", rank: "Review", amount: "500 CRC" },
];

const memoryRules = [
  { fr: "6 matchs comptes max", en: "6 counted matches max" },
  { fr: "3 matchs max contre le meme wallet", en: "3 matches max against the same wallet" },
  { fr: "3 matchs valides minimum", en: "3 valid matches minimum" },
];

const damesRules = [
  { fr: "3 matchs comptes max", en: "3 counted matches max" },
  { fr: "2 matchs max contre le meme wallet", en: "2 matches max against the same wallet" },
  { fr: "2 matchs valides minimum", en: "2 valid matches minimum" },
];

const timeline = [
  {
    fr: "Annonce beta fermee aux membres NF Society",
    en: "Closed beta announcement to NF Society members",
  },
  {
    fr: "90 minutes de jeux Memory + Dames",
    en: "90 minutes of Memory + Dames matches",
  },
  {
    fr: "Review manuelle des winners et comportements suspects",
    en: "Manual review of winners and suspicious patterns",
  },
  {
    fr: "Distribution DAO apres validation",
    en: "DAO distribution after validation",
  },
];

export default function ArcadeNightPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  const copy = {
    back: fr ? "Retour" : "Back",
    status: fr ? "Beta fermee bientot" : "Closed beta soon",
    eyebrow: fr ? "NF Arcade Night #1" : "NF Arcade Night #1",
    title: fr ? "Une soiree beta pour jouer ensemble" : "A beta night to play together",
    body: fr
      ? "Un event court avec quelques membres NF Society pour tester Memory, Dames, le leaderboard et la review avant de lancer des saisons plus grandes."
      : "A short event with a few NF Society members to test Memory, Dames, leaderboards, and review before larger seasons.",
    primary: fr ? "S'entrainer sur Memory" : "Practice Memory",
    secondary: fr ? "S'entrainer sur Dames" : "Practice Dames",
    detailsTitle: fr ? "Format beta #1" : "Beta #1 format",
    rewardsTitle: fr ? "Dotation DAO" : "DAO reward pool",
    rewardsBody: fr
      ? "5000 CRC de dotation indicative. Les rewards sont distribuees apres review, sans mise CRC et sans pot joueur."
      : "5000 CRC indicative pool. Rewards are distributed after review, with no CRC stake and no player-funded pot.",
    leaderboardTitle: fr ? "Deux classements separes" : "Two separate leaderboards",
    leaderboardBody: fr
      ? "Memory est plus rapide que Dames. Pour eviter un classement global injuste, la beta #1 separe les scores par jeu."
      : "Memory is faster than Dames. To avoid an unfair global ranking, beta #1 separates scores by game.",
    memory: fr ? "Classement Memory" : "Memory leaderboard",
    dames: fr ? "Classement Dames" : "Dames leaderboard",
    comingSoon: fr ? "Live leaderboard bientot" : "Live leaderboard soon",
    reviewTitle: fr ? "Review avant distribution" : "Review before distribution",
    reviewBody: fr
      ? "Un wallet ne prend qu'une reward competitive par defaut. Si un joueur gagne sur deux jeux, l'autre slot descend au prochain eligible."
      : "One wallet gets one competitive reward by default. If a player wins in both games, the other slot moves to the next eligible player.",
    timelineTitle: fr ? "Deroule de la soiree" : "Night flow",
    closedBeta: fr ? "Beta fermee" : "Closed beta",
    closedBetaBody: fr
      ? "On commence avec 5 a 10 membres de la communaute pour trouver les bugs, ajuster les regles et verifier le support mobile."
      : "We start with 5 to 10 community members to find bugs, tune rules, and verify mobile support.",
  };

  return (
    <main className="min-h-screen bg-sand/60 px-4 py-8 text-ink dark:bg-ink dark:text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <Link
          href="/home"
          className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-ink/50 transition-colors hover:text-ink dark:text-white/50 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          {copy.back}
        </Link>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <div className="flex min-h-[520px] flex-col justify-between rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-citrus/20 bg-citrus/10 px-3 py-1.5 text-xs font-black uppercase tracking-widest text-citrus">
                <Sparkles className="h-3.5 w-3.5" />
                {copy.status}
              </div>
              <div className="space-y-4">
                <p className="text-sm font-black uppercase tracking-widest text-marine dark:text-blue-300">
                  {copy.eyebrow}
                </p>
                <h1 className="max-w-3xl font-display text-4xl font-black leading-tight text-ink dark:text-white sm:text-6xl">
                  {copy.title}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-ink/65 dark:text-white/65 sm:text-lg">
                  {copy.body}
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="min-h-[48px] rounded-2xl bg-marine px-5 text-sm font-black hover:bg-marine/90">
                <Link href="/memory">{copy.primary}</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-[48px] rounded-2xl px-5 text-sm font-black">
                <Link href="/dames">{copy.secondary}</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4">
            <InfoCard
              icon={<CalendarClock className="h-5 w-5" />}
              label={copy.detailsTitle}
              value="90 min"
              detail={fr ? "Memory + Dames, Fragments uniquement" : "Memory + Dames, Fragments only"}
            />
            <InfoCard
              icon={<Users className="h-5 w-5" />}
              label={copy.closedBeta}
              value="5-10"
              detail={copy.closedBetaBody}
            />
            <InfoCard
              icon={<Gift className="h-5 w-5" />}
              label={copy.rewardsTitle}
              value="5000 CRC"
              detail={copy.rewardsBody}
            />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-3xl border-ink/10 bg-white/85 shadow-sm dark:border-white/10 dark:bg-white/5">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-marine/10 p-3 text-marine dark:bg-blue-300/10 dark:text-blue-300">
                  <Trophy className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black">{copy.leaderboardTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-ink/60 dark:text-white/60">{copy.leaderboardBody}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <LeaderboardPreview title={copy.memory} rules={memoryRules.map((item) => item[locale])} />
                <LeaderboardPreview title={copy.dames} rules={damesRules.map((item) => item[locale])} />
              </div>

              <div className="rounded-2xl border border-dashed border-ink/15 p-4 text-sm font-semibold text-ink/45 dark:border-white/15 dark:text-white/45">
                {copy.comingSoon}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-ink/10 bg-white/85 shadow-sm dark:border-white/10 dark:bg-white/5">
            <CardContent className="space-y-5 p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-citrus/10 p-3 text-citrus">
                  <Medal className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black">{copy.rewardsTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-ink/60 dark:text-white/60">{copy.rewardsBody}</p>
                </div>
              </div>

              <div className="space-y-2">
                {rewards.map((reward) => (
                  <div
                    key={reward.key}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-ink/10 bg-ink/[0.025] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-black">{reward.game}</p>
                      <p className="text-xs font-semibold text-ink/45 dark:text-white/45">{reward.rank}</p>
                    </div>
                    <span className="rounded-full bg-marine px-3 py-1 text-xs font-black text-white">
                      {reward.amount}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="rounded-3xl border-ink/10 bg-white/85 shadow-sm dark:border-white/10 dark:bg-white/5">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-300">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-black">{copy.reviewTitle}</h2>
                  <p className="mt-1 text-sm leading-6 text-ink/60 dark:text-white/60">{copy.reviewBody}</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm font-semibold text-ink/60 dark:text-white/60">
                {(fr
                  ? ["Session wallet obligatoire", "Deux wallets differents", "Parties hors fenetre ignorees", "Montant de Fragments ignore dans le score"]
                  : ["Wallet session required", "Two different wallets", "Out-of-window matches ignored", "Fragments amount ignored in scoring"]
                ).map((item) => (
                  <li key={item} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-ink/10 bg-white/85 shadow-sm dark:border-white/10 dark:bg-white/5">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-ink/5 p-3 text-ink dark:bg-white/10 dark:text-white">
                  <Gamepad2 className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-black">{copy.timelineTitle}</h2>
              </div>
              <div className="grid gap-3">
                {timeline.map((item, index) => (
                  <div key={item.en} className="flex gap-3 rounded-2xl bg-ink/[0.025] p-3 dark:bg-white/[0.03]">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-marine shadow-sm dark:bg-white/10 dark:text-blue-300">
                      {index + 1}
                    </div>
                    <p className="text-sm font-semibold leading-6 text-ink/65 dark:text-white/65">
                      {item[locale]}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function InfoCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="min-h-[150px] rounded-3xl border-ink/10 bg-white/85 shadow-sm dark:border-white/10 dark:bg-white/5">
      <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-2xl bg-ink/5 p-3 text-ink/70 dark:bg-white/10 dark:text-white/70">
            {icon}
          </span>
          <span className="text-xs font-black uppercase tracking-widest text-ink/35 dark:text-white/35">
            {label}
          </span>
        </div>
        <div>
          <p className="text-3xl font-black text-ink dark:text-white">{value}</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-ink/55 dark:text-white/55">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LeaderboardPreview({ title, rules }: { title: string; rules: string[] }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <h3 className="text-sm font-black">{title}</h3>
      <ul className="mt-3 space-y-2">
        {rules.map((rule) => (
          <li key={rule} className="flex gap-2 text-xs font-semibold leading-5 text-ink/55 dark:text-white/55">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marine dark:text-blue-300" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
