import { and, asc, desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { memoryStateSchema, type MemoryResult, type MemoryState, type MemoryView } from '@choral-writer/shared';
import type { Database, Transaction } from '../../../db/client.js';
import { memoryBanks, memoryRuns, memorySettings } from '../../../db/entities/memory.js';
import { chatBranches } from '../../../db/entities/chat/branch.js';
import { chatTurns } from '../../../db/entities/chat/turn.js';
import { llmCall } from '../../../db/entities/llmCall.js';
import { narratorProse } from '../../chat/services/narratorProse.js';

export class MemoryRepository {
  constructor(private readonly db: Database | Transaction, private readonly projectId: string) {}

  async view(branchId: string): Promise<MemoryView | null> {
    const [branch] = await this.db.select().from(chatBranches).where(and(
      eq(chatBranches.projectId, this.projectId), eq(chatBranches.id, branchId),
    ));
    if (!branch) return null;
    const [settings] = await this.db.select().from(memorySettings).where(eq(memorySettings.projectId, this.projectId));
    const [bank] = await this.db.select().from(memoryBanks).where(and(
      eq(memoryBanks.projectId, this.projectId), eq(memoryBanks.branchId, branchId),
    ));
    if ((settings && settings.catalog.v !== 2) || (bank && bank.entries.v !== 2)) {
      throw new Error('Unsupported stored memory version.');
    }
    const parsed = memoryStateSchema.safeParse({
      v: 2, tags: settings?.catalog.tags ?? [], legacy: settings?.catalog.legacy,
      entries: bank ? bank.entries.entries : [],
    });
    if (!parsed.success) throw new Error('Stored memory is invalid.', { cause: parsed.error });
    return { projectId: this.projectId, branchId, headTurnId: branch.headTurnId,
      revisionId: bank?.revisionId ?? null, catalogRevisionId: settings?.revisionId ?? null,
      enabled: settings?.enabled ?? false, state: parsed.data };
  }

  async save(branchId: string, state: MemoryState, enabled: boolean, catalog: boolean): Promise<void> {
    if (catalog) await this.saveSettings(state, enabled);
    await this.db.insert(memoryBanks).values({
      projectId: this.projectId, branchId, revisionId: uuidv7(), entries: { v: 2, entries: state.entries },
    }).onConflictDoUpdate({ target: memoryBanks.branchId, set: { revisionId: uuidv7(), entries: { v: 2, entries: state.entries } } });
  }

  /** The tag catalog and the memory switch are project settings, shared by every branch. */
  async saveSettings(state: Pick<MemoryState, 'tags' | 'legacy'>, enabled: boolean): Promise<void> {
    const catalog = { v: 2 as const, tags: state.tags, legacy: state.legacy };
    await this.db.insert(memorySettings).values({ projectId: this.projectId, revisionId: uuidv7(), enabled, catalog })
      .onConflictDoUpdate({ target: memorySettings.projectId, set: { revisionId: uuidv7(), enabled, catalog } });
  }

  async snapshot(turnId: string): Promise<MemoryState | null> {
    const [row] = await this.db.select({ snapshot: chatTurns.memorySnapshot }).from(chatTurns).where(and(
      eq(chatTurns.projectId, this.projectId), eq(chatTurns.id, turnId),
    ));
    if (!row?.snapshot) return null;
    const parsed = memoryStateSchema.safeParse(row.snapshot);
    if (!parsed.success) throw new Error('Stored memory snapshot is invalid.', { cause: parsed.error });
    return parsed.data;
  }

  async recordRun(id: string, branchId: string, turnId: string, result: MemoryResult): Promise<void> {
    await this.db.insert(memoryRuns).values({ id, projectId: this.projectId, branchId, turnId, result });
  }

  async runs(turnId: string) {
    return this.db.select({ id: memoryRuns.id, turnId: memoryRuns.turnId, branchId: memoryRuns.branchId,
      result: memoryRuns.result, createdAt: memoryRuns.createdAt }).from(memoryRuns)
      .where(and(eq(memoryRuns.projectId, this.projectId), eq(memoryRuns.turnId, turnId)))
      .orderBy(asc(memoryRuns.createdAt), asc(memoryRuns.id));
  }

  /** What the Guardian maintains memory from: the turn's prose and developments (none for older turns). */
  async source(turnId: string) {
    const [narrator] = await this.db.select({ response: llmCall.response }).from(llmCall).where(and(
      eq(llmCall.turnId, turnId), eq(llmCall.stage, 'narrator'), eq(llmCall.status, 'success'),
    )).orderBy(desc(llmCall.createdAt), desc(llmCall.id)).limit(1);
    const prose = narrator?.response ? narratorProse(narrator.response) : '';
    if (!prose) throw new Error('The original narrator trace is unavailable.');
    const [turn] = await this.db.select({ developments: chatTurns.developments }).from(chatTurns).where(and(
      eq(chatTurns.projectId, this.projectId), eq(chatTurns.id, turnId),
    ));
    return { prose, developments: turn?.developments ?? [] };
  }
}
