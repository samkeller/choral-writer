import { Badge, Group, Paper, Spoiler, Stack, Text } from '@mantine/core';
import type { MemoryRead, TurnConfiguration, TurnConfigurationChange } from '@choral-writer/shared';

import { agentOutputPresentation } from '../../agents/agentPresentation';
import { PhaseTag } from '../../phases/PhaseTag';
import { DrawerBlock } from './DrawerBlock';

function memoryAccessLabel(read: MemoryRead | null | undefined): string {
  if (!read || read.mode === 'none') return 'Aucun accès mémoire';
  if (read.mode === 'all') return 'Toute la mémoire';
  return `${read.tagIds.length} tag(s) mémoire`;
}

const changeColor = {
  agentAdded: 'green', agentRemoved: 'red', agentChanged: 'blue', systemPromptChanged: 'blue',
} satisfies Record<TurnConfigurationChange['kind'], string>;

export function configurationChangeLabel(change: TurnConfigurationChange): string {
  switch (change.kind) {
    case 'agentAdded': return `+ ${change.name} v${change.version}`;
    case 'agentRemoved': return `− ${change.name} v${change.version}`;
    case 'agentChanged': return `${change.name} v${change.fromVersion} → v${change.toVersion}`;
    case 'systemPromptChanged': return 'Prompt du projet modifié';
  }
}

/**
 * The configuration a turn actually ran with, as recorded when it started, and what changed since the previous turn.
 * `changes` is undefined when the story metrics could not be loaded.
 */
export function TurnConfigurationPanel({ configuration, changes, turnNumber }: {
  configuration: TurnConfiguration | null;
  changes: TurnConfigurationChange[] | null | undefined;
  turnNumber: number;
}) {
  return (
    <Stack gap="sm">
      {changes !== undefined && (
        <DrawerBlock title="Depuis le tour précédent">
          <ConfigurationChanges changes={changes} turnNumber={turnNumber} />
        </DrawerBlock>
      )}
      {configuration
        ? <RecordedConfiguration configuration={configuration} />
        : <Text c="dimmed">Configuration non enregistrée : ce tour précède l’enregistrement des configurations.</Text>}
    </Stack>
  );
}

function ConfigurationChanges({ changes, turnNumber }: { changes: TurnConfigurationChange[] | null; turnNumber: number }) {
  if (turnNumber === 1) return <Text size="sm" c="dimmed">Premier tour du récit : rien à comparer.</Text>;
  if (changes === null) {
    return <Text size="sm" c="dimmed">Comparaison impossible : la configuration d’un des deux tours n’est pas enregistrée.</Text>;
  }
  if (changes.length === 0) return <Text size="sm" c="dimmed">Aucun changement depuis le tour précédent.</Text>;
  return (
    <Group gap={6}>
      {changes.map((change) => {
        const label = configurationChangeLabel(change);
        return <Badge key={label} variant="light" tt="none" color={changeColor[change.kind]}>{label}</Badge>;
      })}
    </Group>
  );
}

function RecordedConfiguration({ configuration }: { configuration: TurnConfiguration }) {
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
