/**
 * Unified Drizzle schema entry point.
 *
 * Every table the app uses is re-exported from here, so:
 *   - `import { something } from "@/lib/db/schema"` resolves to this file
 *     (via TypeScript's directory-index resolution) and sees all tables.
 *   - `drizzle.config.ts` points here, so `drizzle-kit generate` sees
 *     every table and can produce correct migrations.
 *   - `db.query.<table>` works for every table because the schema object
 *     constructed in `src/lib/db/index.ts` is the full union.
 *
 * When you add a new table:
 *   1. Create `src/lib/db/schema/<name>.ts` with the pgTable definition.
 *   2. Add `export * from "./<name>";` below, keeping the list sorted.
 */

export * from "./core";
export * from "./blackjack";
export * from "./cashout";
export * from "./coin-flip";
export * from "./crash-dash";
export * from "./crc-races";
// Preserve the pre-PR#9 alias so existing consumers don't break.
export type { PayoutEntry as CrcRacesPayoutEntry } from "./crc-races";
export * from "./daily";
export * from "./dames";
export * from "./dice";
export * from "./hilo";
export * from "./keno";
export * from "./lootbox";
export * from "./lottery";
export * from "./memory";
export * from "./mines";
export * from "./morpion";
export * from "./multiplayer-announcements";
export * from "./pfc";
export * from "./plinko";
export * from "./relics";
export * from "./roulette";
export * from "./shop";
export * from "./support";
