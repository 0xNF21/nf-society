import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { players, shopPurchases } from "@/lib/db/schema";
import { eq, and, gt, sql } from "drizzle-orm";
import { computeLevel, getLevelName, xpToNextLevel } from "@/lib/xp";
import { loadXpConfig } from "@/lib/xp-server";
import { checkAndAwardBadges, awardSupremeFounder } from "@/lib/badges";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "players-xp", 30, 60000);
  if (limited) return limited;

  try {
    const { address, action, xpOverride } = await req.json();
    if (!address || !action) {
      return NextResponse.json({ error: "Missing address or action" }, { status: 400 });
    }

    const addr = address.toLowerCase();
    const { rewards, levels } = await loadXpConfig();
    let xpGained = typeof xpOverride === "number" && xpOverride > 0 ? xpOverride : (rewards[action] ?? 0);
    if (xpGained === 0) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    // Check active XP boosts
    try {
      const now = new Date();
      const activeBoosts = await db
        .select({ itemSlug: shopPurchases.itemSlug })
        .from(shopPurchases)
        .where(
          and(
            eq(shopPurchases.address, addr),
            gt(shopPurchases.expiresAt, now),
          )
        );

      const hasBoost24h = activeBoosts.some(b => b.itemSlug === "xp_boost_24h");
      const hasBoost7d = activeBoosts.some(b => b.itemSlug === "xp_boost_7d");

      if (hasBoost24h) {
        xpGained = Math.floor(xpGained * 2); // x2
      } else if (hasBoost7d) {
        xpGained = Math.floor(xpGained * 1.5); // x1.5
      }
    } catch { /* boost check fail silencieux */ }

    // Upsert player
    const now = new Date();
    const [existing] = await db.select().from(players).where(eq(players.address, addr));

    let newXp: number;
    let newStreak: number;
    let leveledUp = false;

    if (!existing) {
      // Nouveau joueur
      newXp = xpGained;
      newStreak = action === "daily_checkin" ? 1 : 0;
      const level = computeLevel(newXp, levels);
      await db.insert(players).values({
        address: addr,
        xp: newXp,
        level,
        streak: newStreak,
        lastSeen: now,
        createdAt: now,
      });
    } else {
      const prevLevel = computeLevel(existing.xp, levels);

      // Gestion daily checkin + streak
      if (action === "daily_checkin") {
        const lastSeen = existing.lastSeen;
        const diffMs = now.getTime() - lastSeen.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 1) {
          // Déjà checké aujourd'hui — on retourne sans donner XP
          return NextResponse.json({
            xp: existing.xp,
            level: prevLevel,
            levelName: getLevelName(prevLevel, levels),
            xpGained: 0,
            levelUp: false,
            message: "Already checked in today",
          });
        }

        newStreak = diffDays === 1 ? existing.streak + 1 : 1;
      } else {
        newStreak = existing.streak;
      }

      newXp = existing.xp + xpGained;

      // Bonus streak 7 jours
      if (action === "daily_checkin" && newStreak === 7) {
        newXp += rewards["streak_7days"] ?? 50;
      }

      const newLevel = computeLevel(newXp, levels);
      leveledUp = newLevel > prevLevel;

      await db.update(players)
        .set({ xp: newXp, level: newLevel, streak: newStreak, lastSeen: now })
        .where(eq(players.address, addr));
    }

    // --- Badge check (non-blocking) ---
    let newBadges: string[] = [];
    try {
      const hour = new Date().getHours();
      const isNew = !existing;
      newBadges = await checkAndAwardBadges(addr, action, {
        hour,
        isFirstLootbox: action === "lootbox_open" && isNew,
        isFirstWin: action.endsWith("_win") && isNew,
      });
      // Supreme founder check on first daily_checkin
      if (action === "daily_checkin" && isNew) {
        await awardSupremeFounder(addr);
      }
    } catch (badgeErr) {
      console.error("[Badge check error]", badgeErr);
    }

    const finalLevel = computeLevel(newXp, levels);
    return NextResponse.json({
      xp: newXp,
      level: finalLevel,
      levelName: getLevelName(finalLevel, levels),
      xpGained,
      levelUp: leveledUp,
      xpToNext: xpToNextLevel(newXp, levels),
      streak: newStreak,
      newBadges,
    });
  } catch (e) {
    console.error("[XP API]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
