import type { TraceCallDetail, TurnMetrics, TurnTraceSummary } from '@choral-writer/shared';

import { notfoundError } from '../../../errors/errors.js';
import type { MetricCallRecord, TracedTurnRecord, TraceRepository } from '../repositories/traceRepository.js';
import { toTraceCallDetailDto, toTurnMetricsDto, toTurnTraceSummaryDto } from '../mappers/traceDto.js';
import { turnConfigurationChanges } from './configurationChanges.js';

export class TraceService {
  constructor(
    private readonly repository: Pick<
      TraceRepository, 'findTurn' | 'findBranchHead' | 'listAncestry' | 'listMetricCalls' | 'listByTurn' | 'findByIdForTurn'
    >,
  ) {}

  async summary(projectId: string, turnId: string): Promise<TurnTraceSummary> {
    const turn = await this.turn(projectId, turnId);
    return toTurnTraceSummaryDto(turn, await this.repository.listByTurn(turn.id));
  }

  /** Metrics of every turn on the branch path, root first, in three queries whatever the story length. */
  async branchMetrics(projectId: string, branchId: string): Promise<TurnMetrics[]> {
    const headTurnId = await this.repository.findBranchHead(projectId, branchId);
    if (headTurnId === undefined) throw notfoundError('Cette branche est introuvable.');
    if (headTurnId === null) return [];
    const turns = orderFromRoot(await this.repository.listAncestry(projectId, headTurnId), headTurnId);
    const callsByTurn = groupByTurn(await this.repository.listMetricCalls(turns.map((turn) => turn.id)));
    return turns.map((turn, index) => {
      const previous = turns[index - 1]?.configuration;
      return toTurnMetricsDto(
        turn,
        callsByTurn.get(turn.id) ?? [],
        previous && turn.configuration ? turnConfigurationChanges(previous, turn.configuration) : null,
      );
    });
  }

  async call(projectId: string, turnId: string, callId: string): Promise<TraceCallDetail> {
    const turn = await this.turn(projectId, turnId);
    const trace = await this.repository.findByIdForTurn(callId, turn.id);
    if (!trace) throw notfoundError('Cet appel ne fait pas partie de ce tour.');
    return toTraceCallDetailDto(trace, turn.id);
  }

  private async turn(projectId: string, turnId: string): Promise<TracedTurnRecord> {
    const turn = await this.repository.findTurn(projectId, turnId);
    if (!turn) throw notfoundError('Ce tour est introuvable.');
    return turn;
  }
}

/** Parent links, not dates, define narrative order. */
function orderFromRoot(turns: readonly TracedTurnRecord[], headTurnId: string): TracedTurnRecord[] {
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const ordered: TracedTurnRecord[] = [];
  const seen = new Set<string>();
  let id: string | null = headTurnId;
  while (id !== null) {
    if (seen.has(id)) throw new Error('Cycle detected in chat ancestry.');
    seen.add(id);
    const turn = byId.get(id);
    if (!turn) throw new Error('Incomplete chat ancestry.');
    ordered.push(turn);
    id = turn.parentTurnId;
  }
  return ordered.reverse();
}

function groupByTurn(calls: readonly MetricCallRecord[]): Map<string, MetricCallRecord[]> {
  const groups = new Map<string, MetricCallRecord[]>();
  for (const call of calls) {
    if (call.turnId) groups.set(call.turnId, [...(groups.get(call.turnId) ?? []), call]);
  }
  return groups;
}
