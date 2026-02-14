import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lotteries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: slug } = await params;
    const [lottery] = await db.select().from(lotteries).where(eq(lotteries.slug, slug));

    if (!lottery) {
      return NextResponse.json({ error: "Lottery not found" }, { status: 404 });
    }

    return NextResponse.json(lottery);
  } catch {
    return NextResponse.json({ error: "Failed to fetch lottery" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: slug } = await params;
    const body = await req.json();
    const { password, ...updates } = body;

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json({ error: "Admin password not configured" }, { status: 500 });
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    delete updates.id;
    delete updates.slug;

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      "title", "organizer", "description", "ticketPriceCrc",
      "recipientAddress", "primaryColor", "accentColor",
      "logoUrl", "theme", "commissionPercent", "status"
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const [updated] = await db
      .update(lotteries)
      .set(updateData)
      .where(eq(lotteries.slug, slug))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Lottery not found" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update lottery";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
