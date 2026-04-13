import { db } from "@/lib/db";
import { hiloTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import HiLoPageClient from "@/components/hilo-page";

type Props = { params: { slug: string } };

const DEMO_TABLE = {
  id: 0,
  slug: "DEMO-classic",
  title: "Hi-Lo Classic",
  description: "Hi-Lo, devinez si la prochaine carte est plus haute ou plus basse.",
  betOptions: [1, 5, 10, 25],
  recipientAddress: "",
  primaryColor: "#7C3AED",
  accentColor: "#8B5CF6",
  status: "active",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.slug.startsWith("DEMO")) {
    return { title: "Hi-Lo Demo — NF Society" };
  }
  const [table] = await db.select().from(hiloTables).where(eq(hiloTables.slug, params.slug)).limit(1);
  if (!table) return { title: "Hi-Lo — NF Society" };
  return {
    title: `${table.title} — NF Society Hi-Lo`,
    description: table.description || "Hi-Lo avec CRC",
  };
}

export default async function HiLoPage({ params }: Props) {
  if (params.slug.startsWith("DEMO")) {
    return <HiLoPageClient table={DEMO_TABLE} />;
  }

  const [table] = await db.select().from(hiloTables).where(eq(hiloTables.slug, params.slug)).limit(1);
  if (!table) notFound();

  return <HiLoPageClient table={{ ...table, betOptions: (table.betOptions as number[]) || [1, 5, 10, 25] }} />;
}
