import { and, asc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { ChatBranch } from '@choral-writer/shared';

import type { Database, Transaction } from '../../../db/client.js';
import { chatBranches } from '../../../db/entities/chat/branch.js';

export class ChatBranchRepository {
  constructor(
    private readonly database: Database | Transaction,
    private readonly projectId: string,
  ) {}

  async list(): Promise<ChatBranch[]> {
    const rows = await this.database.select().from(chatBranches)
      .where(eq(chatBranches.projectId, this.projectId))
      .orderBy(asc(chatBranches.createdAt), asc(chatBranches.id));
    return rows;
  }

  async find(id: string): Promise<ChatBranch | null> {
    const [row] = await this.database.select().from(chatBranches).where(and(
      eq(chatBranches.projectId, this.projectId), eq(chatBranches.id, id),
    ));
    return row ?? null;
  }

  async create(input: Pick<ChatBranch, 'name' | 'sourceBranchId' | 'forkTurnId'>): Promise<ChatBranch> {
    const [row] = await this.database.insert(chatBranches).values({
      ...input, id: uuidv7(), projectId: this.projectId, headTurnId: input.forkTurnId,
    }).returning();
    return row;
  }

  async setHead(id: string, headTurnId: string): Promise<void> {
    const [row] = await this.database.update(chatBranches).set({ headTurnId }).where(and(
      eq(chatBranches.projectId, this.projectId), eq(chatBranches.id, id),
    )).returning({ id: chatBranches.id });
    if (!row) throw new Error('Cannot advance a missing chat branch.');
  }
}
