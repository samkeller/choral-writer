CREATE TABLE "choral_writer"."memory_bank" (
	"branch_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"revision_id" uuid NOT NULL,
	"entries" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."memory_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."memory_settings" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"catalog" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "choral_writer"."chat_turn" ADD COLUMN "memory_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "choral_writer"."chat_turn" ADD COLUMN "memory_result" jsonb;--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_call" ADD COLUMN "stage_execution_id" uuid;--> statement-breakpoint
ALTER TABLE "choral_writer"."project_agent" ADD COLUMN "memory_read" jsonb;--> statement-breakpoint
ALTER TABLE "choral_writer"."memory_bank" ADD CONSTRAINT "memory_bank_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."memory_bank" ADD CONSTRAINT "memory_bank_project_id_branch_id_chat_branch_project_id_id_fk" FOREIGN KEY ("project_id","branch_id") REFERENCES "choral_writer"."chat_branch"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."memory_run" ADD CONSTRAINT "memory_run_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."memory_run" ADD CONSTRAINT "memory_run_project_id_branch_id_chat_branch_project_id_id_fk" FOREIGN KEY ("project_id","branch_id") REFERENCES "choral_writer"."chat_branch"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."memory_run" ADD CONSTRAINT "memory_run_project_id_turn_id_chat_turn_project_id_id_fk" FOREIGN KEY ("project_id","turn_id") REFERENCES "choral_writer"."chat_turn"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."memory_settings" ADD CONSTRAINT "memory_settings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_run_turn_idx" ON "choral_writer"."memory_run" USING btree ("turn_id","created_at");