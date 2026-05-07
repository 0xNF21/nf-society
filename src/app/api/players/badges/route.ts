import { NextResponse } from "next/server";

/**
 * DEPRECATED — public badge attribution endpoint removed for security.
 *
 * Before PR Auth, this route accepted `{ address, action, context }` from
 * any client and awarded badges accordingly. Even after locking `address`
 * to the session, an authenticated user could still forge `context` to
 * award themselves badges they hadn't earned (e.g., `isFirstWin: true`).
 *
 * Badges are now attributed exclusively server-side as a side-effect of
 * `awardPlayerXp(...)` in `src/lib/xp-server.ts`, with the context computed
 * from DB state (never from client input). Admin-only badge granting lives
 * at `/api/admin/badges/award`.
 *
 * The route remains as a 410 Gone for backward compatibility, in case any
 * cached client still calls it.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "ENDPOINT_REMOVED",
      message:
        "Public badge awarding is removed. Badges are attributed automatically server-side. " +
        "For admin grants, use /api/admin/badges/award.",
    },
    { status: 410 },
  );
}
