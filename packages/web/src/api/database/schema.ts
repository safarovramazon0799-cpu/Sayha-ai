import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export * from "./auth-schema";

export const consultations = sqliteTable("consultations", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  messages: text("messages").notNull().default("[]"), // JSON array
  category: text("category").notNull().default("general"), // civil, labor, family, corporate, tax
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // shartnoma, ishonchnoma, davo_ariza, ariza
  title: text("title").notNull(),
  content: text("content").notNull(),
  formData: text("form_data").notNull().default("{}"), // JSON
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

export const contractReviews = sqliteTable("contract_reviews", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  fileName: text("file_name").notNull(),
  originalText: text("original_text").notNull(),
  analysisResult: text("analysis_result").notNull().default("{}"), // JSON
  riskLevel: text("risk_level").notNull().default("medium"), // low, medium, high
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// Telegram verification codes — pending registrations awaiting bot confirmation
export const telegramVerifications = sqliteTable("telegram_verifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull(),
  code: text("code").notNull().unique(),
  expiresAt: integer("expires_at").notNull(), // unix seconds
  telegramChatId: text("telegram_chat_id"),
  telegramUsername: text("telegram_username"),
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  sessionToken: text("session_token"), // populated after Telegram verifies
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// Telegram bot activity — for MAU tracking
export const botActivity = sqliteTable("bot_activity", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  telegramChatId: text("telegram_chat_id").notNull(),
  action: text("action").notNull(), // "message", "tarif", "profile", "ai_query", etc.
  createdAt: integer("created_at").notNull().default(sql`(unixepoch())`),
});

// RAG knowledge base — one row per article/modda chunk from official PDFs
export const knowledgeChunks = sqliteTable("knowledge_chunks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  docName: text("doc_name").notNull(),       // e.g. "Mehnat kodeksi"
  docType: text("doc_type").notNull(),       // e.g. "labor", "civil", "constitution"
  articleRef: text("article_ref").notNull(), // e.g. "87-modda", "Modda 12"
  chapterRef: text("chapter_ref").notNull().default(""), // e.g. "5-bob"
  chunkText: text("chunk_text").notNull(),   // full article text
  embedding: text("embedding").notNull(),    // JSON float array (text-embedding-3-small, 1536 dims)
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});
