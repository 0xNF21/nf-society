import { db } from "@/lib/db";
import { lootboxes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import LootboxPageClient from "@/components/lootbox-page";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [lootbox] = await db.select().from(lootboxes).where(eq(lootboxes.slug, params.slug)).limit(1);
  if (!lootbox) return { title: "Lootbox — NF Society" };
  return {
    title: `${lootbox.title} — NF Society Lootbox`,
    description: lootbox.description || "Ouvre une lootbox en mode Arcade XP et progresse dans NF Society.",
  };
}

export default async function LootboxPage({ params }: Props) {
  const [lootbox] = await db.select().from(lootboxes).where(eq(lootboxes.slug, params.slug)).limit(1);
  if (!lootbox) notFound();

  return <LootboxPageClient lootbox={lootbox} />;
}
