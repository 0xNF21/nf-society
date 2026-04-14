import { db } from "@/lib/db";
import { diceTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DicePageClient from "@/components/dice-page";

type Props = { params: { slug: string } };

const DEMO_TABLE = {
  id: 0,
  slug: "DEMO-classic",
  title: "Dice Classic",
  description: "Lancez le de virtuel, choisissez votre cible.",
  betOptions: [1, 5, 10, 25],
  recipientAddress: "",
  primaryColor: "#F59E0B",
  accentColor: "#D97706",
  status: "active",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.slug.startsWith("DEMO")) {
    return { title: "Dice Demo — NF Society" };
  }
  const [table] = await db.select().from(diceTables).where(eq(diceTables.slug, params.slug)).limit(1);
  if (!table) return { title: "Dice — NF Society" };
  return {
    title: `${table.title} — NF Society Dice`,
    description: table.description || "Dice avec CRC",
  };
}

export default async function DicePage({ params }: Props) {
  if (params.slug.startsWith("DEMO")) {
    return <DicePageClient table={DEMO_TABLE} />;
  }

  const [table] = await db.select().from(diceTables).where(eq(diceTables.slug, params.slug)).limit(1);
  if (!table) notFound();

  return (
    <DicePageClient
      table={{
        ...table,
        betOptions: (table.betOptions as number[]) || [1, 5, 10, 25],
      }}
    />
  );
}
