import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(),
  transactionHash: text("transaction_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
