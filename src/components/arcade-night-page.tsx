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

import type { ArcadeNightGameConfig, ArcadeNightPublicState } from "@/lib/arcade-night";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/components/language-provider";

const GAME_LINKS: Record<string, string> = {
  memory: "/memory",
  dames: "/dames",
};

export default function ArcadeNightPage({ state }: { state: ArcadeNightPublicState }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { config } = state;
  const activeGames = config.games.filter((game) => game.enabled);
  const gameNames = activeGames.map((game) => game.label).join(" + ") || (fr ? "Jeux a confirmer" : "Games to confirm");
  const participantValue = config.betaParticipants.length > 0
    ? String(config.betaParticipants.length)
    : "5-10";

  const copy = {
    back: fr ? "Retour" : "Back",
    status: config.publicStatus || (fr ? "Beta fermee bientot" : "Closed beta soon"),
    title: fr ? "Une soiree beta pour jouer ensemble" : "A beta night to play together",
    body: fr
      ? config.note || "Un event court avec quelques membres NF Society pour tester les jeux, le leaderboard et la review avant de lancer des saisons plus grandes."
      : "A short event with a few NF Society members to test games, leaderboards, and review before larger seasons.",
    primary: fr ? "S'entrainer sur Memory" : "Practice Memory",
    secondary: fr ? "S'entrainer sur Dames" : "Practice Dames",
    detailsTitle: fr ? "Format beta #1" : "Beta #1 format",
    rewardsTitle: fr ? "Dotation DAO" : "DAO reward pool",
    rewardsBody: fr
      ? `${formatCrc(config.poolCrc)} CRC de dotation indicative. Les rewards sont distribuees apres review, sans mise CRC et sans pot joueur.`
      : `${formatCrc(config.poolCrc)} CRC indicative pool. Rewards are distributed after review, with no CRC stake and no player-funded pot.`,
    leaderboardTitle: fr ? "Classements separes" : "Separate leaderboards",
    leaderboardBody: fr
      ? "Memory est plus rapide que Dames. Pour eviter un classement global injuste, la beta #1 separe les scores par jeu."
      : "Memory is faster than Dames. To avoid an unfair global ranking, beta #1 separates scores by game.",
    comingSoon: fr ? "Live leaderboard bientot" : "Live leaderboard soon",
    reviewTitle: fr ? "Review avant distribution" : "Review before distribution",
    reviewBody: fr
      ? "Un wallet ne prend qu'une reward competitive par defaut. Si un joueur gagne sur deux jeux, l'autre slot descend au prochain eligible."
      : "One wallet gets one competitive reward by default. If a player wins in both games, the other slot moves to the next eligible player.",
    timelineTitle: fr ? "Deroule de la soiree" : "Night flow",
    closedBeta: fr ? "Beta fermee" : "Closed beta",
    closedBetaBody: fr
      ? config.betaParticipants.length > 0
        ? `${config.betaParticipants.length} membres beta renseignes dans le panel admin.`
        : "On commence avec 5 a 10 membres de la communaute pour trouver les bugs, ajuster les regles et verifier le support mobile."
      : config.betaParticipants.length > 0
        ? `${config.betaParticipants.length} beta members configured in the admin panel.`
        : "We start with 5 to 10 community members to find bugs, tune rules, and verify mobile support.",
    datePending: fr ? "Date a confirmer" : "Date to confirm",
    fragmentsOnly: fr ? "Fragments uniquement" : "Fragments only",
  };

  const timeline = [
    {
      fr: "Annonce beta fermee aux membres NF Society",
      en: "Closed beta announcement to NF Society members",
    },
    {
      fr: `${config.durationMinutes} minutes de jeux ${gameNames}`,
      en: `${config.durationMinutes} minutes of ${gameNames} matches`,
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
                  {config.title}
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
              {activeGames.map((game, index) => (
                <Button
                  key={game.key}
                  asChild
                  variant={index === 0 ? "default" : "outline"}
                  className={`min-h-[48px] rounded-2xl px-5 text-sm font-black ${
                    index === 0 ? "bg-marine hover:bg-marine/90" : ""
                  }`}
                >
                  <Link href={GAME_LINKS[game.key] || "/home"}>
                    {fr ? `S'entrainer sur ${game.label}` : `Practice ${game.label}`}
                  </Link>
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4">
            <InfoCard
              icon={<CalendarClock className="h-5 w-5" />}
              label={copy.detailsTitle}
              value={formatStart(config.startAt, locale, copy.datePending)}
              detail={`${config.durationMinutes} min - ${gameNames}, ${copy.fragmentsOnly}`}
            />
            <InfoCard
              icon={<Users className="h-5 w-5" />}
              label={copy.closedBeta}
              value={participantValue}
              detail={copy.closedBetaBody}
            />
            <InfoCard
              icon={<Gift className="h-5 w-5" />}
              label={copy.rewardsTitle}
              value={`${formatCrc(config.poolCrc)} CRC`}
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
                {activeGames.map((game) => (
                  <LeaderboardPreview key={game.key} title={`${game.label}`} rules={rulesForGame(game, fr)} />
                ))}
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
                {config.rewards.map((reward) => (
                  <div
                    key={reward.key}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-ink/10 bg-ink/[0.025] px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-black">{reward.label}</p>
                      <p className="text-xs font-semibold text-ink/45 dark:text-white/45">
                        {fr ? "Apres review" : "After review"}
                      </p>
                    </div>
                    <span className="rounded-full bg-marine px-3 py-1 text-xs font-black text-white">
                      {formatCrc(reward.amountCrc)} CRC
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

function rulesForGame(game: ArcadeNightGameConfig, fr: boolean): string[] {
  if (fr) {
    return [
      `${game.maxMatches} matchs comptes max`,
      `${game.maxMatchesPerOpponent} matchs max contre le meme wallet`,
      `${game.minMatches} matchs valides minimum`,
      `${game.minOpponents} adversaires minimum`,
    ];
  }

  return [
    `${game.maxMatches} counted matches max`,
    `${game.maxMatchesPerOpponent} matches max against the same wallet`,
    `${game.minMatches} valid matches minimum`,
    `${game.minOpponents} opponents minimum`,
  ];
}

function formatCrc(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function formatStart(value: string | null, locale: "fr" | "en", fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
