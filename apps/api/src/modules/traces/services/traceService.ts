import type {
  ChatHistory, ChatTurn, TraceCallDetail, TurnConfiguration, TurnMetrics, TurnTraceSummary,
} from '@choral-writer/shared';

import { notfoundError } from '../../../errors/errors.js';
import type { TraceRepository } from '../repositories/traceRepository.js';
import { toTraceCallDetailDto, toTurnMetricsDto, toTurnTraceSummaryDto } from '../mappers/traceDto.js';
import { turnConfigurationChanges } from './configurationChanges.js';

type TurnLookup = {
  turn(projectId: string, turnId: string): Promise<Pick<ChatTurn, 'id'>>;
  turnConfiguration(projectId: string, turnId: string): Promise<TurnConfiguration | null>;
  history(projectId: string, branchId: string): Promise<{ turns: Pick<ChatHistory['turns'][number], 'id'>[] }>;
};

export class TraceService {
  constructor(
    private readonly repository: Pick<
      TraceRepository, 'listByTurn' | 'listByTurns' | 'configurationsByTurn' | 'findByIdForTurn'
    >,
    private readonly chat: TurnLookup,
  ) {}

  async summary(projectId: string, turnId: string): Promise<TurnTraceSummary> {
    const turn = await this.chat.turn(projectId, turnId);
    const [traces, configuration] = await Promise.all([
      this.repository.listByTurn(turn.id), this.chat.turnConfiguration(projectId, turn.id),
    ]);
    return toTurnTraceSummaryDto(turn.id, traces, configuration);
  }

  /** Metrics of every turn on the branch path, root first. */
  async branchMetrics(projectId: string, branchId: string): Promise<TurnMetrics[]> {
    const turnIds = (await this.chat.history(projectId, branchId)).turns.map((turn) => turn.id);
    const [traces, configurations] = await Promise.all([
      this.repository.listByTurns(turnIds), this.repository.configurationsByTurn(turnIds),
    ]);
    return turnIds.map((turnId, index) => {
      const previous = index > 0 ? configurations.get(turnIds[index - 1]!) : undefined;
      const current = configurations.get(turnId);
      return toTurnMetricsDto(
        turnId,
        traces.filter((trace) => trace.turnId === turnId),
        previous && current ? turnConfigurationChanges(previous, current) : null,
      );
    });
  }

  async call(projectId: string, turnId: string, callId: string): Promise<TraceCallDetail> {
    const turn = await this.chat.turn(projectId, turnId);
    const trace = await this.repository.findByIdForTurn(callId, turn.id);
    if (!trace) throw notfoundError('Cet appel ne fait pas partie de ce tour.');
    return toTraceCallDetailDto(trace, turn.id);
  }
}
