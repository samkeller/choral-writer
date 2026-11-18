import { boolean, foreignKey, index, jsonb, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { MemoryBank, MemoryCatalog, MemoryResult } from '@choral-writer/shared';
import { choralWriterSchema } from '../namespace.js';
import { projects } from './project.js';
import { chatBranches } from './chat/branch.js';
import { chatTurns } from './chat/turn.js';

export const memorySettings = choralWriterSchema.table('memory_settings', {
  projectId: uuid('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  revisionId: uuid('revision_id').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  catalog: jsonb('catalog').$type<MemoryCatalog>().notNull(),
});

export const memoryBanks = choralWriterSchema.table('memory_bank', {
  branchId: uuid('branch_id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  revisionId: uuid('revision_id').notNull(),
  entries: jsonb('entries').$type<MemoryBank>().notNull(),
}, (table) => [
  foreignKey({ columns: [table.projectId, table.branchId],
    foreignColumns: [chatBranches.projectId, chatBranches.id] }).onDelete('cascade'),
]);

export const memoryRuns = choralWriterSchema.table('memory_run', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').notNull(),
  turnId: uuid('turn_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  result: jsonb('result').$type<MemoryResult>().notNull(),
}, (table) => [
  foreignKey({ columns: [table.projectId, table.branchId],
    foreignColumns: [chatBranches.projectId, chatBranches.id] }).onDelete('cascade'),
  foreignKey({ columns: [table.projectId, table.turnId],
    foreignColumns: [chatTurns.projectId, chatTurns.id] }).onDelete('cascade'),
  index('memory_run_turn_idx').on(table.turnId, table.createdAt),
]);

