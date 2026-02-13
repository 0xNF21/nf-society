import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
