import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { relicsGames } from "@/lib/db/schema/relics";
import { claimedPayments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";

const WEI_PER_CRC = BigInt("1000000000000000000");

export async function POST(req: NextRequest) {
  try {
    const gameSlug = req.nextUrl.searchParams.get("gameId");
    if (!gameSlug) return NextResponse.json({ error: "gameId is required" }, { status: 400 });

    const [game] = await db.select().from(relicsGames).where(eq(relicsGames.slug, gameSlug)).limit(1);
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    if (game.status === "placing" || game.status === "playing" || game.status === "finished") {
      return NextResponse.json({ message: "Game already started or finished", game });
    }

    const priceWei = BigInt(game.betCrc) * WEI_PER_CRC;

    const allClaimed = await db.select().from(claimedPayments);
    const globalClaimedTxHashes = new Set(allClaimed.map((c) => c.txHash.toLowerCase()));

    const knownTxHashes = new Set<string>();
    if (game.player1TxHash) knownTxHashes.add(game.player1TxHash.toLowerCase());
    if (game.player2TxHash) knownTxHashes.add(game.player2TxHash.toLowerCase());

    const newPayments = await checkAllNewPayments(game.betCrc, game.recipientAddress);

    for (const payment of newPayments) {
      const txHash = payment.transactionHash.toLowerCase();
      const playerAddress = payment.sender.toLowerCase();

      if (knownTxHashes.has(txHash)) continue;
      if (globalClaimedTxHashes.has(txHash)) continue;

      if (payment.gameData) {
        if (payment.gameData.game !== "relics" || payment.gameData.id !== game.slug) continue;
      } else {
        continue;
      }

      try {
        const val = BigInt(payment.value);
        if (val !== priceWei) continue;
      } catch {
        continue;
      }

      await db.insert(claimedPayments).values({
        txHash,
        gameType: "relics",
        gameId: game.id,
        playerAddress,
        amountCrc: game.betCrc,
      }).onConflictDoNothing();

      knownTxHashes.add(txHash);
      globalClaimedTxHashes.add(txHash);

      const playerToken = payment.gameData?.t || null;

      if (!game.player1Address) {
        await db.update(relicsGames).set({
          player1Address: playerAddress,
          player1TxHash: txHash,
          player1Token: playerToken,
          status: "waiting_p2",
          updatedAt: new Date(),
        }).where(eq(relicsGames.id, game.id));
        game.player1Address = playerAddress;
        game.player1TxHash = txHash;
        game.status = "waiting_p2";
      } else if (!game.player2Address && playerAddress !== game.player1Address?.toLowerCase()) {
        await db.update(relicsGames).set({
          player2Address: playerAddress,
          player2TxHash: txHash,
          player2Token: playerToken,
          status: "placing",
          updatedAt: new Date(),
        }).where(eq(relicsGames.id, game.id));
        game.player2Address = playerAddress;
        game.player2TxHash = txHash;
        game.status = "placing";
      }
    }

    const [updated] = await db.select().from(relicsGames).where(eq(relicsGames.slug, gameSlug)).limit(1);
    return NextResponse.json({ game: updated });
  } catch (error: any) {
    console.error("[RelicsScan] Error:", error.message);
    return NextResponse.json({ error: error.message || "Scan failed" }, { status: 500 });
  }
}
