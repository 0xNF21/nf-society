import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lotteries } from "@/lib/db/schema";
import { eq, ne } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let results;
    if (status === "active") {
      results = await db.select().from(lotteries).where(eq(lotteries.status, "active"));
    } else if (status === "completed") {
      results = await db.select().from(lotteries).where(eq(lotteries.status, "completed"));
    } else if (status === "visible") {
      results = await db.select().from(lotteries).where(ne(lotteries.status, "archived"));
    } else {
      results = await db.select().from(lotteries);
    }

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Failed to fetch lotteries" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password, title, organizer, recipientAddress, description, ticketPriceCrc, primaryColor, accentColor, logoUrl, theme, commissionPercent } = body;

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json({ error: "Admin password not configured" }, { status: 500 });
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    if (!title || !organizer || !recipientAddress) {
      return NextResponse.json({ error: "Missing required fields: title, organizer, recipientAddress" }, { status: 400 });
    }

    const slug = body.slug || title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    const [created] = await db.insert(lotteries).values({
      slug,
      title,
      organizer,
      recipientAddress,
      ...(description !== undefined && { description }),
      ...(ticketPriceCrc !== undefined && { ticketPriceCrc }),
      ...(primaryColor !== undefined && { primaryColor }),
      ...(accentColor !== undefined && { accentColor }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(theme !== undefined && { theme }),
      ...(commissionPercent !== undefined && { commissionPercent }),
    }).returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create lottery";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
