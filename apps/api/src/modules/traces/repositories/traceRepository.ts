import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { AttributedDevelopment, TurnConfiguration, TurnDirection } from '@choral-writer/shared';

import type { Database } from '../../../db/client.js';
import { agentVersions } from '../../../db/entities/agents/agent.js';
import { chatBranches } from '../../../db/entities/chat/branch.js';
import { chatTurns } from '../../../db/entities/chat/turn.js';
import { llmCall } from '../../../db/entities/llmCall.js';
import { llmUsage } from '../../../db/entities/llmUsage.js';

function turnColumns() {
  return {
    id: chatTurns.id,
    parentTurnId: chatTurns.parentTurnId,
    configuration: chatTurns.configuration,
    direction: chatTurns.direction,
    completedAt: chatTurns.completedAt,
  };
}

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
    composition: recordedComposition(),
  };
}

/** Transfers no prompt, but reading it decompresses the whole request; untrusted until validated, since older calls lack it. */
function recordedComposition() {
  return sql<unknown>`${llmCall.request} -> 'composition'`;
}

/**
 * Only the Narrator's composition is compared across turns: the other calls skip the request,
 * whose history would otherwise be decompressed for every call of the branch.
 */
function narratorComposition() {
  return sql<unknown>`case when ${llmCall.stage} = 'narrator' then ${llmCall.request} -> 'composition' end`;
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

  /** Null when the turn does not belong to the project. */
  async findTurn(projectId: string, turnId: string): Promise<TurnTraceRecord | null> {
    const [turn] = await this.database.select({ ...turnColumns(), developments: chatTurns.developments }).from(chatTurns)
      .where(and(eq(chatTurns.projectId, projectId), eq(chatTurns.id, turnId)));
    return turn ?? null;
  }

  /** Undefined when the branch does not belong to the project. */
  async findBranchHead(projectId: string, branchId: string): Promise<string | null | undefined> {
    const [branch] = await this.database.select({ headTurnId: chatBranches.headTurnId }).from(chatBranches)
      .where(and(eq(chatBranches.projectId, projectId), eq(chatBranches.id, branchId)));
    return branch?.headTurnId;
  }

  /**
   * The head turn and its ancestors, unordered; UNION terminates even on corrupt cycles.
   * Reads only what turn metrics need, unlike the chat history path.
   */
  async listAncestry(projectId: string, headTurnId: string): Promise<TracedTurnRecord[]> {
    const ancestors = sql`
      with recursive ancestry as (
        select id, parent_turn_id from ${chatTurns}
        where project_id = ${projectId} and id = ${headTurnId}
        union
        select parent.id, parent.parent_turn_id from ${chatTurns} parent
        inner join ancestry child on parent.id = child.parent_turn_id
        where parent.project_id = ${projectId}
      )
      select id from ancestry
    `;
    return await this.database.select(turnColumns()).from(chatTurns)
      .where(and(eq(chatTurns.projectId, projectId), sql`${chatTurns.id} in (${ancestors})`));
  }

  /** Timing, tokens and price of the calls of several turns, without prompts or responses. */
  async listMetricCalls(turnIds: readonly string[]) {
    if (turnIds.length === 0) return [];
    return await this.database.select({
      id: llmCall.id,
      turnId: llmCall.turnId,
      agentId: llmCall.agentId,
      agentVersionId: llmCall.agentVersionId,
      stage: llmCall.stage,
      inputTokens: llmCall.inputTokens,
      durationMs: llmCall.durationMs,
      createdAt: llmCall.createdAt,
      costMicroUsd: llmUsage.costMicroUsd,
      narratorComposition: narratorComposition(),
    })
      .from(llmCall)
      .leftJoin(llmUsage, eq(llmUsage.callId, llmCall.id))
      .where(inArray(llmCall.turnId, [...turnIds]))
      .orderBy(asc(llmCall.createdAt), asc(llmCall.id));
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

export type TracedTurnRecord = {
  id: string;
  parentTurnId: string | null;
  configuration: TurnConfiguration | null;
  /** What the Director decided; null when the turn ran without direction or its direction failed. */
  direction: TurnDirection | null;
  completedAt: Date | null;
};
/** A traced turn with what happened during it; null for a turn recorded before developments were. */
export type TurnTraceRecord = TracedTurnRecord & { developments: AttributedDevelopment[] | null };
export type MetricCallRecord = Awaited<ReturnType<TraceRepository['listMetricCalls']>>[number];
export type TraceSummaryRecord = Awaited<ReturnType<TraceRepository['listByTurn']>>[number];
export type TraceDetailRecord = TraceSummaryRecord & {
  request: { messages: ChatCompletionMessageParam[] };
};
