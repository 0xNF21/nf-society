import { db } from "@/lib/db";
import { minesTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import MinesPageClient from "@/components/mines-page";

type Props = { params: { slug: string } };

const DEMO_TABLE = {
  id: 0,
  slug: "DEMO-classic",
  title: "Mines Classic",
  description: "Grille 5x5, revelez les gemmes, evitez les mines.",
  betOptions: [1, 5, 10, 25],
  mineOptions: [1, 3, 5, 10, 15, 24],
  recipientAddress: "",
  primaryColor: "#DC2626",
  accentColor: "#EF4444",
  status: "active",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.slug.startsWith("DEMO")) {
    return { title: "Mines Demo — NF Society" };
  }
  const [table] = await db.select().from(minesTables).where(eq(minesTables.slug, params.slug)).limit(1);
  if (!table) return { title: "Mines — NF Society" };
  return {
    title: `${table.title} — NF Society Mines`,
    description: table.description || "Mines avec CRC",
  };
}

export default async function MinesPage({ params }: Props) {
  if (params.slug.startsWith("DEMO")) {
    return <MinesPageClient table={DEMO_TABLE} />;
  }

  const [table] = await db.select().from(minesTables).where(eq(minesTables.slug, params.slug)).limit(1);
  if (!table) notFound();

  return (
    <MinesPageClient
      table={{
        ...table,
        betOptions: (table.betOptions as number[]) || [1, 5, 10, 25],
        mineOptions: (table.mineOptions as number[]) || [1, 3, 5, 10, 24],
      }}
    />
  );
}
