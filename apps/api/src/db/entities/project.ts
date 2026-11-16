import { foreignKey, text, timestamp, uuid, type PgTableExtraConfigValue } from 'drizzle-orm/pg-core';

import { choralWriterSchema } from '../namespace.js';
import { chatBranches } from './chat/branch.js';

export const projects = choralWriterSchema.table('projects', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  defaultBranchId: uuid('default_branch_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table): PgTableExtraConfigValue[] => [
  foreignKey({
    columns: [table.id, table.defaultBranchId],
    foreignColumns: [chatBranches.projectId, chatBranches.id],
    name: 'projects_default_chat_branch_fk',
  }),
]);
