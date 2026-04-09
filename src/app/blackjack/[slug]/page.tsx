import { db } from "@/lib/db";
import { blackjackTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BlackjackPageClient from "@/components/blackjack-page";

type Props = { params: { slug: string } };

const DEMO_TABLE = {
  id: 0,
  slug: "DEMO-classic",
  title: "Blackjack Classic",
  description: "Blackjack classique 6 decks. Dealer stand on 17. Blackjack paie 3:2.",
  betOptions: [1, 5, 10, 25],
  recipientAddress: "",
  primaryColor: "#1a5c2e",
  accentColor: "#1a7a3a",
  status: "active",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.slug.startsWith("DEMO")) {
    return { title: "Blackjack Demo — NF Society" };
  }
  const [table] = await db.select().from(blackjackTables).where(eq(blackjackTables.slug, params.slug)).limit(1);
  if (!table) return { title: "Blackjack — NF Society" };
  return {
    title: `${table.title} — NF Society Blackjack`,
    description: table.description || "Blackjack classique avec CRC",
  };
}

export default async function BlackjackPage({ params }: Props) {
  // Demo mode: use fake table data
  if (params.slug.startsWith("DEMO")) {
    return <BlackjackPageClient table={DEMO_TABLE} />;
  }

  const [table] = await db.select().from(blackjackTables).where(eq(blackjackTables.slug, params.slug)).limit(1);
  if (!table) notFound();

  return <BlackjackPageClient table={{ ...table, betOptions: (table.betOptions as number[]) || [1, 5, 10, 25] }} />;
}
