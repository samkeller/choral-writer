CREATE TABLE "choral_writer"."llm_price" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"price_window" text DEFAULT 'all' NOT NULL,
	"input_per_million" numeric(18, 6) NOT NULL,
	"output_per_million" numeric(18, 6) NOT NULL,
	"cache_read_per_million" numeric(18, 6),
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "choral_writer"."llm_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"call_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"turn_id" uuid,
	"stage" text NOT NULL,
	"stage_execution_id" uuid,
	"agent_id" uuid,
	"agent_version_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" bigint,
	"output_tokens" bigint,
	"cached_input_tokens" bigint,
	"duration_ms" bigint NOT NULL,
	"status" text NOT NULL,
	"pricing_id" uuid,
	"cost_basis" text NOT NULL,
	"cost_micro_usd" bigint,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_usage_call_id_unique" UNIQUE("call_id")
);
--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_call" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_usage" ADD CONSTRAINT "llm_usage_call_id_llm_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "choral_writer"."llm_call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_usage" ADD CONSTRAINT "llm_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_usage" ADD CONSTRAINT "llm_usage_pricing_id_llm_price_id_fk" FOREIGN KEY ("pricing_id") REFERENCES "choral_writer"."llm_price"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_price_lookup_idx" ON "choral_writer"."llm_price" USING btree ("provider","model","price_window","valid_from");--> statement-breakpoint
CREATE INDEX "llm_usage_project_created_idx" ON "choral_writer"."llm_usage" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_usage_project_stage_idx" ON "choral_writer"."llm_usage" USING btree ("project_id","stage");--> statement-breakpoint
CREATE INDEX "llm_usage_turn_idx" ON "choral_writer"."llm_usage" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "llm_usage_model_idx" ON "choral_writer"."llm_usage" USING btree ("model");--> statement-breakpoint
ALTER TABLE "choral_writer"."llm_call" ADD CONSTRAINT "llm_call_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "choral_writer"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Une grille publiée est immuable : un changement de tarif insère une nouvelle période
-- et clôt la précédente. C'est ce qui garantit qu'un coût ancien reste explicable sans
-- être recalculé avec les tarifs du jour.
CREATE FUNCTION choral_writer.reject_llm_price_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published LLM price periods are immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER llm_price_immutable BEFORE UPDATE ON choral_writer.llm_price
  FOR EACH ROW EXECUTE FUNCTION choral_writer.reject_llm_price_change();--> statement-breakpoint
-- Les contraintes ci-dessous sont volontairement rédigées à la main : elles rendent
-- vérifiables en base deux règles produit, à savoir qu'un coût non mesuré est nul et
-- qu'un coût mesuré n'est jamais négatif.
ALTER TABLE choral_writer.llm_usage ADD CONSTRAINT llm_usage_stage_check
  CHECK (stage IN ('analysis', 'narrator', 'guardian', 'memory_setup'));
ALTER TABLE choral_writer.llm_usage ADD CONSTRAINT llm_usage_status_check
  CHECK (status IN ('success', 'error'));
ALTER TABLE choral_writer.llm_usage ADD CONSTRAINT llm_usage_cost_basis_check
  CHECK (cost_basis IN ('provider_confirmed', 'priced', 'unpriced'));
ALTER TABLE choral_writer.llm_usage ADD CONSTRAINT llm_usage_cost_check
  CHECK ((cost_basis = 'unpriced') = (cost_micro_usd IS NULL) AND coalesce(cost_micro_usd, 0) >= 0);
ALTER TABLE choral_writer.llm_usage ADD CONSTRAINT llm_usage_tokens_check
  CHECK (coalesce(input_tokens, 0) >= 0 AND coalesce(output_tokens, 0) >= 0
    AND coalesce(cached_input_tokens, 0) >= 0 AND duration_ms >= 0);
ALTER TABLE choral_writer.llm_price ADD CONSTRAINT llm_price_window_check
  CHECK (price_window IN ('peak', 'off_peak', 'all'));
ALTER TABLE choral_writer.llm_price ADD CONSTRAINT llm_price_period_check
  CHECK (valid_to IS NULL OR valid_to > valid_from);--> statement-breakpoint
-- Grille initiale constatée dans la documentation DeepSeek le 2026-11-18, en USD par
-- million de tokens. `input_per_million` porte le tarif d'entrée hors cache et
-- `cache_read_per_million` le tarif d'entrée en cache : ignorer cette distinction, ou
-- ignorer la fenêtre pleine/creuse, produirait un écart silencieux d'un facteur deux.
INSERT INTO choral_writer.llm_price
  (id, provider, model, price_window, input_per_million, output_per_million, cache_read_per_million, valid_from, valid_to, source)
VALUES
  ('019aee10-0000-7000-8000-000000000001', 'deepseek', 'deepseek-flash', 'off_peak', 0.15, 0.6, 0.003, '2026-11-01T00:00:00Z', NULL, 'provider-docs'),
  ('019aee10-0000-7000-8000-000000000002', 'deepseek', 'deepseek-flash', 'peak', 0.3, 1.2, 0.006, '2026-11-01T00:00:00Z', NULL, 'provider-docs'),
  ('019aee10-0000-7000-8000-000000000003', 'deepseek', 'deepseek-v4-pro', 'off_peak', 0.66, 1.98, 0.022, '2026-11-01T00:00:00Z', NULL, 'provider-docs'),
  ('019aee10-0000-7000-8000-000000000004', 'deepseek', 'deepseek-v4-pro', 'peak', 1.32, 3.96, 0.044, '2026-11-01T00:00:00Z', NULL, 'provider-docs'),
  ('019aee10-0000-7000-8000-000000000005', 'deepseek', 'deepseek-chat', 'off_peak', 0.15, 0.6, 0.003, '2026-11-01T00:00:00Z', NULL, 'provider-docs'),
  ('019aee10-0000-7000-8000-000000000006', 'deepseek', 'deepseek-chat', 'peak', 0.3, 1.2, 0.006, '2026-11-01T00:00:00Z', NULL, 'provider-docs');
