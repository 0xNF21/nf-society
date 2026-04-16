import { db } from "@/lib/db";
import { plinkoTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PlinkoPageClient from "@/components/plinko-page";

type Props = { params: { slug: string } };

const DEMO_TABLE = {
  id: 0,
  slug: "DEMO-classic",
  title: "Plinko Classic",
  description: "Lachez la bille, laissez la gravite decider.",
  betOptions: [1, 5, 10, 25],
  recipientAddress: "",
  primaryColor: "#7C3AED",
  accentColor: "#8B5CF6",
  status: "active",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.slug.startsWith("DEMO")) {
    return { title: "Plinko Demo — NF Society" };
  }
  const [table] = await db.select().from(plinkoTables).where(eq(plinkoTables.slug, params.slug)).limit(1);
  if (!table) return { title: "Plinko — NF Society" };
  return {
    title: `${table.title} — NF Society Plinko`,
    description: table.description || "Plinko avec CRC",
  };
}

export default async function PlinkoPage({ params }: Props) {
  if (params.slug.startsWith("DEMO")) {
    return <PlinkoPageClient table={DEMO_TABLE} />;
  }

  const [table] = await db.select().from(plinkoTables).where(eq(plinkoTables.slug, params.slug)).limit(1);
  if (!table) notFound();

  return (
    <PlinkoPageClient
      table={{
        ...table,
        betOptions: (table.betOptions as number[]) || [1, 5, 10, 25],
      }}
    />
  );
}
