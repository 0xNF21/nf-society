import { db } from "@/lib/db";
import { kenoTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import KenoPageClient from "@/components/keno-page";

type Props = { params: { slug: string } };

const DEMO_TABLE = {
  id: 0,
  slug: "DEMO-classic",
  title: "Keno Classic",
  description: "Choisissez vos numeros, tentez votre chance.",
  betOptions: [1, 5, 10, 25],
  recipientAddress: "",
  primaryColor: "#6366F1",
  accentColor: "#818CF8",
  status: "active",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.slug.startsWith("DEMO")) {
    return { title: "Keno Demo — NF Society" };
  }
  const [table] = await db.select().from(kenoTables).where(eq(kenoTables.slug, params.slug)).limit(1);
  if (!table) return { title: "Keno — NF Society" };
  return {
    title: `${table.title} — NF Society Keno`,
    description: table.description || "Keno avec CRC",
  };
}

export default async function KenoPage({ params }: Props) {
  if (params.slug.startsWith("DEMO")) {
    return <KenoPageClient table={DEMO_TABLE} />;
  }

  const [table] = await db.select().from(kenoTables).where(eq(kenoTables.slug, params.slug)).limit(1);
  if (!table) notFound();

  return (
    <KenoPageClient
      table={{
        ...table,
        betOptions: (table.betOptions as number[]) || [1, 5, 10, 25],
      }}
    />
  );
}
