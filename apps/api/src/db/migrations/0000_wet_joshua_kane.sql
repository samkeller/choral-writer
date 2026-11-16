CREATE TABLE "choral_writer"."llm_call" (
	"id" uuid PRIMARY KEY NOT NULL,
	"turn_id" uuid,
	"agent_id" uuid,
	"stage" text NOT NULL,
	"model" text NOT NULL,
	"request" jsonb NOT NULL,
	"response" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
