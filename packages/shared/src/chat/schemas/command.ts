import { z } from 'zod';

import { projectAgentsInputSchema } from '../../agents.js';
import { projectInputSchema } from '../../projects.js';
import { chatBranchParamsSchema } from './branch.js';
import { messageInputSchema } from './message.js';
import { chatTurnParamsSchema } from './turn.js';

export const headInputSchema = z.object({
  expectedHeadTurnId: z.string().uuid().nullable(),
  allowLegacyMemoryReset: z.boolean().optional(),
}).strict();

export const sendMessageSchema = headInputSchema.merge(messageInputSchema);

/** Replaces the project's configuration for one regeneration or retry only; the project itself is unchanged. */
export const replayConfigurationSchema = projectAgentsInputSchema.extend({
  systemPrompt: projectInputSchema.shape.systemPrompt,
}).strict();
/** Regenerating or retrying the last turn may run with a replacement configuration. */
export const replayInputSchema = headInputSchema.extend({
  configuration: replayConfigurationSchema.optional(),
}).strict();
export const chatOperationSchema = z.enum(['send', 'regenerate', 'retry']);
export const chatCommandSchema = z.discriminatedUnion('operation', [
  chatBranchParamsSchema.merge(sendMessageSchema).extend({ operation: z.literal('send') }).strict(),
  chatTurnParamsSchema.merge(replayInputSchema).extend({ operation: z.literal('regenerate') }).strict(),
  chatTurnParamsSchema.merge(replayInputSchema).extend({ operation: z.literal('retry') }).strict(),
]);
