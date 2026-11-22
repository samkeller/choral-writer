import { useState } from 'react';
import type { Agent } from '@choral-writer/shared';
import { configureProjectAgents } from '../api/agents/agentsApi';
import { getErrorMessage } from '../api/client';
import { agentSelections, useAgentTeam } from './useAgentTeam';

/** The project's team, edited in memory and saved explicitly. */
export function useProjectSetup(projectId: string, suggestedVersion?: string | null) {
  const team = useAgentTeam(projectId, { suggestedVersion });
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);

  function change(ids: string[]) {
    team.change(ids);
    setSaved(false);
  }

  function adopt(agent: Agent) {
    team.adopt(agent);
    setSaved(false);
  }

  async function save() {
    setPending(true);
    setSaveError('');
    setSaved(false);
    try {
      await configureProjectAgents(projectId, { agents: agentSelections(team.versionIds, team.agents) });
      setSaved(true);
      return true;
    } catch (failure) {
      setSaveError(getErrorMessage(failure));
      return false;
    } finally {
      setPending(false);
    }
  }
  return {
    agents: team.agents, versionIds: team.versionIds, loading: team.loading,
    error: saveError || team.error, pending, saved, change, save, adopt,
    reload: () => { setSaveError(''); team.reload(); },
  };
}
