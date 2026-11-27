import type { AttributionVerdict, TurnAttribution, TurnConfiguration } from '@choral-writer/shared';

/** Which of the two compared versions a column shows. */
export type ComparedSide = 'original' | 'variant';

/** How a configuration element differs from the other version's. */
export type ConfigurationChange = 'same' | 'added' | 'removed' | 'changed';

export type ConfigurationBadge = { key: string; label: string; change: ConfigurationChange };

/**
 * One badge per element of a version's configuration, colored against the other version: an agent the other
 * lacks is added to the variant or removed from the original, an agent in another version is changed. Agents are
 * matched by identity, as the configuration changes between turns are.
 */
export function configurationBadges(
  own: TurnConfiguration, other: TurnConfiguration, side: ComparedSide,
): ConfigurationBadge[] {
  const others = new Map(other.agents.map((agent) => [agent.agentId, agent]));
  const agents = own.agents.map((agent): ConfigurationBadge => {
    const counterpart = others.get(agent.agentId);
    const change: ConfigurationChange = !counterpart
      ? side === 'variant' ? 'added' : 'removed'
      : counterpart.versionId === agent.versionId ? 'same' : 'changed';
    return { key: agent.agentId, label: `${agent.name} v${agent.version}`, change };
  });
  return [
    ...agents,
    { key: 'systemPrompt', label: 'Prompt du projet', change: own.systemPrompt === other.systemPrompt ? 'same' : 'changed' },
  ];
}

/** What the prose made of one agent's contributions, as counted by the attribution. */
export type AgentVerdict = { agent: string; counts: Record<AttributionVerdict, number> };

/** Agents in the order the Narrator read their contributions. */
export function agentVerdicts(attribution: TurnAttribution): AgentVerdict[] {
  const byAgent = new Map<string, AgentVerdict>();
  for (const { agent, verdict } of attribution.contributions) {
    const entry = byAgent.get(agent) ?? { agent, counts: { retenu: 0, partiel: 0, absent: 0 } };
    entry.counts[verdict] += 1;
    byAgent.set(agent, entry);
  }
  return [...byAgent.values()];
}

/** An agent's overall verdict: retained only if all of it shows, absent only if none of it does. */
export function overallVerdict({ counts }: AgentVerdict): AttributionVerdict {
  const total = counts.retenu + counts.partiel + counts.absent;
  if (counts.retenu === total) return 'retenu';
  if (counts.absent === total) return 'absent';
  return 'partiel';
}

export function wordCount(prose: string): number {
  return prose.split(/\s+/).filter(Boolean).length;
}
