import { db } from "@/lib/db";
import { lotteries, participants } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import LotteryPage from "@/components/lottery-page";
import type { LotteryConfig } from "@/components/lottery-page";

export const dynamic = "force-dynamic";

export default async function LotteriePage({ params }: { params: { slug: string } }) {
  const result = await db
    .select()
    .from(lotteries)
    .where(eq(lotteries.slug, params.slug))
    .limit(1);

  if (result.length === 0) {
    notFound();
  }

  const row = result[0];

  const participantRows = await db
    .select({
      address: participants.address,
      transactionHash: participants.transactionHash,
      paidAt: participants.paidAt,
    })
    .from(participants)
    .where(eq(participants.lotteryId, row.id))
    .orderBy(participants.paidAt);

  const config: LotteryConfig = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    organizer: row.organizer,
    description: row.description,
    ticketPriceCrc: row.ticketPriceCrc,
    recipientAddress: row.recipientAddress,
    primaryColor: row.primaryColor,
    accentColor: row.accentColor,
    logoUrl: row.logoUrl,
    theme: row.theme,
    commissionPercent: row.commissionPercent,
    status: row.status,
  };

  const initialParticipants = participantRows.map((p) => ({
    address: p.address,
    transactionHash: p.transactionHash,
    paidAt: p.paidAt ? p.paidAt.toISOString() : "",
  }));

  return <LotteryPage lottery={config} initialParticipants={initialParticipants} initialCount={participantRows.length} />;
}
