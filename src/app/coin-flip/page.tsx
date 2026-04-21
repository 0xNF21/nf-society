import { db } from "@/lib/db";
import { coinFlipTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pile ou Face — NF Society",
  description: "Pile ou face avec CRC sur NF Society. RTP 98%.",
};

export default async function CoinFlipLobbyPage() {
  const tables = await db
    .select()
    .from(coinFlipTables)
    .where(eq(coinFlipTables.status, "active"));

  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      <BackLink
        fallback="/chance"
        className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-6"
      >
        &larr; Accueil
      </BackLink>

      <div className="text-center mb-8">
        <div className="text-5xl mb-3">🪙</div>
        <h1 className="text-3xl font-bold text-ink mb-2">Pile ou Face</h1>
        <p className="text-sm text-ink/50 max-w-md mx-auto">
          Choisissez pile ou face, misez vos CRC. RTP 98%.
        </p>
      </div>

      {tables.length === 0 ? (
        <div className="text-center py-12 text-ink/40">
          Aucune table disponible pour le moment.
        </div>
      ) : (
        <div className="grid gap-4">
          {tables.map((table) => {
            const bets = (table.betOptions as number[]) || [1, 5, 10, 25];
            return (
              <Link
                key={table.slug}
                href={`/coin-flip/${table.slug}`}
                className="block rounded-2xl border-2 border-ink/5 bg-white/80 dark:bg-white/5 backdrop-blur-sm p-6 hover:shadow-lg transition-all hover:scale-[1.01]"
              >
                <div className="flex items-center gap-4">
                  <div
                    className="h-14 w-14 rounded-xl flex items-center justify-center text-2xl"
                    style={{ backgroundColor: table.accentColor + "15" }}
                  >
                    🪙
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-ink">{table.title}</h2>
                    {table.description && (
                      <p className="text-sm text-ink/50 mt-0.5">{table.description}</p>
                    )}
                    <div className="flex gap-2 mt-2">
                      {bets.map((b) => (
                        <span
                          key={b}
                          className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: table.accentColor + "15", color: table.accentColor }}
                        >
                          {b} CRC
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-ink/30 text-xl">&rarr;</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
