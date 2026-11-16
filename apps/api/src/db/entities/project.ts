import { text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { choralWriterSchema } from '../namespace.js';

export const projects = choralWriterSchema.table('projects', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
