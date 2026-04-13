import { db } from "@/lib/db";
import { coinFlipTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CoinFlipPageClient from "@/components/coin-flip-page";

type Props = { params: { slug: string } };

const DEMO_TABLE = {
  id: 0,
  slug: "DEMO-classic",
  title: "Pile ou Face Classic",
  description: "Pile ou face, 50/50, RTP 98%.",
  betOptions: [1, 5, 10, 25],
  recipientAddress: "",
  primaryColor: "#0EA5E9",
  accentColor: "#0284C7",
  status: "active",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.slug.startsWith("DEMO")) {
    return { title: "Pile ou Face Demo — NF Society" };
  }
  const [table] = await db.select().from(coinFlipTables).where(eq(coinFlipTables.slug, params.slug)).limit(1);
  if (!table) return { title: "Pile ou Face — NF Society" };
  return {
    title: `${table.title} — NF Society`,
    description: table.description || "Pile ou face avec CRC",
  };
}

export default async function CoinFlipPage({ params }: Props) {
  // Demo mode: use fake table data
  if (params.slug.startsWith("DEMO")) {
    return <CoinFlipPageClient table={DEMO_TABLE} />;
  }

  const [table] = await db.select().from(coinFlipTables).where(eq(coinFlipTables.slug, params.slug)).limit(1);
  if (!table) notFound();

  return <CoinFlipPageClient table={{ ...table, betOptions: (table.betOptions as number[]) || [1, 5, 10, 25] }} />;
}
