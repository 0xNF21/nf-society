import { NextResponse } from "next/server";
import { getPayoutConfig, getSafeCrcBalance, getBotXdaiBalance } from "@/lib/payout";
import { ethers } from "ethers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const config = getPayoutConfig();

    if (!config.configured) {
      return NextResponse.json({
        configured: false,
        missingVars: config.missingVars,
      });
    }

    let safeBalance = { erc1155: "0", erc20: "0" };
    let botXdaiBalance = "0";
    let error: string | undefined;

    try {
      const balance = await getSafeCrcBalance();
      safeBalance = {
        erc1155: ethers.formatEther(balance.erc1155),
        erc20: ethers.formatEther(balance.erc20),
      };
      botXdaiBalance = await getBotXdaiBalance();
    } catch (e: any) {
      error = e.message;
    }

    return NextResponse.json({
      configured: true,
      botAddress: config.botAddress,
      safeAddress: config.safeAddress,
      rolesModAddress: config.rolesModAddress,
      safeBalance,
      botXdaiBalance,
      error,
    });
  } catch (error: any) {
    console.error("Payout status error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
