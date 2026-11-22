import type { ChatCommand, ProjectAgent } from '@choral-writer/shared';

import type { ChatTransactionContext } from '../types/chat.types.js';

export type PipelineConfiguration = { systemPrompt: string; agents: ProjectAgent[] };

/**
 * A regeneration or a retry may run with a replacement configuration. Otherwise a
 * retry repeats the failed turn's configuration and any other run uses the project's.
 */
export async function pipelineConfiguration(
  context: ChatTransactionContext, command: ChatCommand,
): Promise<PipelineConfiguration> {
  if (command.operation !== 'send' && command.configuration) {
    return {
      systemPrompt: command.configuration.systemPrompt,
      agents: await context.resolveAgents(command.configuration.agents),
    };
  }
  if (command.operation === 'retry') return recordedConfiguration(context, command.turnId);
  return projectConfiguration(context);
}

/**
 * The configuration a turn ran with, resolved again from its pinned versions and
 * memory access. A turn recorded before configurations were saved falls back to the project's.
 */
export async function recordedConfiguration(
  context: ChatTransactionContext, turnId: string,
): Promise<PipelineConfiguration> {
  const recorded = await context.turns.configuration(turnId);
  if (!recorded) return projectConfiguration(context);
  const memoryReads = new Map(recorded.agents.map((agent) => [agent.agentId, agent.memoryRead]));
  const resolved = await context.resolveAgents(recorded.agents.map(({ agentId, versionId }) => ({ agentId, versionId })));
  return {
    systemPrompt: recorded.systemPrompt,
    agents: resolved.map((agent) => ({ ...agent, memoryRead: memoryReads.get(agent.agentId) ?? null })),
  };
}

function projectConfiguration(context: ChatTransactionContext): PipelineConfiguration {
  return { systemPrompt: context.project.systemPrompt, agents: context.projectAgents };
}
