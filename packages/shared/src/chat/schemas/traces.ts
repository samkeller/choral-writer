import { z } from 'zod';

import { analysisEnvelopeSchema } from '../../pipeline.js';
import { chatExecutionParamsSchema } from './turn.js';

export const traceStageSchema = z.enum(['analysis', 'narrator']);
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
});

export const traceCallDetailSchema = traceCallSummarySchema.extend({
  request: z.object({
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

export const narratorTraceSchema = z.object({
  status: traceStatusSchema,
  durationMs: z.number().int().nonnegative(),
  resolution: z.string().nullable(),
  prose: z.string().nullable(),
});

export const turnTraceSummarySchema = z.object({
  turnId: z.string().uuid(),
  analysis: z.array(analysisTraceSchema),
  narrator: narratorTraceSchema.nullable(),
  calls: z.array(traceCallSummarySchema),
});
