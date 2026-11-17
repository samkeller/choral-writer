import { Badge, Group, Stack, Text } from '@mantine/core';
import type { Agent } from '@choral-writer/shared';

import { PromptDisplay } from '../llm/PromptDisplay';
import { PhaseTag } from '../phases/PhaseTag';
import styles from './AgentSurface.module.css';
import { agentOutputPresentation } from './agentPresentation';

export function AgentVersionDetails({ output, version }: {
  output: Agent['output'];
  version: Agent['versions'][number];
}) {
  return (
    <Stack gap="sm">
      <Group gap="xs">
        <PhaseTag phase={agentOutputPresentation[output].phase} />
        <Text size="xs" c="dimmed">{agentOutputPresentation[output].label}</Text>
        <Badge variant="outline" color="gray">v{version.version}</Badge>
      </Group>
      <Text fw={500} className={styles.name}>{version.name}</Text>
      <PromptDisplay content={version.instructions || 'Aucune instruction supplémentaire au prompt du projet.'} />
    </Stack>
  );
}
