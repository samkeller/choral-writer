import { z } from 'zod';

import { chatBranchParamsSchema } from './branch.js';
import { messageDtoSchema, messageSchema } from './message.js';
import { memoryResultSchema } from '../../memories.js';
import { projectAgentSchema } from '../../agents.js';

export const chatTurnParamsSchema = chatBranchParamsSchema.extend({ turnId: z.string().uuid() });
export const chatExecutionParamsSchema = chatTurnParamsSchema.omit({ branchId: true });

/** A turn is one pipeline execution, not a mutable pair of chat bubbles. */
export const chatTurnDtoSchema = z.object({
  id: z.string().uuid(),
  parentTurnId: z.string().uuid().nullable(),
  originBranchId: z.string().uuid(),
  retryOfTurnId: z.string().uuid().nullable(),
  regeneratedFromTurnId: z.string().uuid().nullable(),
  status: z.enum(['running', 'completed', 'failed']),
  error: z.string().nullable(),
  userMessage: messageDtoSchema,
  assistantMessage: messageDtoSchema.nullable(),
  memory: memoryResultSchema.nullable().optional(),
});

export const chatTurnSchema = chatTurnDtoSchema.extend({
  userMessage: messageSchema,
  assistantMessage: messageSchema.nullable(),
});
/**
 * The exact configuration a turn ran with, frozen when it starts. Agent versions are immutable,
 * so their instructions stay reachable through versionId; the project prompt is mutable and copied.
 */
export const turnConfigurationSchema = z.object({
  systemPrompt: z.string(),
  agents: projectAgentSchema.omit({ instructions: true }).array(),
});
export type TurnConfiguration = z.infer<typeof turnConfigurationSchema>;
