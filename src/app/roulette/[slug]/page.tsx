import { db } from "@/lib/db";
import { rouletteTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import RoulettePageClient from "@/components/roulette-page";

type Props = { params: { slug: string } };

const DEMO_TABLE = {
  id: 0,
  slug: "DEMO-classic",
  title: "Roulette Classic",
  description: "Placez vos mises sur le tapis, lancez la roue.",
  betOptions: [1, 5, 10, 25],
  recipientAddress: "",
  primaryColor: "#DC2626",
  accentColor: "#B91C1C",
  status: "active",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.slug.startsWith("DEMO")) {
    return { title: "Roulette Demo — NF Society" };
  }
  const [table] = await db.select().from(rouletteTables).where(eq(rouletteTables.slug, params.slug)).limit(1);
  if (!table) return { title: "Roulette — NF Society" };
  return {
    title: `${table.title} — NF Society Roulette`,
    description: table.description || "Roulette avec CRC",
  };
}

export default async function RoulettePage({ params }: Props) {
  if (params.slug.startsWith("DEMO")) {
    return <RoulettePageClient table={DEMO_TABLE} />;
  }

  const [table] = await db.select().from(rouletteTables).where(eq(rouletteTables.slug, params.slug)).limit(1);
  if (!table) notFound();

  return (
    <RoulettePageClient
      table={{
        ...table,
        betOptions: (table.betOptions as number[]) || [1, 5, 10, 25],
      }}
    />
  );
}
