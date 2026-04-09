import { db } from "@/lib/db";
import { blackjackTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BlackjackPageClient from "@/components/blackjack-page";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [table] = await db.select().from(blackjackTables).where(eq(blackjackTables.slug, params.slug)).limit(1);
  if (!table) return { title: "Blackjack — NF Society" };
  return {
    title: `${table.title} — NF Society Blackjack`,
    description: table.description || "Blackjack classique avec CRC",
  };
}

export default async function BlackjackPage({ params }: Props) {
  const [table] = await db.select().from(blackjackTables).where(eq(blackjackTables.slug, params.slug)).limit(1);
  if (!table) notFound();

  return <BlackjackPageClient table={{ ...table, betOptions: (table.betOptions as number[]) || [1, 5, 10, 25] }} />;
}
