import { Alert, Badge, Button, Group, Loader, Stack, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import type { TurnAttribution, TurnAttributionResponse } from '@choral-writer/shared';

import { phasePresentation } from '../../phases/phasePresentation';
import { formatCost } from '../turnFormat';
import { verdictPresentation } from './attributionPresentation';
import { DrawerBlock } from './DrawerBlock';
import type { TurnAttributionHandle } from './useTurnAttribution';

/** « Ce qui s'est passé » : a reading of the prose, then what it made of each contribution the Narrator received. */
export function AttributionBlock({ attribution }: { attribution: TurnAttributionHandle }) {
  const { state } = attribution;
  const response = state.status === 'ready' ? state.response : null;
  const aside = response && (
    <Group gap="xs">
      <Text size="xs" c="dimmed">{describeCost(response.cost)}</Text>
      {response.attribution && (
        <Button size="compact-xs" variant="subtle" leftSection={<IconRefresh size={12} />} onClick={attribution.regenerate}>
          Régénérer
        </Button>
      )}
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
      {state.status === 'error' && <Failure message={state.error} onRetry={attribution.retry} />}
      {response && (
        <Stack gap="sm">
          {response.failure && (
            <Failure message={response.failure.message} onRetry={attribution.retry}
              detail={response.attribution ? 'La lecture précédente reste affichée ci-dessous.' : undefined} />
          )}
          {response.attribution && <Reading attribution={response.attribution} />}
        </Stack>
      )}
    </DrawerBlock>
  );
}

/** Every attribution call of the turn, failed attempts included, kept apart from the turn's own cost. */
function describeCost(cost: TurnAttributionResponse['cost']): string {
  const calls = cost.calls > 1 ? ` (${cost.calls} appels)` : '';
  return `Attribution : ${formatCost(cost)}${calls} · hors coût du tour`;
}

function Failure({ message, detail, onRetry }: { message: string; detail?: string; onRetry: () => void }) {
  return (
    <Alert color="red" title="Attribution impossible" role="alert">
      <Stack gap="xs">
        <Text size="sm">{message}</Text>
        {detail && <Text size="xs" c="dimmed">{detail}</Text>}
        <Button size="compact-sm" variant="light" w="fit-content" leftSection={<IconRefresh size={14} />} onClick={onRetry}>
          Réessayer
        </Button>
      </Stack>
    </Alert>
  );
}

function Reading({ attribution }: { attribution: TurnAttribution }) {
  return (
    <Stack gap={6}>
      <Text size="sm" fw={600}>{attribution.whatHappened}</Text>
      {attribution.contributions.length === 0
        ? <Text size="xs" c="dimmed">Aucune contribution n’a été transmise au Narrateur.</Text>
        : (
          <Stack gap={4} role="list" aria-label="Attribution des contributions">
            {attribution.contributions.map(({ agent, item, verdict, note }, position) => (
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
  );
}
