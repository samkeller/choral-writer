import { Badge, Code, Group, Paper, Stack, Text } from '@mantine/core';
import type { Agent } from '@choral-writer/shared';
import styles from './AgentSurface.module.css';

export const outputLabels = {
  envelope: 'Analyse · Enveloppe whiteboard',
  narrative: 'Restitution · Réponse utilisateur',
  memory_proposals: 'Restitution · Propositions mémoire',
};

export function AgentVersionDetails({ output, version }: {
  output: Agent['output'];
  version: Agent['versions'][number];
}) {
  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Badge variant="light" color={output === 'envelope' ? 'blue' : 'choral'}>{outputLabels[output]}</Badge>
        <Badge variant="outline" color="gray">v{version.version}</Badge>
      </Group>
      <Text fw={500}>{version.name}</Text>
      <Code>{version.instructions || 'Aucune instruction supplémentaire au prompt du projet.'}</Code>
    </Stack>
  );
}
