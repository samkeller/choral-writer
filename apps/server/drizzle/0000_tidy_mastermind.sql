CREATE SCHEMA "choral_writer";
--> statement-breakpoint
CREATE TABLE "choral_writer"."agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"system_prompt" text NOT NULL,
	"model" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context_spec" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "agents_kind_check" CHECK ("choral_writer"."agents"."kind" in ('interpreter', 'analysis', 'output'))
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_branch_id" uuid,
	"fork_event_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."budget_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"turn_id" uuid,
	"amount" numeric NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"settled_amount" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"turn_id" uuid,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_category_check" CHECK ("choral_writer"."events"."category" in ('narrative', 'mutation'))
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."global_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"turn_id" uuid,
	"agent_id" uuid,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"messages" jsonb NOT NULL,
	"response" text,
	"input_tokens" integer,
	"cached_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric,
	"accounted_cost_usd" numeric,
	"latency_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."memory_projections" (
	"branch_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"state" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"world_md" text DEFAULT '' NOT NULL,
	"world_initialized" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"story_clock_days" numeric DEFAULT '0' NOT NULL,
	"last_event_seq" integer DEFAULT 0 NOT NULL,
	"active_branch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"turn_id" uuid,
	"branch_id" uuid NOT NULL,
	"author" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"reject_code" text,
	"reject_detail" text,
	"event_seq" integer
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"from_turn" integer NOT NULL,
	"to_turn" integer NOT NULL,
	"text" text NOT NULL,
	"source_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"branch_id" uuid,
	"seq" integer NOT NULL,
	"user_input" text NOT NULL,
	"meta_direction" text,
	"status" text NOT NULL,
	"interpretation" jsonb,
	"resolution" jsonb,
	"prose" text,
	"story_time_label" text,
	"elapsed_days" numeric,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."whiteboard_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turn_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"envelope" jsonb,
	"status" text NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "choral_writer"."agents" ADD CONSTRAINT "agents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."branches" ADD CONSTRAINT "branches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."budget_reservations" ADD CONSTRAINT "budget_reservations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."budget_reservations" ADD CONSTRAINT "budget_reservations_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "choral_writer"."turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."events" ADD CONSTRAINT "events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."events" ADD CONSTRAINT "events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "choral_writer"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."events" ADD CONSTRAINT "events_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "choral_writer"."turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_calls" ADD CONSTRAINT "llm_calls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_calls" ADD CONSTRAINT "llm_calls_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "choral_writer"."turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_calls" ADD CONSTRAINT "llm_calls_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "choral_writer"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."memory_projections" ADD CONSTRAINT "memory_projections_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "choral_writer"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."memory_projections" ADD CONSTRAINT "memory_projections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."proposals" ADD CONSTRAINT "proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."proposals" ADD CONSTRAINT "proposals_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "choral_writer"."turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."proposals" ADD CONSTRAINT "proposals_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "choral_writer"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."summaries" ADD CONSTRAINT "summaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."summaries" ADD CONSTRAINT "summaries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "choral_writer"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."turns" ADD CONSTRAINT "turns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."whiteboard_entries" ADD CONSTRAINT "whiteboard_entries_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "choral_writer"."turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."whiteboard_entries" ADD CONSTRAINT "whiteboard_entries_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "choral_writer"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_project_key" ON "choral_writer"."agents" USING btree ("project_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "events_project_seq" ON "choral_writer"."events" USING btree ("project_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "summaries_branch_level_range" ON "choral_writer"."summaries" USING btree ("branch_id","level","from_turn","to_turn");--> statement-breakpoint
CREATE UNIQUE INDEX "turns_project_seq" ON "choral_writer"."turns" USING btree ("project_id","seq");