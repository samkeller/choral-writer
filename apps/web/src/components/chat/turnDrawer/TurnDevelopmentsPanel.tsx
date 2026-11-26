import { Badge, Group, Stack, Text } from '@mantine/core';
import type { AttributedDevelopment, TurnDevelopments } from '@choral-writer/shared';

import { DrawerBlock } from './DrawerBlock';

/**
 * What happened in the story world during the turn, split by scope. An off-screen development is a fact
 * the Narrator never received: only the Guardian records it.
 */
export function TurnDevelopmentsPanel({ developments }: { developments: TurnDevelopments | null }) {
  if (!developments) {
    return <Text c="dimmed">Développements non enregistrés : ce tour précède leur enregistrement.</Text>;
  }
  return (
    <Stack gap="sm">
      <DrawerBlock title="Dans la scène">
        <DevelopmentList developments={developments.scene} empty="Aucun développement dans la scène à ce tour." />
      </DrawerBlock>
      <DrawerBlock title="Hors champ">
        <DevelopmentList developments={developments.offscreen} empty="Aucun développement hors champ à ce tour." />
      </DrawerBlock>
    </Stack>
  );
}

function DevelopmentList({ developments, empty }: { developments: AttributedDevelopment[]; empty: string }) {
  if (developments.length === 0) return <Text size="sm" c="dimmed">{empty}</Text>;
  return (
    <Stack gap="xs">
      {developments.map(({ agent, item }, index) => (
        <Stack key={`${agent}-${index}`} gap={4}>
          <Group gap="xs">
            <Text size="xs" fw={600}>{agent}</Text>
            {item.characters.map((character) => (
              <Badge key={character} size="xs" variant="light" color="gray" tt="none">{character}</Badge>
            ))}
          </Group>
          <Text size="sm">{item.text}</Text>
        </Stack>
      ))}
    </Stack>
  );
}
