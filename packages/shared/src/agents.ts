import { z } from 'zod';
import { dateFromJsonSchema } from './dates.js';

export const agentPhaseSchema = z.enum(['analysis', 'restitution']);
export const agentOutputSchema = z.enum(['envelope', 'narrative', 'memory_proposals']);
export const agentDefinitionSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('analysis'), output: z.literal('envelope') }),
  z.object({ phase: z.literal('restitution'), output: z.enum(['narrative', 'memory_proposals']) }),
]);
export const agentVersionInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(50_000),
}).strict();
export const agentInputSchema = agentVersionInputSchema.extend({
  phase: agentPhaseSchema, output: agentOutputSchema,
}).superRefine((input, context) => {
  if (!agentDefinitionSchema.safeParse(input).success) {
    context.addIssue({ code: 'custom', message: 'Contrat de sortie incompatible avec la phase.', path: ['output'] });
  }
});
export const publishAgentVersionSchema = agentVersionInputSchema.extend({
  expectedVersion: z.number().int().positive(),
});
export const agentVersionDtoSchema = agentVersionInputSchema.extend({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
});
export const agentDtoSchema = z.object({
  id: z.string().uuid(),
  phase: agentPhaseSchema,
  output: agentOutputSchema,
  createdAt: z.string().datetime(),
  versions: agentVersionDtoSchema.array().min(1),
  projects: z.object({
    id: z.string().uuid(),
    name: z.string(),
    versionId: z.string().uuid(),
  }).array(),
});
export const agentVersionSchema = agentVersionDtoSchema.extend({ createdAt: dateFromJsonSchema });
export const agentSchema = agentDtoSchema.extend({
  createdAt: dateFromJsonSchema,
  versions: agentVersionSchema.array().min(1),
});
export const agentParamsSchema = z.object({ agentId: z.string().uuid() });
export const projectAgentSelectionSchema = z.object({
  agentId: z.string().uuid(),
  versionId: z.string().uuid(),
}).strict();
export const projectAgentsInputSchema = z.object({
  agents: projectAgentSelectionSchema.array().max(100),
}).strict();
export const projectAgentSchema = projectAgentSelectionSchema.extend({
  phase: agentPhaseSchema,
  output: agentOutputSchema,
  version: z.number().int().positive(),
  name: z.string(),
  instructions: z.string(),
});
export type AgentPhase = z.infer<typeof agentPhaseSchema>;
export type AgentInput = z.infer<typeof agentInputSchema>;
export type AgentVersionInput = z.infer<typeof agentVersionInputSchema>;
export type PublishAgentVersion = z.infer<typeof publishAgentVersionSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type AgentDto = z.infer<typeof agentDtoSchema>;
export type ProjectAgent = z.infer<typeof projectAgentSchema>;
export type ProjectAgentsInput = z.infer<typeof projectAgentsInputSchema>;
