import { Badge, Box, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import {
  CONTEXT_CHARS_PER_TOKEN, type ContextComposition, type ContextPart, type TraceCallSummary, type TurnMetrics,
} from '@choral-writer/shared';

import { stagePresentation, stagePresentationOf } from '../../phases/stagePresentation';
import { formatTokens } from '../turnFormat';
import {
  compositionSegments, contextPartPresentation, contextParts, estimatedTotal, historyShare,
} from './contextComposition';
import { DrawerBlock } from './DrawerBlock';
import { EvolutionBars } from './EvolutionBars';

const NOT_RECORDED = 'composition non enregistrée';
/** Beyond this share of the Narrator input, the history is flagged, as in the Debug mode prototype. */
const HEAVY_HISTORY_SHARE = 0.5;

/** « Contexte » : what each call received, part by part, and how the Narrator input evolves over the story. */
export function TurnContextPanel({ calls, metrics, index, onSelectTurn }: {
  calls: TraceCallSummary[];
  metrics: TurnMetrics[] | null;
  index: number;
  onSelectTurn: (index: number) => void;
}) {
  const largestInput = Math.max(0, ...calls.map(measuredInput));
  const narratorShare = historyShare(calls.filter((call) => call.stage === 'narrator').at(-1)?.composition ?? null);
  const parts = partsOf(calls.map((call) => call.composition));

  return (
    <Stack gap="sm">
      <DrawerBlock title="Composition du contexte" aside={narratorShare !== null && narratorShare > HEAVY_HISTORY_SHARE && (
        <Badge size="xs" variant="light" color="orange">historique : {percent(narratorShare)} du Narrateur</Badge>
      )}>
        {calls.length === 0 ? <Text size="sm" c="dimmed">Aucun appel enregistré pour ce tour.</Text> : (
          <Stack gap={6}>
            {calls.map((call) => (
              <CallComposition key={call.id} call={call} largestInput={largestInput} />
            ))}
            {parts.length > 0 && <ContextLegend parts={parts} />}
            <Text size="xs" c="dimmed">
              Tokens en entrée → en sortie. Chaque barre est proportionnelle à l’appel le plus lourd du tour ; ses parties
              sont estimées d’après la longueur du texte (≈ {CONTEXT_CHARS_PER_TOKEN} caractères par token).
            </Text>
          </Stack>
        )}
      </DrawerBlock>
      {metrics && (
        <>
          <DrawerBlock title="Entrée du Narrateur au fil des tours">
            <Stack gap={6}>
              <EvolutionBars values={metrics.map((turn) => turn.narratorInputTokens ?? estimatedTotal(turn.narratorComposition))}
                current={index} color={stagePresentation.narrator.color} onSelect={onSelectTurn}
                segmentsOf={(turnIndex) => barSegments(metrics[turnIndex]?.narratorComposition ?? null)}
                describe={(tokens, turnNumber) => tokens === null
                  ? `Tour ${turnNumber} : non mesuré`
                  : `Tour ${turnNumber} : ${formatTokens(tokens)} tokens${
                    metrics[turnNumber - 1]?.narratorComposition ? '' : ` (${NOT_RECORDED})`}`} />
              <ContextLegend parts={partsOf(metrics.map((turn) => turn.narratorComposition))} />
            </Stack>
          </DrawerBlock>
          <DrawerBlock title="Part de l’historique dans l’entrée du Narrateur">
            <Stack gap={6}>
              <EvolutionBars values={metrics.map((turn) => percentValue(historyShare(turn.narratorComposition)))}
                current={index} color={contextPartPresentation.history.color} onSelect={onSelectTurn} scaleMax={100} height={50}
                describe={(share, turnNumber) => `Tour ${turnNumber} : ${share !== null ? `historique à ${share} %`
                  : metrics[turnNumber - 1]?.narratorInputTokens === null ? 'non mesuré' : NOT_RECORDED}`} />
              <ContextLegend parts={['history']} />
            </Stack>
          </DrawerBlock>
        </>
      )}
    </Stack>
  );
}

function CallComposition({ call, largestInput }: { call: TraceCallSummary; largestInput: number }) {
  const { label, color } = stagePresentationOf(call.stage);
  const name = call.agentName ?? label;
  const width = largestInput > 0 ? (measuredInput(call) / largestInput) * 100 : 0;
  const height = call.stage === 'narrator' ? 14 : 10;
  const segments = call.composition ? compositionSegments(call.composition) : [];

  return (
    <Group gap="xs" wrap="nowrap">
      <Group gap={6} w={130} wrap="nowrap">
        <Box w={8} h={8} bg={color} style={{ borderRadius: 2, flexShrink: 0 }} aria-hidden />
        <Text size="xs" truncate title={`${name} · ${label}`} fw={call.stage === 'narrator' ? 700 : 400}>{name}</Text>
      </Group>
      <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        {segments.length > 0 ? (
          <Progress.Root size={height} bg="transparent" w={`${width}%`} aria-label={`Composition de l’entrée de ${name}`}>
            {segments.map((segment) => (
              <Tooltip key={segment.part} label={`${contextPartPresentation[segment.part].label} : ≈ ${
                formatTokens(segment.estimatedTokens)} tokens (${percent(segment.share)})`}>
                <Progress.Section value={segment.share * 100} color={contextPartPresentation[segment.part].color} />
              </Tooltip>
            ))}
          </Progress.Root>
        ) : (
          <>
            <Tooltip label={`${name} : ${formatTokens(call.inputTokens)} tokens en entrée`}>
              <Progress.Root size={height} bg="transparent" w={`${width}%`}>
                <Progress.Section value={100} color={color} />
              </Progress.Root>
            </Tooltip>
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{NOT_RECORDED}</Text>
          </>
        )}
      </Group>
      <Text size="xs" c="dimmed" w={110} ta="right">
        {formatTokens(call.inputTokens)} → {formatTokens(call.outputTokens)}
      </Text>
    </Group>
  );
}

function ContextLegend({ parts }: { parts: readonly ContextPart[] }) {
  return (
    <Group gap={8}>
      {parts.map((part) => (
        <Group key={part} gap={4} wrap="nowrap">
          <Box w={8} h={8} bg={contextPartPresentation[part].color} style={{ borderRadius: 2 }} aria-hidden />
          <Text size="xs" c="dimmed">{contextPartPresentation[part].label}</Text>
        </Group>
      ))}
    </Group>
  );
}

/** The provider's count when known, the estimate otherwise. */
function measuredInput(call: TraceCallSummary): number {
  return call.inputTokens ?? estimatedTotal(call.composition) ?? 0;
}

/** Parts found in any of the compositions, in the stable order of the legend. */
function partsOf(compositions: readonly (ContextComposition | null)[]): ContextPart[] {
  return contextParts.filter((part) => compositions.some((composition) => composition?.some((entry) => entry.part === part)));
}

function barSegments(composition: ContextComposition | null) {
  return composition && compositionSegments(composition)
    .map((segment) => ({ color: contextPartPresentation[segment.part].color, share: segment.share }));
}

function percentValue(share: number | null): number | null {
  return share === null ? null : Math.round(share * 100);
}

function percent(share: number): string {
  return `${Math.round(share * 100)} %`;
}
