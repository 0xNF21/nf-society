import { pgTable, serial, text, integer, bigint, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// Annonces des parties multijoueur publiques dans le topic Lobby Telegram.
// Une ligne par partie annoncee, pour pouvoir editer le message quand la
// partie demarre (2e joueur paye) ou expire.
export const multiplayerAnnouncements = pgTable(
  "multiplayer_announcements",
  {
    id: serial("id").primaryKey(),
    gameKey: text("game_key").notNull(),
    slug: text("slug").notNull(),
    telegramChatId: bigint("telegram_chat_id", { mode: "number" }).notNull(),
    telegramMessageId: integer("telegram_message_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    startedAt: timestamp("started_at"),
  },
  (table) => ({
    gameSlugIdx: uniqueIndex("mp_announcements_game_slug_idx").on(table.gameKey, table.slug),
  })
);

export type MultiplayerAnnouncementRow = typeof multiplayerAnnouncements.$inferSelect;
export type NewMultiplayerAnnouncement = typeof multiplayerAnnouncements.$inferInsert;
