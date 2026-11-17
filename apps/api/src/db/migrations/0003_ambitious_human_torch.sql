CREATE TABLE "choral_writer"."agent" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"role" text NOT NULL,
	"instructions" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "choral_writer"."agent" ADD CONSTRAINT "agent_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_project_position_idx" ON "choral_writer"."agent" USING btree ("project_id","position","id");