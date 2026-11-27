ALTER TABLE "choral_writer"."chat_turn" ADD COLUMN "attribution" jsonb;--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_usage" DROP CONSTRAINT "llm_usage_stage_check";--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_usage" ADD CONSTRAINT "llm_usage_stage_check"
  CHECK (stage IN ('analysis', 'direction', 'narrator', 'guardian', 'memory_setup', 'attribution'));
