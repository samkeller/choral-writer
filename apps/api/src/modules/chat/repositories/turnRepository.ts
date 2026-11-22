import { and, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import type { ChatTurn, MemoryResult, TurnConfiguration, TurnDirection } from '@choral-writer/shared';

import type { Database, Transaction } from '../../../db/client.js';
import { chatMessages } from '../../../db/entities/chat/message.js';
import { chatTurns } from '../../../db/entities/chat/turn.js';
import { memoryRuns } from '../../../db/entities/memory.js';
import type { NewChatTurn, TurnCompletion } from '../types/turn.types.js';
import type { TurnRow } from '../types/turn-row.types.js';

function toChatTurn({ turn, user, assistant, memoryResult }: TurnRow): ChatTurn {
  if (turn.assistantMessageId && !assistant) throw new Error('Missing chat assistant message.');
  return {
    id: turn.id,
    parentTurnId: turn.parentTurnId,
    originBranchId: turn.originBranchId,
    retryOfTurnId: turn.retryOfTurnId,
    regeneratedFromTurnId: turn.regeneratedFromTurnId,
    status: turn.status,
    error: turn.error,
    memory: memoryResult ?? turn.memoryResult,
    userMessage: user,
    assistantMessage: assistant,
  };
}

export class ChatTurnRepository {
  constructor(
    private readonly database: Database | Transaction,
    private readonly projectId: string,
  ) {}

  private selectTurns() {
    const assistant = alias(chatMessages, 'assistant_message');
    return this.database.select({
      turn: chatTurns, user: chatMessages, assistant,
      memoryResult: sql<MemoryResult | null>`(
        select mr.result from ${memoryRuns} mr
        where mr.turn_id = ${chatTurns.id} and mr.project_id = ${chatTurns.projectId}
        order by mr.created_at desc, mr.id desc limit 1
      )`,
    }).from(chatTurns)
      .innerJoin(chatMessages, eq(chatMessages.id, chatTurns.userMessageId))
      .leftJoin(assistant, eq(assistant.id, chatTurns.assistantMessageId));
  }

  async find(id: string): Promise<ChatTurn | null> {
    const [row] = await this.selectTurns().where(and(
      eq(chatTurns.projectId, this.projectId), eq(chatTurns.id, id),
    ));
    return row ? toChatTurn(row) : null;
  }

  /**
   * UNION terminates even on corrupt cycles; parent links, not UUIDs or dates,
   * define narrative order. The optional limit retains whole recent turns.
   */
  async path(headTurnId: string | null, limit?: number): Promise<ChatTurn[] | null> {
    if (headTurnId === null) return [];
    const ancestors = sql`
      with recursive ancestry as (
        select id, parent_turn_id from ${chatTurns}
        where project_id = ${this.projectId} and id = ${headTurnId}
        union
        select parent.id, parent.parent_turn_id from ${chatTurns} parent
        inner join ancestry child on parent.id = child.parent_turn_id
        where parent.project_id = ${this.projectId}
      )
      select id from ancestry
    `;
    const rows = await this.selectTurns().where(and(
      eq(chatTurns.projectId, this.projectId),
      sql`${chatTurns.id} in (${ancestors})`,
    ));
    const byId = new Map(rows.map((row) => [row.turn.id, row]));
    if (!byId.has(headTurnId)) return null;
    const ordered: typeof rows = [];
    const seen = new Set<string>();
    let id: string | null = headTurnId;
    while (id !== null) {
      if (seen.has(id)) throw new Error('Cycle detected in chat ancestry.');
      seen.add(id);
      const row = byId.get(id);
      if (!row) throw new Error('Incomplete chat ancestry.');
      ordered.push(row);
      id = row.turn.parentTurnId;
    }
    return (limit === undefined ? ordered : ordered.slice(0, limit)).reverse().map(toChatTurn);
  }

  async create(input: NewChatTurn): Promise<string> {
    const id = uuidv7();
    await this.database.insert(chatTurns).values({
      id,
      projectId: this.projectId,
      originBranchId: input.branchId,
      parentTurnId: input.parentTurnId,
      userMessageId: input.userMessage.id,
      retryOfTurnId: input.retryOfTurnId,
      regeneratedFromTurnId: input.regeneratedFromTurnId,
      status: 'running',
      memorySnapshot: input.memorySnapshot,
      configuration: input.configuration,
    });
    return id;
  }

  /** Undefined when the turn does not exist in this project; null when it predates recorded configurations. */
  async configuration(id: string): Promise<TurnConfiguration | null | undefined> {
    const [row] = await this.database.select({ configuration: chatTurns.configuration }).from(chatTurns)
      .where(and(eq(chatTurns.projectId, this.projectId), eq(chatTurns.id, id)));
    return row ? row.configuration : undefined;
  }

  /** Only a running execution records its direction. */
  async recordDirection(id: string, direction: TurnDirection): Promise<boolean> {
    const [row] = await this.database.update(chatTurns).set({ direction }).where(and(
      eq(chatTurns.projectId, this.projectId), eq(chatTurns.id, id), eq(chatTurns.status, 'running'),
    )).returning({ id: chatTurns.id });
    return row !== undefined;
  }

  /** Recorded directions by turn; turns of other projects and turns without one are absent. */
  async directions(ids: readonly string[]): Promise<Map<string, TurnDirection>> {
    if (ids.length === 0) return new Map();
    const rows = await this.database.select({ id: chatTurns.id, direction: chatTurns.direction }).from(chatTurns)
      .where(and(eq(chatTurns.projectId, this.projectId), inArray(chatTurns.id, [...ids])));
    return new Map(rows.flatMap((row) => row.direction ? [[row.id, row.direction] as const] : []));
  }

  async finish(id: string, branchId: string, completion: TurnCompletion): Promise<boolean> {
    const [row] = await this.database.update(chatTurns).set({
      status: completion.status,
      assistantMessageId: completion.status === 'completed' ? completion.assistantMessageId : null,
      error: completion.status === 'failed' ? completion.error : null,
      completedAt: completion.completedAt,
      memoryResult: completion.memoryResult,
    }).where(and(
      eq(chatTurns.projectId, this.projectId), eq(chatTurns.id, id),
      eq(chatTurns.originBranchId, branchId), eq(chatTurns.status, 'running'),
    )).returning({ id: chatTurns.id });
    return row !== undefined;
  }
}
