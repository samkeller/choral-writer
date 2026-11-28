import type { ReactNode } from 'react';
import { Alert, Button, Loader, Stack, Text } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import type { TurnTraceSummary } from '@choral-writer/shared';

import type { SummaryState } from './useTurnTraceSummary';

/** Renders its children once the turn's summary is loaded, with the loading and error states in between. */
export function WithSummary({ state, children }: { state: SummaryState; children: (summary: TurnTraceSummary) => ReactNode }) {
  if (state.loading) return <Loader color="choral" aria-label="Chargement du tour" />;
  if (state.error) {
    return (
      <Alert color="red" title="Impossible de charger le tour" role="alert">
        <Stack gap="sm">
          <Text>{state.error}</Text>
          <Button variant="light" w="fit-content" leftSection={<IconRefresh size={16} />} onClick={state.retry}>
            Réessayer
          </Button>
        </Stack>
      </Alert>
    );
  }
  if (!state.summary) return <Text c="dimmed">Aucune trace disponible pour ce tour.</Text>;
  return children(state.summary);
}
