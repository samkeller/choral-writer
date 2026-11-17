import { useEffect, useState } from 'react';
import type { Agent } from '@choral-writer/shared';
import { configureProjectAgents, listAgents, listProjectAgents } from '../api/agents/agentsApi';
import { getErrorMessage } from '../api/client';

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
        setAgents(library);
        setVersionIds([...retained.map((assignment) => assignment.versionId),
          ...(suggested && suggestedVersion ? [suggestedVersion] : [])]);
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
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setPending(false);
    }
  }
  return {
    agents, versionIds, loading, pending, error, saved, change, save,
    reload: () => setRevision((value) => value + 1),
  };
}
