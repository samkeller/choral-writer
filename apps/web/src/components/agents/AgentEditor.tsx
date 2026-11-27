import { Modal } from '@mantine/core';
import type { Agent, AgentInput, AgentVersionInput } from '@choral-writer/shared';

import { createAgent, publishNextVersion } from '../../api/agents/agentsApi';
import { AgentForm } from './AgentForm';

export function AgentEditor({ agent, output, onClose, onSaved }: {
  agent: Agent | null;
  /** For a new agent: the role it is created for, which the form then keeps. */
  output?: Agent['output'];
  onClose: () => void;
  onSaved: (agent: Agent) => void;
}) {
  async function create(input: AgentInput) {
    onSaved(await createAgent(input));
  }

  async function publish(input: AgentVersionInput) {
    if (!agent) throw new Error('Aucun agent sélectionné.');
    onSaved(await publishNextVersion(agent, input));
  }

  return (
    <Modal opened onClose={onClose} size="lg" title={agent ? 'Nouvelle version' : 'Créer un agent'}>
      {agent
        ? <AgentForm initial={agent} onSubmit={publish} onCancel={onClose} />
        : <AgentForm output={output} onSubmit={create} onCancel={onClose} />}
    </Modal>
  );
}
