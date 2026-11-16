import { and, asc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { ChatBranch } from '@choral-writer/shared';

import type { Database, Transaction } from '../../../db/client.js';
import { chatBranches } from '../../../db/entities/chat/branch.js';

function branchDto(row: typeof chatBranches.$inferSelect): ChatBranch {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export class ChatBranchRepository {
  constructor(
    private readonly database: Database | Transaction,
    private readonly projectId: string,
  ) {}

  async list(): Promise<ChatBranch[]> {
    const rows = await this.database.select().from(chatBranches)
      .where(eq(chatBranches.projectId, this.projectId))
      .orderBy(asc(chatBranches.createdAt), asc(chatBranches.id));
    return rows.map(branchDto);
  }

  async find(id: string): Promise<ChatBranch | null> {
    const [row] = await this.database.select().from(chatBranches).where(and(
      eq(chatBranches.projectId, this.projectId), eq(chatBranches.id, id),
    ));
    return row ? branchDto(row) : null;
  }

  async create(input: Pick<ChatBranch, 'name' | 'sourceBranchId' | 'forkTurnId'>): Promise<ChatBranch> {
    const [row] = await this.database.insert(chatBranches).values({
      ...input, id: uuidv7(), projectId: this.projectId, headTurnId: input.forkTurnId,
    }).returning();
    return branchDto(row);
  }

  async setHead(id: string, headTurnId: string): Promise<void> {
    const [row] = await this.database.update(chatBranches).set({ headTurnId }).where(and(
      eq(chatBranches.projectId, this.projectId), eq(chatBranches.id, id),
    )).returning({ id: chatBranches.id });
    if (!row) throw new Error('Cannot advance a missing chat branch.');
  }
}
