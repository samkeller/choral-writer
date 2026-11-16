import { foreignKey, index, text, timestamp, unique, uuid, type PgTableExtraConfigValue } from 'drizzle-orm/pg-core';

import { choralWriterSchema } from '../../namespace.js';
import { projects } from '../project.js';
import { chatTurns } from './turn.js';

/**
 * A named path through shared turns. Only its head advances; forkTurnId records
 * the last common ancestor when the branch was created and never moves.
 */
export const chatBranches = choralWriterSchema.table('chat_branch', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sourceBranchId: uuid('source_branch_id'),
  forkTurnId: uuid('fork_turn_id'),
  headTurnId: uuid('head_turn_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
  index('chat_branch_project_idx').on(table.projectId),
  unique('chat_branch_project_id_unique').on(table.projectId, table.id),
  foreignKey({
    columns: [table.projectId, table.sourceBranchId],
    foreignColumns: [table.projectId, table.id],
    name: 'chat_branch_source_fk',
  }),
  foreignKey({
    columns: [table.projectId, table.forkTurnId],
    foreignColumns: [chatTurns.projectId, chatTurns.id],
    name: 'chat_branch_fork_fk',
  }),
  foreignKey({
    columns: [table.projectId, table.headTurnId],
    foreignColumns: [chatTurns.projectId, chatTurns.id],
    name: 'chat_branch_head_fk',
  }),
]);
