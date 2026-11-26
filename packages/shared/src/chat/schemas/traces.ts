import { z } from 'zod';

import {
  nudgeTypeSchema, recordedAnalysisEnvelopeSchema, tensionTargetSchema, turnDevelopmentsSchema, turnDirectionSchema,
} from '../../pipeline.js';
import { chatExecutionParamsSchema, turnConfigurationSchema } from './turn.js';
import { memoryContextSchema } from '../../memories.js';
import { costBasisSchema } from '../../usage/index.js';

export const traceStageSchema = z.enum(['analysis', 'direction', 'narrator', 'guardian', 'reducer']);
export const traceStatusSchema = z.enum(['success', 'error']);
export const traceCallParamsSchema = chatExecutionParamsSchema.extend({ callId: z.string().uuid() });

export const traceCallSummarySchema = z.object({
  id: z.string().uuid(),
  turnId: z.string().uuid(),
  stage: z.string().min(1),
  agentId: z.string().uuid().nullable(),
  agentVersionId: z.string().uuid().nullable(),
  agentName: z.string().nullable(),
  agentVersion: z.number().int().nullable(),
  model: z.string(),
  status: traceStatusSchema,
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  durationMs: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  error: z.string().nullable(),
  /** Coût en micro-dollars ; nul si l'appel n'a pas pu être tarifé ou précède le suivi des coûts. */
  costMicroUsd: z.number().int().nonnegative().nullable(),
  /** Origine du montant ; nulle si aucune ligne de consommation n'existe pour cet appel. */
  costBasis: costBasisSchema.nullable(),
});

/** Coût d'un tour. `complete` est faux dès qu'un appel du tour n'a pas de montant connu. */
export const turnCostSchema = z.object({
  microUsd: z.number().int().nonnegative(),
  complete: z.boolean(),
});

export const traceCallDetailSchema = traceCallSummarySchema.extend({
  request: z.object({
    memory: memoryContextSchema.optional(),
    messages: z.array(z.object({
      role: z.string(),
      content: z.unknown().optional(),
    }).passthrough()),
  }).passthrough(),
  response: z.string().nullable(),
});

export const analysisTraceSchema = z.object({
  agentId: z.string().uuid().nullable(),
  agentVersionId: z.string().uuid().nullable(),
  name: z.string(),
  status: traceStatusSchema,
  durationMs: z.number().int().nonnegative(),
  attempts: z.number().int().positive(),
  envelope: recordedAnalysisEnvelopeSchema.nullable(),
});

/** A failed direction means the narrator fell back to the whole whiteboard. */
export const directionTraceSchema = z.object({
  agentId: z.string().uuid().nullable(),
  agentVersionId: z.string().uuid().nullable(),
  name: z.string(),
  status: traceStatusSchema,
  durationMs: z.number().int().nonnegative(),
  attempts: z.number().int().positive(),
  /** Cost of every Director call of the turn, retries included. */
  cost: turnCostSchema,
  direction: turnDirectionSchema.nullable(),
});

export const narratorTraceSchema = z.object({
  status: traceStatusSchema,
  durationMs: z.number().int().nonnegative(),
  prose: z.string().nullable(),
});

/**
 * Durée d'une étape du tour. Les agents d'une même étape tournent en parallèle :
 * l'étape dure autant que son agent le plus lent, tentatives comprises.
 */
export const stageDurationSchema = z.object({
  stage: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  agentCount: z.number().int().positive(),
});

export const turnTraceSummarySchema = z.object({
  turnId: z.string().uuid(),
  analysis: z.array(analysisTraceSchema),
  /** Null when the turn ran without a Director. */
  direction: directionTraceSchema.nullable(),
  /**
   * What happened in the story world during the turn: the developments the Director retained, or all of
   * them without a direction. Null for a turn recorded before developments were.
   */
  developments: turnDevelopmentsSchema.nullable(),
  narrator: narratorTraceSchema.nullable(),
  calls: z.array(traceCallSummarySchema),
  /** Étapes dans l'ordre d'exécution, sans les relances ultérieures de la mémoire. */
  timeline: z.array(stageDurationSchema),
  /** Somme des étapes de `timeline`. */
  durationMs: z.number().int().nonnegative(),
  cost: turnCostSchema,
  /** Null for a turn that started before configurations were recorded. */
  configuration: turnConfigurationSchema.nullable(),
});

/** Ce qui distingue la configuration d'un tour de celle du tour précédent. */
export const turnConfigurationChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agentAdded'), name: z.string(), version: z.number().int().positive() }),
  z.object({ kind: z.literal('agentRemoved'), name: z.string(), version: z.number().int().positive() }),
  z.object({
    kind: z.literal('agentChanged'),
    name: z.string(),
    fromVersion: z.number().int().positive(),
    toVersion: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('systemPromptChanged') }),
]);

/** Ce que le Directeur a décidé pour un tour, réduit à ce qui compare les tours ; une direction en échec n'a rien décidé. */
export const turnDirectionMetricsSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), tension: tensionTargetSchema, nudges: z.array(nudgeTypeSchema) }),
  z.object({ status: z.literal('error') }),
]);

/** Indicateurs d'un tour, légers, pour la ligne sous chaque réponse et les comparaisons entre tours. */
export const turnMetricsSchema = z.object({
  turnId: z.string().uuid(),
  durationMs: z.number().int().nonnegative(),
  cost: turnCostSchema,
  /** Tokens d'entrée du dernier appel du Narrateur ; nul sans appel mesuré. */
  narratorInputTokens: z.number().int().nonnegative().nullable(),
  /** Nul quand la comparaison est impossible : premier tour, ou configuration non enregistrée. */
  configurationChanges: z.array(turnConfigurationChangeSchema).nullable(),
  /** Nulle quand le tour s'est déroulé sans Directeur. */
  direction: turnDirectionMetricsSchema.nullable(),
});
export const turnMetricsListSchema = z.array(turnMetricsSchema);
