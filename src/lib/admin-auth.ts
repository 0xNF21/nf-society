import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

export function hasAdminPassword(): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return typeof expected === "string" && expected.length > 0;
}

export function isAdminPasswordValid(provided: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof provided !== "string") return false;

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length
    && timingSafeEqual(expectedBytes, providedBytes);
}

export function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

export function checkAdminAuth(req: NextRequest): boolean {
  return isAdminPasswordValid(req.headers.get("x-admin-password"));
}

export function checkAdminBearerAuth(req: NextRequest): boolean {
  return isAdminPasswordValid(getBearerToken(req));
}
