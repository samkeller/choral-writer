import { useEffect, useState } from 'react';
import type { Agent, ProjectAgentsInput } from '@choral-writer/shared';
import { listAgents, listProjectAgents } from '../api/agents/agentsApi';
import { getErrorMessage } from '../api/client';

/**
 * Un projet a exactement un narrateur et un gardien, et au plus un Directeur :
 * choisir une version pour ces contrats remplace celle de l'agent précédent,
 * alors que les agents d'analyse s'ajoutent à la sélection.
 */
export function selectVersion(
  ids: string[], agents: Agent[], output: Agent['output'], versionId: string,
): string[] {
  if (output === 'envelope') return ids.includes(versionId) ? ids : [...ids, versionId];
  const previous = new Set(agents.filter((agent) => agent.output === output)
    .flatMap((agent) => agent.versions.map((version) => version.id)));
  // Le remplacement garde la position de la version précédente pour stabiliser l'ordre d'enregistrement.
  const next: string[] = [];
  let placed = false;
  for (const id of ids) {
    if (previous.has(id) || id === versionId) {
      if (!placed) { next.push(versionId); placed = true; }
    } else {
      next.push(id);
    }
  }
  return placed ? next : [...next, versionId];
}

/**
 * Active un agent facultatif (analyse ou Directeur) avec sa dernière version, ou le
 * retire de l'équipe. Activer un Directeur remplace celui qui était retenu.
 */
export function toggleOptionalAgent(ids: string[], agents: Agent[], agent: Agent, enabled: boolean): string[] {
  const ownVersions = new Set(agent.versions.map((version) => version.id));
  const latest = agent.versions[0]?.id;
  if (!enabled) return ids.filter((id) => !ownVersions.has(id));
  if (!latest || ids.some((id) => ownVersions.has(id))) return ids;
  return selectVersion(ids, agents, agent.output, latest);
}

/** Remplace, à la même position, la version retenue d'un agent par une autre de ses versions. */
export function replaceVersion(ids: string[], agent: Agent, versionId: string): string[] {
  const ownVersions = new Set(agent.versions.map((version) => version.id));
  return ids.map((id) => ownVersions.has(id) ? versionId : id);
}

export function selectedVersion(agent: Agent, ids: string[]): Agent['versions'][number] | undefined {
  return agent.versions.find((version) => ids.includes(version.id));
}

/** Choix du Narrateur ou du Gardien : les versions de chaque agent de ce contrat, groupées par agent. */
export function requiredVersionOptions(agents: Agent[], output: Agent['output']) {
  return agents.filter((agent) => agent.output === output).map((agent) => ({
    group: agent.versions[0]?.name ?? agent.id,
    items: agent.versions.map((version) => ({ value: version.id, label: `${version.name} · v${version.version}` })),
  }));
}

/** Associe chaque version sélectionnée à son agent, comme l'attend l'API. */
export function agentSelections(versionIds: string[], agents: Agent[]): ProjectAgentsInput['agents'] {
  return versionIds.map((versionId) => {
    const agent = agents.find((entry) => entry.versions.some((version) => version.id === versionId));
    if (!agent) throw new Error('Une version sélectionnée n’est plus disponible. Rechargez la configuration.');
    return { agentId: agent.id, versionId };
  });
}

type TeamStart = {
  /** Versions de départ ; à défaut, l'équipe du projet. */
  versionIds?: string[];
  /** Version proposée en remplacement de celle de l'équipe du projet pour le même rôle. */
  suggestedVersion?: string | null;
};

/**
 * Édite une équipe d'agents en mémoire, à partir de la bibliothèque. Ce hook
 * n'enregistre rien : c'est à l'appelant de décider quoi faire de la sélection.
 */
export function useAgentTeam(projectId: string, { versionIds: startIds, suggestedVersion }: TeamStart = {}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [versionIds, setVersionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const startKey = startIds?.join(',');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const start = startKey === undefined
      ? listProjectAgents(projectId, controller.signal) : Promise.resolve(null);
    Promise.all([listAgents(controller.signal), start])
      .then(([library, assignments]) => {
        if (controller.signal.aborted) return;
        setAgents(library);
        setVersionIds(assignments
          ? withSuggestion(library, assignments, suggestedVersion)
          : startKey ? startKey.split(',') : []);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(failure));
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, startKey, suggestedVersion, revision]);

  /**
   * Intègre, sans attendre un rechargement, un agent créé ou la version qu'on vient
   * de publier. Un agent créé rejoint l'équipe et pilote le contrat de sortie déjà
   * pourvu ; une nouvelle version remplace celle de son agent s'il est dans l'équipe,
   * sans y faire entrer un agent qui n'y était pas.
   */
  function adopt(agent: Agent) {
    const versionId = agent.versions[0]?.id;
    if (!versionId) return;
    const created = !agents.some((entry) => entry.id === agent.id);
    setAgents((current) => [agent, ...current.filter((entry) => entry.id !== agent.id)]);
    setVersionIds((current) => {
      if (!created && !selectedVersion(agent, current)) return current;
      return selectVersion(replaceVersion(current, agent, versionId), agents, agent.output, versionId);
    });
  }

  return {
    agents, versionIds, loading, error, change: setVersionIds, adopt,
    reload: () => setRevision((value) => value + 1),
  };
}

function withSuggestion(
  library: Agent[], assignments: { agentId: string; versionId: string; output: Agent['output'] }[],
  suggestedVersion: string | null | undefined,
): string[] {
  const suggested = library.find((agent) => agent.versions.some((version) => version.id === suggestedVersion));
  if (!suggested || !suggestedVersion) return assignments.map((assignment) => assignment.versionId);
  const retained = assignments.filter((assignment) => suggested.output === 'envelope'
    ? assignment.agentId !== suggested.id : assignment.output !== suggested.output);
  return [...retained.map((assignment) => assignment.versionId), suggestedVersion];
}
