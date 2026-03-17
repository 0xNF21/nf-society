import { db } from "@/lib/db";
import { lootboxes, lootboxOpens } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NF Society — Lootboxes",
  description: "Ouvre des lootboxes et gagne des CRC instantanément sur Gnosis Chain.",
};

export default async function LootboxesPage() {
  const allLootboxes = await db.select().from(lootboxes).where(eq(lootboxes.status, "active")).orderBy(lootboxes.createdAt);

  return (
    <main className="min-h-screen bg-[#0f172a] flex flex-col">
      <header className="sticky top-0 z-10 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between bg-[#0f172a]/80">
        <Link href="/" className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm font-medium">
          ← Retour
        </Link>
        <h1 className="font-display text-lg font-black text-white">🎁 Lootboxes</h1>
        <div className="w-16" />
      </header>

      <div className="flex-1 flex flex-col items-center px-4 py-10 gap-8 max-w-2xl mx-auto w-full">
        <div className="text-center space-y-2">
          <h2 className="font-display text-3xl font-black text-white">NF Society Lootboxes</h2>
          <p className="text-white/50 text-sm">Envoie des CRC, ouvre ta lootbox, gagne instantanément.</p>
        </div>

        {allLootboxes.length === 0 ? (
          <div className="text-center py-20 text-white/30">
            <p className="text-5xl mb-4">🎁</p>
            <p className="text-lg font-semibold">Aucune lootbox active</p>
            <p className="text-sm mt-2">Reviens bientôt !</p>
          </div>
        ) : (
          <div className="grid gap-4 w-full sm:grid-cols-2">
            {allLootboxes.map((lb) => (
              <Link
                key={lb.id}
                href={`/lootbox/${lb.slug}`}
                className="group relative rounded-2xl border border-white/10 overflow-hidden hover:border-white/30 transition-all duration-300 hover:scale-[1.02]"
                style={{ background: `linear-gradient(135deg, ${lb.primaryColor}44, ${lb.accentColor}22)` }}
              >
                <div className="p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-4">
                    <div
                      className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
                      style={{ backgroundColor: lb.primaryColor + "44", border: `2px solid ${lb.accentColor}44` }}
                    >
                      🎁
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-black text-white">{lb.title}</h3>
                      <p className="text-white/50 text-xs mt-0.5">{lb.description || `Prix : ${lb.pricePerOpenCrc} CRC`}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <div>
                      <p className="text-xs text-white/40">Prix</p>
                      <p className="text-lg font-black" style={{ color: lb.accentColor }}>{lb.pricePerOpenCrc} CRC</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-white/40">Max gain</p>
                      <p className="text-lg font-black text-white">{lb.pricePerOpenCrc * 7} CRC</p>
                    </div>
                    <span
                      className="flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-xl transition-colors"
                      style={{ backgroundColor: lb.accentColor, color: "#0f172a" }}
                    >
                      Ouvrir →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
