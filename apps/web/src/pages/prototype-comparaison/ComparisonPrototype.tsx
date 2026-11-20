// PROTOTYPE — « Prototype : rejouer un tour avec une autre configuration et comparer ».
// Itération 2 : la comparaison s'ouvre en grand tiroir par-dessus le récit réel (comme le tiroir Debug),
// prose complète au premier plan. /projects/:projectId?compare=1. Données fictives, aucune mutation.
// Les variantes A, B et C de l'itération 1 sont dans l'historique de la branche.
import { useState } from 'react';
import { Badge, Box, Button, Drawer, Group, Paper, ScrollArea, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconArrowsShuffle } from '@tabler/icons-react';

import { ReplayModal } from './ReplayModal';
import { type ConfigChange, type TurnVersion, type Verdict, original, totalCost, usd, variant } from './fixtures';

const verdictColor: Record<Verdict, string> = { retenu: 'green', partiel: 'yellow', ignoré: 'gray' };
const changeColor: Record<ConfigChange, string> = { same: 'gray', added: 'green', removed: 'red', changed: 'blue' };

export function ComparisonPrototype() {
  const [opened, setOpened] = useState(true);
  const [replayOpen, setReplayOpen] = useState(false);

  return (
    <>
      <Paper p={6} withBorder bg="yellow.4" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1000 }}>
        <Group gap="xs">
          <Text size="xs" fw={700} c="dark.9">PROTOTYPE</Text>
          <Button size="compact-xs" color="dark" leftSection={<IconArrowsShuffle size={14} />} onClick={() => setReplayOpen(true)}>
            Rejouer le dernier tour avec…
          </Button>
          <Button size="compact-xs" color="dark" variant="outline" onClick={() => setOpened(true)}>Ouvrir la comparaison</Button>
        </Group>
      </Paper>
      <ReplayModal opened={replayOpen} onClose={() => setReplayOpen(false)} onLaunch={() => setOpened(true)} />
      <Drawer opened={opened} onClose={() => setOpened(false)} position="right" size="92%" padding="sm"
        title={<Text fw={700}>Comparer 2 versions du dernier tour</Text>}
        styles={{ body: { display: 'flex', flexDirection: 'column', height: 'calc(100% - 60px)' } }}>
        <SimpleGrid cols={2} spacing="sm" style={{ flex: 1, minHeight: 0 }}>
          <Column version={original} />
          <Column version={variant} />
        </SimpleGrid>
        <Group justify="flex-end" gap="xs" pt="sm" style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
          <Text size="xs" c="dimmed" mr="auto">
            Adopter la variante : sa configuration devient celle du projet et le récit continue sur sa branche.
          </Text>
          <Button size="compact-sm" variant="subtle" onClick={() => setOpened(false)}>Garder l’original</Button>
          <Button size="compact-sm" onClick={() => setOpened(false)}>Adopter la variante</Button>
        </Group>
      </Drawer>
    </>
  );
}

function Column({ version }: { version: TurnVersion }) {
  return (
    <Stack gap={6} style={{ minHeight: 0 }}>
      <Group gap={6} justify="space-between" wrap="nowrap">
        <Group gap={6}>
          <Text fw={700} size="sm">{version.label}</Text>
          <Badge size="xs" variant="outline">{version.branchName}</Badge>
        </Group>
        <Text size="xs" c="dimmed">{usd(totalCost(version))} · {version.durationS} s · {version.words} mots</Text>
      </Group>
      <Group gap={4}>
        {version.agents.map((agent) => (
          <Badge key={agent.name} size="xs" variant="light" color={changeColor[agent.change]}>{agent.name} {agent.version}</Badge>
        ))}
        <Badge size="xs" variant="light" color={changeColor[version.narrator.change]}>Narrateur {version.narrator.version}</Badge>
      </Group>
      <Text size="xs" fs="italic">{version.summary}</Text>
      <Group gap={4}>
        {version.agents.map((agent) => agent.verdict && (
          <Badge key={agent.name} size="xs" variant="dot" color={verdictColor[agent.verdict]} title={agent.proposal ?? undefined}>
            {agent.name} : {agent.verdict}
          </Badge>
        ))}
      </Group>
      <ScrollArea style={{ flex: 1 }} type="auto" offsetScrollbars>
        <Box pr="xs">
          <Stack gap="sm">{version.prose.map((paragraph, i) => <Text key={i} size="sm" lh={1.6}>{paragraph}</Text>)}</Stack>
        </Box>
      </ScrollArea>
    </Stack>
  );
}
