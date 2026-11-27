import { useState } from 'react';
import { Anchor, Badge, Group, Paper, SegmentedControl, Stack, Text } from '@mantine/core';
import type { TurnTraceSummary } from '@choral-writer/shared';

import { DevelopmentScopeBadge } from '../../llm/DevelopmentScopeBadge';
import { phasePresentation } from '../../phases/phasePresentation';
import { formatSeconds } from '../turnFormat';
import {
  type AnalysisCard, type AnalysisFilter, type ItemFate, analysisCards, isTransmitted, matchesFilter,
} from './analysisInsights';
import { verdictPresentation } from './attributionPresentation';
import type { AttributionState } from './useTurnAttribution';

const filters: { value: AnalysisFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'transmitted', label: 'Transmis' },
  { value: 'dismissed', label: 'Écartés' },
];

/** « Analyse » : what each analysis agent produced, and the fate of each item up to the prose. */
export function TurnAnalysisPanel({ summary, attribution, onOpenCall }: {
  summary: TurnTraceSummary;
  attribution: AttributionState;
  onOpenCall: (callId: string) => void;
}) {
  const [filter, setFilter] = useState<AnalysisFilter>('all');
  if (summary.analysis.length === 0) {
    return <Text c="dimmed">Aucun agent d’analyse pour ce tour : le Narrateur n’a reçu aucune contribution.</Text>;
  }
  const cards = analysisCards(summary, attribution.status === 'ready' ? attribution.response.attribution : null);

  return (
    <Stack gap="sm">
      <SegmentedControl size="xs" w="fit-content" value={filter} data={filters} aria-label="Filtrer les items"
        onChange={(value) => setFilter(filters.find((option) => option.value === value)?.value ?? 'all')} />
      {cards.map((card, position) => (
        <AgentCard key={card.agent.agentVersionId ?? `${card.agent.name}-${position}`} card={card} filter={filter}
          attribution={attribution.status} onOpenCall={onOpenCall} />
      ))}
    </Stack>
  );
}

function AgentCard({ card, filter, attribution, onOpenCall }: {
  card: AnalysisCard;
  filter: AnalysisFilter;
  attribution: AttributionState['status'];
  onOpenCall: (callId: string) => void;
}) {
  const { agent, callId } = card;
  const items = card.items.filter((entry) => matchesFilter(entry.fate, filter));
  const transmitted = card.items.filter((entry) => isTransmitted(entry.fate)).length;
  return (
    <Paper component="section" withBorder radius="md" p="sm" bg="dark.7" aria-label={`Analyse · ${agent.name}`}
      style={{ borderLeft: `3px solid var(--mantine-color-${phasePresentation.analysis.color}-7)` }}>
      <Group justify="space-between" mb={6} gap="xs">
        <Group gap="xs">
          <Text fw={700} size="sm">{agent.name}</Text>
          <Text size="xs" c="dimmed">
            {card.items.length} item(s) · {transmitted} transmis · {formatSeconds(agent.durationMs)}
            {agent.attempts > 1 && ` · ${agent.attempts} tentatives`}
          </Text>
        </Group>
        {callId && (
          <Anchor component="button" type="button" size="xs" onClick={() => onOpenCall(callId)}>Réponse brute →</Anchor>
        )}
      </Group>
      {!agent.envelope ? <Text size="xs" c="red.4">Aucune contribution valide : le Narrateur a tourné sans cet agent.</Text>
        : items.length === 0 ? <Text size="xs" c="dimmed">Aucun item dans ce filtre.</Text>
          : (
            <Stack gap={6} role="list" aria-label={`Items de ${agent.name}`}>
              {items.map(({ item, fate }, index) => (
                <Stack key={`${item.kind}-${index}`} gap={2} role="listitem" opacity={isTransmitted(fate) ? 1 : 0.65}>
                  <Group gap="xs" wrap="nowrap" align="flex-start">
                    <Badge size="xs" variant="light" color="gray" tt="none">{item.kind}</Badge>
                    <DevelopmentScopeBadge item={item} />
                    <Text size="sm" style={{ flex: 1 }}>{item.text}</Text>
                    <FateBadge fate={fate} attribution={attribution} />
                  </Group>
                  <FateDetail fate={fate} />
                </Stack>
              ))}
            </Stack>
          )}
    </Paper>
  );
}

function FateBadge({ fate, attribution }: { fate: ItemFate; attribution: AttributionState['status'] }) {
  switch (fate.kind) {
    case 'dismissed':
      return <Badge size="xs" variant="outline" color="gray" tt="none">écarté</Badge>;
    case 'offscreen':
      return <Badge size="xs" variant="light" color="teal" tt="none">transmis · hors champ, connu du Gardien</Badge>;
    case 'told':
      if (!fate.reading) {
        return (
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            transmis · {attribution === 'loading' || attribution === 'waiting' ? 'lecture en cours' : 'lecture indisponible'}
          </Text>
        );
      }
      return (
        <Badge size="xs" variant="light" color={verdictPresentation[fate.reading.verdict].color} tt="none">
          transmis · {verdictPresentation[fate.reading.verdict].label}
        </Badge>
      );
  }
}

/** The Director's reason, then where the prose shows the item. */
function FateDetail({ fate }: { fate: ItemFate }) {
  const note = fate.kind === 'told' ? fate.reading?.note : '';
  if (!fate.why && !note) return null;
  return (
    <Text size="xs" c="dimmed">
      {fate.why && `${fate.kind === 'dismissed' ? 'Écarté' : 'Retenu'} par le Directeur : ${fate.why}`}
      {fate.why && note && ' · '}
      {note && `Dans la prose : ${note}`}
    </Text>
  );
}
