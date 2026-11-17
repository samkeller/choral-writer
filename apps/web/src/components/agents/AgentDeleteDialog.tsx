import { useState } from 'react';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { Agent } from '@choral-writer/shared';

import { deleteAgent } from '../../api/agents.js';
import { getErrorMessage } from '../../api/client.js';

export function AgentDeleteDialog({ agent, onClose, onDeleted }: {
  agent: Agent;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function remove() {
    setPending(true);
    setError('');
    try {
      await deleteAgent(agent.id);
      onDeleted();
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal opened onClose={() => { if (!pending) onClose(); }} title="Supprimer l’agent"
      closeOnEscape={!pending} closeOnClickOutside={!pending} withCloseButton={!pending}>
      <Stack>
        <Text size="sm">
          Supprimer « {agent.versions[0]?.name} » et ses versions ?
          Les agents utilisés par un projet ou fournis par défaut sont protégés.
        </Text>
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={pending}>Annuler</Button>
          <Button color="red" loading={pending} onClick={() => void remove()}>Confirmer la suppression</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
