import { z } from 'zod';

import { analysisEnvelopeSchema, turnDirectionSchema } from '../../pipeline.js';
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
  envelope: analysisEnvelopeSchema.nullable(),
});

/** A failed direction means the narrator fell back to the whole whiteboard. */
export const directionTraceSchema = z.object({
  agentId: z.string().uuid().nullable(),
  agentVersionId: z.string().uuid().nullable(),
  name: z.string(),
  status: traceStatusSchema,
  durationMs: z.number().int().nonnegative(),
  attempts: z.number().int().positive(),
  direction: turnDirectionSchema.nullable(),
});

export const narratorTraceSchema = z.object({
  status: traceStatusSchema,
  durationMs: z.number().int().nonnegative(),
  prose: z.string().nullable(),
});

export const turnTraceSummarySchema = z.object({
  turnId: z.string().uuid(),
  analysis: z.array(analysisTraceSchema),
  /** Null when the turn ran without a Director. */
  direction: directionTraceSchema.nullable(),
  narrator: narratorTraceSchema.nullable(),
  calls: z.array(traceCallSummarySchema),
  cost: turnCostSchema,
  /** Null for a turn that started before configurations were recorded. */
  configuration: turnConfigurationSchema.nullable(),
});
