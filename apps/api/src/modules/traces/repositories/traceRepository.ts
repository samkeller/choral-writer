import { and, asc, eq, inArray } from 'drizzle-orm';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { TurnConfiguration } from '@choral-writer/shared';

import type { Database } from '../../../db/client.js';
import { agentVersions } from '../../../db/entities/agents/agent.js';
import { chatTurns } from '../../../db/entities/chat/turn.js';
import { llmCall } from '../../../db/entities/llmCall.js';
import { llmUsage } from '../../../db/entities/llmUsage.js';

function summaryColumns() {
  return {
    id: llmCall.id,
    turnId: llmCall.turnId,
    agentId: llmCall.agentId,
    agentVersionId: llmCall.agentVersionId,
    agentName: agentVersions.name,
    agentVersion: agentVersions.version,
    stage: llmCall.stage,
    model: llmCall.model,
    response: llmCall.response,
    inputTokens: llmCall.inputTokens,
    outputTokens: llmCall.outputTokens,
    durationMs: llmCall.durationMs,
    status: llmCall.status,
    createdAt: llmCall.createdAt,
    costMicroUsd: llmUsage.costMicroUsd,
    costBasis: llmUsage.costBasis,
  };
}

export class TraceRepository {
  constructor(private readonly database: Database) {}

  async listByTurn(turnId: string) {
    return await this.database.select(summaryColumns())
      .from(llmCall)
      .leftJoin(agentVersions, eq(llmCall.agentVersionId, agentVersions.id))
      .leftJoin(llmUsage, eq(llmUsage.callId, llmCall.id))
      .where(eq(llmCall.turnId, turnId))
      .orderBy(asc(llmCall.createdAt), asc(llmCall.id));
  }

  async listByTurns(turnIds: readonly string[]) {
    if (turnIds.length === 0) return [];
    return await this.database.select(summaryColumns())
      .from(llmCall)
      .leftJoin(agentVersions, eq(llmCall.agentVersionId, agentVersions.id))
      .leftJoin(llmUsage, eq(llmUsage.callId, llmCall.id))
      .where(inArray(llmCall.turnId, [...turnIds]))
      .orderBy(asc(llmCall.createdAt), asc(llmCall.id));
  }

  /** Recorded configurations by turn id; turns that predate recording are absent. */
  async configurationsByTurn(turnIds: readonly string[]): Promise<Map<string, TurnConfiguration>> {
    if (turnIds.length === 0) return new Map();
    const rows = await this.database.select({ id: chatTurns.id, configuration: chatTurns.configuration })
      .from(chatTurns)
      .where(inArray(chatTurns.id, [...turnIds]));
    return new Map(rows.flatMap((row) => row.configuration ? [[row.id, row.configuration] as const] : []));
  }

  async findByIdForTurn(id: string, turnId: string): Promise<TraceDetailRecord | null> {
    const [trace] = await this.database.select({
      ...summaryColumns(),
      request: llmCall.request,
    })
      .from(llmCall)
      .leftJoin(agentVersions, eq(llmCall.agentVersionId, agentVersions.id))
      .leftJoin(llmUsage, eq(llmUsage.callId, llmCall.id))
      .where(and(eq(llmCall.id, id), eq(llmCall.turnId, turnId)))
      .limit(1);
    return trace ?? null;
  }
}

export type TraceSummaryRecord = Awaited<ReturnType<TraceRepository['listByTurn']>>[number];
export type TraceDetailRecord = TraceSummaryRecord & {
  request: { messages: ChatCompletionMessageParam[] };
};
