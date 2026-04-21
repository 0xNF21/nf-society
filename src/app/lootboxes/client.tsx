"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Gift, Sparkles } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { translations } from "@/lib/i18n";
import { darkSafeColor } from "@/lib/utils";

interface LootboxData {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  pricePerOpenCrc: number;
  accentColor: string;
  status: string;
  createdAt: Date | null;
}

export default function LootboxesClient({ lootboxes }: { lootboxes: LootboxData[] }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const t = translations.lootboxes;

  return (
    <main className="px-4 py-10 md:py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="space-y-4 text-center relative">
          <div className="absolute left-0 top-0">
            <BackLink fallback="/chance" className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              {t.back[locale]}
            </BackLink>
          </div>
          <div className="flex items-center justify-center gap-4">
            <img src="/nf-society-logo.png" alt="NF Society" className="h-20 w-20 rounded-2xl object-cover" />
            <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">
              NF Society
            </h1>
          </div>
          <p className="max-w-2xl mx-auto text-lg text-ink/70">
            {t.subtitle[locale]}{" "}
            <span className="inline-flex items-center gap-1.5 align-middle">
              <img src="/gnosis-logo.png" alt="Gnosis" className="h-5 w-5 inline" />
              Gnosis
            </span>
          </p>
        </header>

        {lootboxes.length === 0 ? (
          <div className="text-center py-16">
            <Gift className="h-12 w-12 text-ink/20 mx-auto mb-4" />
            <p className="text-lg text-ink/50">{t.noActive[locale]}</p>
            <p className="text-sm text-ink/30 mt-2">{t.comeBack[locale]}</p>
          </div>
        ) : (
          <section>
            <h2 className="font-display text-xl font-bold text-ink mb-5 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              {t.available[locale]}
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {lootboxes.map((lb) => (
                <Link
                  key={lb.id}
                  href={`/lootbox/${lb.slug}`}
                  className="group rounded-3xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-6 shadow-sm hover:shadow-xl hover:border-ink/10 transition-all duration-300 flex flex-col"
                >
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className="h-12 w-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                      style={{ backgroundColor: lb.accentColor + "15" }}
                    >
                      🎁
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold text-ink group-hover:text-ink/80 transition-colors">
                        {lb.title}
                      </h3>
                      <p className="text-xs text-ink/40 mt-0.5 line-clamp-2">
                        {translations.lootbox.autoDesc[locale].replace("{price}", String(lb.pricePerOpenCrc)).replace("{max}", String(lb.pricePerOpenCrc * 7))}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-ink/5">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs text-ink/40">{t.price[locale]}</p>
                        <p className="text-lg font-bold" style={{ color: darkSafeColor(lb.accentColor, isDark) }}>{lb.pricePerOpenCrc} CRC</p>
                      </div>
                      <div>
                        <p className="text-xs text-ink/40">{t.maxGain[locale]}</p>
                        <p className="text-lg font-bold text-ink">{lb.pricePerOpenCrc * 7} CRC</p>
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all"
                      style={{ color: darkSafeColor(lb.accentColor, isDark) }}
                    >
                      {t.open[locale]}
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <footer className="mt-8 pt-8 border-t border-ink/5 flex flex-col items-center gap-4">
          <div className="flex items-center justify-center gap-3 mb-1">
            <img src="/gnosis-logo.png" alt="Gnosis" className="h-5 w-5 opacity-70" />
            <Image src="/logo-color.png" alt="Circles" width={80} height={24} className="h-5 w-auto opacity-70" />
          </div>
          <p className="text-xs text-ink/70">
            {t.footer[locale]}
          </p>
          <p className="text-xs text-ink/50">
            NF Society — {locale === "fr" ? "Lootboxes décentralisées" : "Decentralized Lootboxes"}
          </p>
        </footer>
      </div>
    </main>
  );
}
