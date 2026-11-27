import type {
  AnalysisTrace, AttributedItem, AttributionVerdict, TurnAttribution, TurnTraceSummary,
} from '@choral-writer/shared';
import { isToldInScene } from '@choral-writer/shared';

import { lastAnalysisCallId } from './turnInsights';

type Item = AttributedItem['item'];

/** What the prose made of a transmitted contribution, according to the attribution. */
export type ProseReading = { verdict: AttributionVerdict; note: string };

/**
 * What became of an analysis item. `why` is the Director's reason, null when no Director sorted the item.
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

const sameItem = (agent: string, item: Item) => (candidate: AttributedItem) =>
  candidate.agent === agent && candidate.item.kind === item.kind && candidate.item.text === item.text;

/** Every analysis agent with the fate of each item it produced, from the Director's sorting to the prose. */
export function analysisCards(summary: TurnTraceSummary, attribution: TurnAttribution | null): AnalysisCard[] {
  const direction = summary.direction?.direction ?? null;
  return summary.analysis.map((agent) => ({
    agent,
    callId: lastAnalysisCallId(summary, agent),
    items: (agent.envelope?.items ?? []).map((item) => {
      const author = agent.envelope?.agent ?? agent.name;
      const matches = sameItem(author, item);
      const fate = (why: string | null): ItemFate => {
        if (!isToldInScene(item)) return { kind: 'offscreen', why };
        const reading = attribution?.contributions.find(matches);
        return { kind: 'told', why, reading: reading ? { verdict: reading.verdict, note: reading.note } : null };
      };
      if (!direction) return { item, fate: fate(null) };
      const retained = direction.retained.find(matches);
      if (retained) return { item, fate: fate(retained.why) };
      return { item, fate: { kind: 'dismissed', why: direction.dismissed.find(matches)?.why ?? null } };
    }),
  }));
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
