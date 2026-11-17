import { Modal } from '@mantine/core';
import type { Agent, AgentInput, AgentVersionInput } from '@choral-writer/shared';

import { createAgent, publishAgentVersion } from '../../api/agents/agentsApi';
import { AgentForm } from './AgentForm';

export function AgentEditor({ agent, onClose, onSaved }: {
  agent: Agent | null;
  onClose: () => void;
  onSaved: (agent: Agent) => void;
}) {
  async function create(input: AgentInput) {
    onSaved(await createAgent(input));
  }

  async function publish(input: AgentVersionInput) {
    if (!agent) throw new Error('Aucun agent sélectionné.');
    const latest = agent.versions[0];
    if (!latest) throw new Error('Cet agent n’a aucune version.');
    onSaved(await publishAgentVersion(agent.id, { ...input, expectedVersion: latest.version }));
  }

  return (
    <Modal opened onClose={onClose} size="lg" title={agent ? 'Nouvelle version' : 'Créer un agent'}>
      {agent
        ? <AgentForm initial={agent} onSubmit={publish} onCancel={onClose} />
        : <AgentForm onSubmit={create} onCancel={onClose} />}
    </Modal>
  );
}
