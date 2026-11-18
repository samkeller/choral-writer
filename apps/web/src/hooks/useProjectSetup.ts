import { useEffect, useState } from 'react';
import type { Agent } from '@choral-writer/shared';
import { configureProjectAgents, listAgents, listProjectAgents } from '../api/agents/agentsApi';
import { getErrorMessage } from '../api/client';

/**
 * Un projet a exactement un narrateur et un gardien : choisir une version pour
 * ces contrats remplace celle de l'agent précédent, alors que les agents
 * d'analyse s'ajoutent à la sélection.
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

export function useProjectSetup(projectId: string, suggestedVersion?: string | null) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [versionIds, setVersionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([listAgents(controller.signal), listProjectAgents(projectId, controller.signal)])
      .then(([library, assignments]) => {
        if (controller.signal.aborted) return;
        const suggested = library.find((agent) => agent.versions.some((version) => version.id === suggestedVersion));
        const retained = suggested ? assignments.filter((assignment) =>
          suggested.output === 'envelope'
            ? assignment.agentId !== suggested.id : assignment.output !== suggested.output) : assignments;
        const assigned = [...retained.map((assignment) => assignment.versionId),
          ...(suggested && suggestedVersion ? [suggestedVersion] : [])];
        setAgents(library);
        setVersionIds(assigned);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(getErrorMessage(failure));
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, suggestedVersion, revision]);

  function change(ids: string[]) {
    setVersionIds(ids);
    setSaved(false);
  }

  /**
   * Intègre un agent créé depuis la bibliothèque dans l'équipe du projet sans
   * attendre un rechargement : il pilote alors le contrat de sortie déjà pourvu.
   */
  function adopt(agent: Agent) {
    const versionId = agent.versions[0]?.id;
    if (!versionId) return;
    setAgents((current) => [agent, ...current.filter((entry) => entry.id !== agent.id)]);
    setVersionIds((current) => selectVersion([...current, versionId], agents, agent.output, versionId));
    setSaved(false);
  }

  async function save() {
    setPending(true);
    setError('');
    setSaved(false);
    try {
      const selections = versionIds.map((versionId) => {
        const agent = agents.find((entry) => entry.versions.some((version) => version.id === versionId));
        if (!agent) throw new Error('Une version sélectionnée n’est plus disponible. Rechargez la configuration.');
        return { agentId: agent.id, versionId };
      });
      await configureProjectAgents(projectId, { agents: selections });
      setSaved(true);
      return true;
    } catch (failure) {
      setError(getErrorMessage(failure));
      return false;
    } finally {
      setPending(false);
    }
  }
  return {
    agents, versionIds, loading, pending, error, saved, change, save, adopt,
    reload: () => setRevision((value) => value + 1),
  };
}
