import type {
  ChatTurn, TraceCallDetail, TurnConfiguration, TurnDirection, TurnTraceSummary,
} from '@choral-writer/shared';

import { notfoundError } from '../../../errors/errors.js';
import type { TraceRepository } from '../repositories/traceRepository.js';
import { toTraceCallDetailDto, toTurnTraceSummaryDto } from '../mappers/traceDto.js';

type TurnLookup = {
  turn(projectId: string, turnId: string): Promise<Pick<ChatTurn, 'id'>>;
  turnConfiguration(projectId: string, turnId: string): Promise<TurnConfiguration | null>;
  turnDirection(projectId: string, turnId: string): Promise<TurnDirection | null>;
};

export class TraceService {
  constructor(
    private readonly repository: Pick<TraceRepository, 'listByTurn' | 'findByIdForTurn'>,
    private readonly chat: TurnLookup,
  ) {}

  async summary(projectId: string, turnId: string): Promise<TurnTraceSummary> {
    const turn = await this.chat.turn(projectId, turnId);
    const [traces, configuration, direction] = await Promise.all([
      this.repository.listByTurn(turn.id), this.chat.turnConfiguration(projectId, turn.id),
      this.chat.turnDirection(projectId, turn.id),
    ]);
    return toTurnTraceSummaryDto(turn.id, traces, configuration, direction);
  }

  async call(projectId: string, turnId: string, callId: string): Promise<TraceCallDetail> {
    const turn = await this.chat.turn(projectId, turnId);
    const trace = await this.repository.findByIdForTurn(callId, turn.id);
    if (!trace) throw notfoundError('Cet appel ne fait pas partie de ce tour.');
    return toTraceCallDetailDto(trace, turn.id);
  }
}
