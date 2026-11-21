import { Badge, Group, Paper, Spoiler, Stack, Text } from '@mantine/core';
import type { MemoryRead, TurnConfiguration } from '@choral-writer/shared';

import { agentOutputPresentation } from '../agents/agentPresentation';
import { PhaseTag } from '../phases/PhaseTag';

function memoryAccessLabel(read: MemoryRead | null | undefined): string {
  if (!read || read.mode === 'none') return 'Aucun accès mémoire';
  if (read.mode === 'all') return 'Toute la mémoire';
  return `${read.tagIds.length} tag(s) mémoire`;
}

/** The configuration a turn actually ran with, as recorded when it started. */
export function TurnConfigurationPanel({ configuration }: { configuration: TurnConfiguration | null }) {
  if (!configuration) {
    return <Text c="dimmed">Configuration non enregistrée : ce tour précède l’enregistrement des configurations.</Text>;
  }

  return (
    <Stack gap="md">
      <Paper p="sm" withBorder>
        <Text fw={600} mb="xs">Agents</Text>
        <Stack gap="xs">
          {configuration.agents.map((agent) => (
            <Group key={agent.agentId} justify="space-between" gap="xs" wrap="nowrap">
              <Group gap="xs" wrap="nowrap" miw={0}>
                <PhaseTag phase={agent.phase} />
                <Text size="sm" fw={500} truncate>{agent.name}</Text>
                <Badge size="xs" variant="outline" color="gray">v{agent.version}</Badge>
              </Group>
              <Text size="xs" c="dimmed" ta="right">
                {agentOutputPresentation[agent.output].label} · {memoryAccessLabel(agent.memoryRead)}
              </Text>
            </Group>
          ))}
        </Stack>
      </Paper>
      <Paper p="sm" withBorder>
        <Text fw={600} mb="xs">Prompt du projet</Text>
        {configuration.systemPrompt
          ? (
            <Spoiler maxHeight={120} showLabel="Afficher tout" hideLabel="Réduire">
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{configuration.systemPrompt}</Text>
            </Spoiler>
          )
          : <Text size="sm" c="dimmed">Prompt vide.</Text>}
      </Paper>
    </Stack>
  );
}
