export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { checkAllNewPayments } from "@/lib/circles";

export async function GET() {
  try {
    const payments = await checkAllNewPayments(1, "0x960A0784640fD6581D221A56df1c60b65b5ebB6f");
    return NextResponse.json({
      count: payments.length,
      payments: payments.map(p => ({
        tx: p.transactionHash.slice(0, 15),
        sender: p.sender.slice(0, 10),
        value: p.value,
        gameData: p.gameData,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
