ALTER TYPE "choral_writer"."agent_output" ADD VALUE 'direction';--> statement-breakpoint
ALTER TYPE "choral_writer"."agent_phase" ADD VALUE 'direction' BEFORE 'restitution';--> statement-breakpoint
ALTER TABLE "choral_writer"."agent" DROP CONSTRAINT "agent_phase_output_check";--> statement-breakpoint
ALTER TABLE "choral_writer"."chat_turn" ADD COLUMN "direction" jsonb;--> statement-breakpoint
ALTER TABLE "choral_writer"."agent" ADD CONSTRAINT "agent_phase_output_check" CHECK (("choral_writer"."agent"."phase" = 'analysis' AND "choral_writer"."agent"."output" = 'envelope')
    OR ("choral_writer"."agent"."phase" = 'restitution' AND "choral_writer"."agent"."output" IN ('narrative', 'memory_proposals'))
    OR ("choral_writer"."agent"."phase"::text = 'direction' AND "choral_writer"."agent"."output"::text = 'direction'));--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_usage" DROP CONSTRAINT "llm_usage_stage_check";--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_usage" ADD CONSTRAINT "llm_usage_stage_check"
  CHECK (stage IN ('analysis', 'direction', 'narrator', 'guardian', 'memory_setup'));
