import { index, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { choralWriterSchema } from '../../namespace.js';
import { projects } from '../project.js';

/** Immutable content. Branch membership is determined by turns, never by message dates. */
export const chatMessages = choralWriterSchema.table('chat_message', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('chat_message_project_idx').on(table.projectId),
  unique('chat_message_project_id_unique').on(table.projectId, table.id),
]);
