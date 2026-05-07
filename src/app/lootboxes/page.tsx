import { db } from "@/lib/db";
import { lootboxes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import LootboxesClient from "./client";

export const metadata: Metadata = {
  title: "NF Society — Lootboxes",
  description: "Ouvre des lootboxes en mode Arcade XP sur NF Society.",
};

export const dynamic = "force-dynamic";

export default async function LootboxesPage() {
  const allLootboxes = await db.select().from(lootboxes).where(eq(lootboxes.status, "active")).orderBy(lootboxes.createdAt);

  return <LootboxesClient lootboxes={allLootboxes} />;
}
