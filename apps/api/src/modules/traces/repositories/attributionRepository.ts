import { and, eq } from 'drizzle-orm';
import type { TurnAttributionRecord } from '@choral-writer/shared';

import type { Database } from '../../../db/client.js';
import { chatTurns } from '../../../db/entities/chat/turn.js';
import { llmCall } from '../../../db/entities/llmCall.js';
import { llmUsage } from '../../../db/entities/llmUsage.js';

/** The attribution record cached on a turn, and what its calls cost. */
export class AttributionRepository {
  constructor(private readonly database: Database) {}

  /** Undefined when the turn does not belong to the project; null when nothing is cached yet. */
  async find(projectId: string, turnId: string): Promise<TurnAttributionRecord | null | undefined> {
    const [turn] = await this.database.select({ attribution: chatTurns.attribution }).from(chatTurns)
      .where(and(eq(chatTurns.projectId, projectId), eq(chatTurns.id, turnId)));
    return turn && turn.attribution;
  }

  async save(projectId: string, turnId: string, attribution: TurnAttributionRecord): Promise<void> {
    await this.database.update(chatTurns).set({ attribution })
      .where(and(eq(chatTurns.projectId, projectId), eq(chatTurns.id, turnId)));
  }

  /** Price of every attribution call of the turn; null for a call without a known price. */
  async listCallCosts(turnId: string): Promise<{ costMicroUsd: number | null }[]> {
    return await this.database.select({ costMicroUsd: llmUsage.costMicroUsd }).from(llmCall)
      .leftJoin(llmUsage, eq(llmUsage.callId, llmCall.id))
      .where(and(eq(llmCall.turnId, turnId), eq(llmCall.stage, 'attribution')));
  }
}
