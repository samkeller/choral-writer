import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { choralWriterSchema } from '../namespace.js';
import { projects } from './project.js';

export const messages = choralWriterSchema.table('messages', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('messages_project_order_idx').on(table.projectId, table.createdAt, table.id),
]);
