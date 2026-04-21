import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lootboxes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isEthereumAddress } from "@/lib/validation";

export async function GET() {
  try {
    const all = await db.select().from(lootboxes).orderBy(lootboxes.createdAt);
    return NextResponse.json(all);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const password = req.headers.get("x-admin-password");
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { slug, title, description, pricePerOpenCrc, recipientAddress, primaryColor, accentColor, logoUrl } = body;

    if (!slug || !title || !recipientAddress) {
      return NextResponse.json({ error: "slug, title and recipientAddress are required" }, { status: 400 });
    }

    if (!isEthereumAddress(recipientAddress)) {
      return NextResponse.json({ error: "Invalid recipientAddress (expected 0x + 40 hex chars)" }, { status: 400 });
    }

    const price = pricePerOpenCrc || 10;
    if (price < 10 || price % 10 !== 0) {
      return NextResponse.json({ error: "Price must be a multiple of 10 CRC (10, 20, 30, ...)" }, { status: 400 });
    }

    const [created] = await db.insert(lootboxes).values({
      slug,
      title,
      description: description || null,
      pricePerOpenCrc: pricePerOpenCrc || 10,
      recipientAddress,
      primaryColor: primaryColor || "#92400E",
      accentColor: accentColor || "#F59E0B",
      logoUrl: logoUrl || null,
      status: "active",
    }).returning();

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    if (error.message?.includes("unique")) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
