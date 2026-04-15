import { db } from "@/lib/db";
import { crashDashTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CrashDashPageClient from "@/components/crash-dash-page";

type Props = { params: { slug: string } };

const DEMO_TABLE = {
  id: 0,
  slug: "DEMO-classic",
  title: "Demurrage Dash Classic",
  description: "Faites pousser la plante, recoltez avant le crash.",
  betOptions: [5, 10, 50, 100],
  recipientAddress: "",
  primaryColor: "#16A34A",
  accentColor: "#22C55E",
  status: "active",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (params.slug.startsWith("DEMO")) {
    return { title: "Demurrage Dash Demo — NF Society" };
  }
  const [table] = await db.select().from(crashDashTables).where(eq(crashDashTables.slug, params.slug)).limit(1);
  if (!table) return { title: "Demurrage Dash — NF Society" };
  return {
    title: `${table.title} — NF Society`,
    description: table.description || "Demurrage Dash avec CRC",
  };
}

export default async function CrashDashPage({ params }: Props) {
  if (params.slug.startsWith("DEMO")) {
    return <CrashDashPageClient table={DEMO_TABLE} />;
  }

  const [table] = await db.select().from(crashDashTables).where(eq(crashDashTables.slug, params.slug)).limit(1);
  if (!table) notFound();

  return (
    <CrashDashPageClient
      table={{
        ...table,
        betOptions: (table.betOptions as number[]) || [5, 10, 50, 100],
      }}
    />
  );
}
