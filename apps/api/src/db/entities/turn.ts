import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { choralWriterSchema } from '../namespace.js';
import { messages } from './message.js';
import { projects } from './project.js';

/**
 * TODO: Document the purpose and structure of the 'turns' table.
 */
export const turns = choralWriterSchema.table('turns', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userMessageId: uuid('user_message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  assistantMessageId: uuid('assistant_message_id').references(() => messages.id, { onDelete: 'set null' }),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [index('turns_project_idx').on(table.projectId)]);
