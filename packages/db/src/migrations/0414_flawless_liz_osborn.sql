CREATE TABLE "agent_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"sender_type" text NOT NULL,
	"sender_id" text NOT NULL,
	"content" text NOT NULL,
	"created_task_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'Percakapan Baru' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "source_chat_session_id" uuid;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "source_chat_message_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_session_id_agent_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."agent_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_created_task_id_issues_id_fk" FOREIGN KEY ("created_task_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_sessions" ADD CONSTRAINT "agent_chat_sessions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_sessions" ADD CONSTRAINT "agent_chat_sessions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_chat_sessions" ADD CONSTRAINT "agent_chat_sessions_company_agent_fk" FOREIGN KEY ("company_id","agent_id") REFERENCES "public"."agents"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_chat_messages_session_idx" ON "agent_chat_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_chat_messages_company_idx" ON "agent_chat_messages" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_chat_sessions_company_agent_idx" ON "agent_chat_sessions" USING btree ("company_id","agent_id","updated_at");--> statement-breakpoint
CREATE INDEX "agent_chat_sessions_user_idx" ON "agent_chat_sessions" USING btree ("company_id","user_id","updated_at");