import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { issues } from "./issues.js";

export const agentChatSessions = pgTable(
  "agent_chat_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    title: text("title").notNull().default("Percakapan Baru"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_chat_sessions_company_agent_idx").on(
      table.companyId,
      table.agentId,
      table.updatedAt,
    ),
    index("agent_chat_sessions_user_idx").on(
      table.companyId,
      table.userId,
      table.updatedAt,
    ),
    foreignKey({
      columns: [table.companyId, table.agentId],
      foreignColumns: [agents.companyId, agents.id],
      name: "agent_chat_sessions_company_agent_fk",
    }).onDelete("cascade"),
  ],
);

export const agentChatMessages = pgTable(
  "agent_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentChatSessions.id, { onDelete: "cascade" }),
    senderType: text("sender_type").$type<"user" | "agent" | "system">().notNull(),
    senderId: text("sender_id").notNull(),
    content: text("content").notNull(),
    createdTaskId: uuid("created_task_id").references(() => issues.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_chat_messages_session_idx").on(
      table.sessionId,
      table.createdAt,
    ),
    index("agent_chat_messages_company_idx").on(
      table.companyId,
      table.createdAt,
    ),
  ],
);
