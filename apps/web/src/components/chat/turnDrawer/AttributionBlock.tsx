import { Alert, Badge, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';

import { phasePresentation } from '../../phases/phasePresentation';
import { formatCost } from '../turnFormat';
import { verdictPresentation } from './attributionPresentation';
import { DrawerBlock } from './DrawerBlock';
import type { TurnAttributionHandle } from './useTurnAttribution';

/** « Ce qui s'est passé » : a reading of the prose, then what it made of each contribution the Narrator received. */
export function AttributionBlock({ attribution }: { attribution: TurnAttributionHandle }) {
  const { state } = attribution;
  const aside = state.status === 'ready' && (
    <Group gap="xs">
      <Text size="xs" c="dimmed">
        Attribution : {formatCost(state.response.cost)}
        {state.response.cost.calls > 1 && ` (${state.response.cost.calls} appels)`} · hors coût du tour
      </Text>
      <Button size="compact-xs" variant="subtle" leftSection={<IconRefresh size={12} />} onClick={attribution.regenerate}>
        Régénérer
      </Button>
    </Group>
  );

  return (
    <DrawerBlock title="Ce qui s’est passé" aside={aside}>
      {state.status === 'unavailable' && (
        <Text size="sm" c="dimmed">Ce tour n’a pas de prose : il n’y a rien à attribuer.</Text>
      )}
      {(state.status === 'waiting' || state.status === 'loading') && (
        <Group gap="xs">
          <Loader size="xs" color="choral" />
          <Text size="sm" c="dimmed">Lecture de la prose par un petit appel LLM, calculée une seule fois pour ce tour…</Text>
        </Group>
      )}
      {state.status === 'error' && (
        <Alert color="red" title="Attribution impossible" role="alert">
          <Stack gap="xs">
            <Text size="sm">{state.error}</Text>
            <Button size="compact-sm" variant="light" w="fit-content" leftSection={<IconRefresh size={14} />}
              onClick={attribution.retry}>
              Réessayer
            </Button>
          </Stack>
        </Alert>
      )}
      {state.status === 'ready' && (
        <Stack gap={6}>
          <Text size="sm" fw={600}>{state.response.attribution.whatHappened}</Text>
          {state.response.attribution.contributions.length === 0
            ? <Text size="xs" c="dimmed">Aucune contribution n’a été transmise au Narrateur.</Text>
            : (
              <Stack gap={4} role="list" aria-label="Attribution des contributions">
                {state.response.attribution.contributions.map(({ agent, item, verdict, note }, position) => (
                  <Group key={`${agent}-${position}`} gap="xs" wrap="nowrap" align="flex-start" role="listitem">
                    <Badge size="sm" variant="light" color={phasePresentation.analysis.color} tt="none">{agent}</Badge>
                    <Text size="sm" style={{ flex: 1 }}>proposait « {item.text} »</Text>
                    <Stack gap={0} align="flex-end">
                      <Badge size="xs" variant="light" color={verdictPresentation[verdict].color} tt="none">
                        {verdictPresentation[verdict].label}
                      </Badge>
                      {note && <Text size="xs" c="dimmed">{note}</Text>}
                    </Stack>
                  </Group>
                ))}
              </Stack>
            )}
        </Stack>
      )}
    </DrawerBlock>
  );
}
