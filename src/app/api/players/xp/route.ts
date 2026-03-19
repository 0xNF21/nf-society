import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { computeLevel, getLevelName, xpToNextLevel, getXpForAction } from "@/lib/xp";
import { checkAndAwardBadges, awardSupremeFounder } from "@/lib/badges";

export async function POST(req: NextRequest) {
  try {
    const { address, action } = await req.json();
    if (!address || !action) {
      return NextResponse.json({ error: "Missing address or action" }, { status: 400 });
    }

    const addr = address.toLowerCase();
    const xpGained = getXpForAction(action);
    if (xpGained === 0) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

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
      const level = computeLevel(newXp);
      await db.insert(players).values({
        address: addr,
        xp: newXp,
        level,
        streak: newStreak,
        lastSeen: now,
        createdAt: now,
      });
    } else {
      const prevLevel = computeLevel(existing.xp);

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
            levelName: getLevelName(prevLevel),
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
        newXp += 50; // streak_7days bonus
      }

      const newLevel = computeLevel(newXp);
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
        isFirstWin: action === "morpion_win" && isNew,
      });
      // Supreme founder check on first daily_checkin
      if (action === "daily_checkin" && isNew) {
        await awardSupremeFounder(addr);
      }
    } catch (badgeErr) {
      console.error("[Badge check error]", badgeErr);
    }

    const finalLevel = computeLevel(newXp);
    return NextResponse.json({
      xp: newXp,
      level: finalLevel,
      levelName: getLevelName(finalLevel),
      xpGained,
      levelUp: leveledUp,
      xpToNext: xpToNextLevel(newXp),
      streak: newStreak,
      newBadges,
    });
  } catch (e) {
    console.error("[XP API]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
