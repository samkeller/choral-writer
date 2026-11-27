import type {
  AnalysisTrace, AttributedItem, AttributionVerdict, TurnAttribution, TurnTraceSummary,
} from '@choral-writer/shared';
import { contributionsLetThrough, contributionsToldToNarrator } from '@choral-writer/shared';

import { lastAnalysisCallId } from './turnInsights';

type Item = AttributedItem['item'];

/** What the prose made of a transmitted contribution, according to the attribution. */
export type ProseReading = { verdict: AttributionVerdict; note: string };

/**
 * What became of an analysis item. `why` is the Director's reason, null when no direction sorted the item.
 * `reading` is null while the attribution is unavailable.
 */
export type ItemFate =
  | { kind: 'dismissed'; why: string | null }
  | { kind: 'offscreen'; why: string | null }
  | { kind: 'told'; why: string | null; reading: ProseReading | null };

export interface AnalysisCard {
  agent: AnalysisTrace;
  items: { item: Item; fate: ItemFate }[];
  /** The raw response the items were read from. */
  callId: string | null;
}

export type AnalysisFilter = 'all' | 'transmitted' | 'dismissed';

/** How the whiteboard reached the Narrator: sorted by the Director, as it was after a failed direction, or without one. */
export type Transmission = 'directed' | 'directionFailed' | 'undirected';

export function transmissionOf(summary: Pick<TurnTraceSummary, 'direction'>): Transmission {
  if (!summary.direction) return 'undirected';
  return summary.direction.direction ? 'directed' : 'directionFailed';
}

/** Directed items are copies of the whiteboard's: they are recognised by agent, kind and text. */
const sameItem = (agent: string, item: Item) => (candidate: AttributedItem) =>
  candidate.agent === agent && candidate.item.kind === item.kind && candidate.item.text === item.text;

/**
 * Every analysis agent with the fate of each item it produced, from the direction to the prose. What was let
 * through and what the Narrator read follow the pipeline's own rule (`contributionsLetThrough`,
 * `contributionsToldToNarrator`).
 */
export function analysisCards(summary: TurnTraceSummary, attribution: TurnAttribution | null): AnalysisCard[] {
  const direction = summary.direction?.direction ?? null;
  const whiteboard = summary.analysis.flatMap((agent) => agent.envelope ?? []);
  const letThrough = contributionsLetThrough(whiteboard, direction);
  const told = contributionsToldToNarrator(whiteboard, direction);

  return summary.analysis.map((agent) => ({
    agent,
    callId: lastAnalysisCallId(summary, agent),
    items: (agent.envelope?.items ?? []).map((item) => {
      const matches = sameItem(agent.envelope?.agent ?? agent.name, item);
      const why = (selections: readonly (AttributedItem & { why: string })[] | undefined) =>
        selections?.find(matches)?.why ?? null;
      const fate: ItemFate = told.some(matches)
        ? { kind: 'told', why: why(direction?.retained), reading: readingOf(attribution?.contributions.find(matches)) }
        : letThrough.some(matches)
          ? { kind: 'offscreen', why: why(direction?.retained) }
          : { kind: 'dismissed', why: why(direction?.dismissed) };
      return { item, fate };
    }),
  }));
}

function readingOf(contribution: TurnAttribution['contributions'][number] | undefined): ProseReading | null {
  return contribution ? { verdict: contribution.verdict, note: contribution.note } : null;
}

export function isTransmitted(fate: ItemFate): boolean {
  return fate.kind !== 'dismissed';
}

export function matchesFilter(fate: ItemFate, filter: AnalysisFilter): boolean {
  return filter === 'all' || (filter === 'transmitted') === isTransmitted(fate);
}

export interface AnalysisFunnel {
  agents: number;
  produced: number;
  transmitted: number;
  /** Items the prose shows, fully or partly; null while the attribution is unavailable. */
  inProse: number | null;
  /** Off-screen developments that happened: the Narrator never read them, the Guardian did. */
  offscreen: number;
}

/** From the items the analysis produced to those the prose shows. */
export function analysisFunnel(cards: readonly AnalysisCard[], attributionAvailable: boolean): AnalysisFunnel {
  const fates = cards.flatMap((card) => card.items.map((entry) => entry.fate));
  return {
    agents: cards.length,
    produced: fates.length,
    transmitted: fates.filter(isTransmitted).length,
    inProse: attributionAvailable
      ? fates.filter((fate) => fate.kind === 'told' && fate.reading && fate.reading.verdict !== 'absent').length
      : null,
    offscreen: fates.filter((fate) => fate.kind === 'offscreen').length,
  };
}
