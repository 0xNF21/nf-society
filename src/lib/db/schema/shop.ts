import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const shopItems = pgTable("shop_items", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  category: text("category").notNull(),
  xpCost: integer("xp_cost").notNull(),
  levelRequired: integer("level_required").notNull().default(1),
  refundType: text("refund_type"),
  refundAmountCrc: integer("refund_amount_crc"),
  stock: integer("stock"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shopPurchases = pgTable("shop_purchases", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  itemSlug: text("item_slug").notNull(),
  xpSpent: integer("xp_spent").notNull(),
  effectApplied: boolean("effect_applied").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shopCoupons = pgTable("shop_coupons", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  type: text("type").notNull(),
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at"),
  txHashUsed: text("tx_hash_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const shopSessions = pgTable("shop_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  address: text("address"),
  txHash: text("tx_hash"),
  refunded: boolean("refunded").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
