import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lootboxes } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const isNumeric = /^\d+$/.test(id);

    const results = isNumeric
      ? await db.select().from(lootboxes).where(eq(lootboxes.id, parseInt(id))).limit(1)
      : await db.select().from(lootboxes).where(eq(lootboxes.slug, id)).limit(1);

    if (results.length === 0) {
      return NextResponse.json({ error: "Lootbox not found" }, { status: 404 });
    }
    return NextResponse.json(results[0]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const password = req.headers.get("x-admin-password");
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const body = await req.json();
    const { title, description, pricePerOpenCrc, recipientAddress, primaryColor, accentColor, logoUrl, status } = body;

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (pricePerOpenCrc !== undefined) updates.pricePerOpenCrc = pricePerOpenCrc;
    if (recipientAddress !== undefined) updates.recipientAddress = recipientAddress;
    if (primaryColor !== undefined) updates.primaryColor = primaryColor;
    if (accentColor !== undefined) updates.accentColor = accentColor;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl;
    if (status !== undefined) updates.status = status;

    const isNumeric = /^\d+$/.test(id);
    const [updated] = isNumeric
      ? await db.update(lootboxes).set(updates).where(eq(lootboxes.id, parseInt(id))).returning()
      : await db.update(lootboxes).set(updates).where(eq(lootboxes.slug, id)).returning();

    if (!updated) return NextResponse.json({ error: "Lootbox not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const password = req.headers.get("x-admin-password");
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = params;
    const isNumeric = /^\d+$/.test(id);
    const [deleted] = isNumeric
      ? await db.delete(lootboxes).where(eq(lootboxes.id, parseInt(id))).returning()
      : await db.delete(lootboxes).where(eq(lootboxes.slug, id)).returning();

    if (!deleted) return NextResponse.json({ error: "Lootbox not found" }, { status: 404 });
    return NextResponse.json(deleted);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
