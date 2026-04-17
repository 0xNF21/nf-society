import { pgTable, serial, text, integer, bigint, timestamp, jsonb } from "drizzle-orm/pg-core";

// Tickets support via bot Telegram.
// On logge TOUS les messages (user<->admin) pour pouvoir exposer un historique
// admin dans une phase ulterieure (N2/N3) sans avoir a backfiller.
export const supportMessages = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }).notNull(),
  telegramUsername: text("telegram_username"),
  telegramFirstName: text("telegram_first_name"),
  direction: text("direction").notNull(), // 'in' = user -> admin, 'out' = admin -> user
  text: text("text").notNull(),
  // Mapping des messages Telegram pour permettre l'admin de repondre via reply.
  adminMessageId: integer("admin_message_id"),
  userMessageId: integer("user_message_id"),
  // Contexte capture au premier message (page d'origine, userAgent, wallet si dispo).
  context: jsonb("context"),
  walletAddress: text("wallet_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SupportMessageRow = typeof supportMessages.$inferSelect;
export type NewSupportMessage = typeof supportMessages.$inferInsert;
