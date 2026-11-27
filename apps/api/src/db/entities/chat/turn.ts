import {
  check, foreignKey, index, jsonb, text, timestamp, unique, uuid,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { choralWriterSchema } from '../../namespace.js';
import { projects } from '../project.js';
import { chatMessages } from './message.js';
import { chatBranches } from './branch.js';
import type {
  AttributedDevelopment, MemoryResult, MemoryState, TurnAttributionRecord, TurnConfiguration, TurnDirection,
} from '@choral-writer/shared';

/**
 * One execution of the narrative pipeline for a user message.
 *
 * parentTurnId defines narrative ancestry, independently of creation time and
 * originBranchId (which records provenance, not membership). Terminal executions
 * are immutable: retry and regeneration create sibling turns with separate traces.
 * A failed turn has no assistant message but may remain in a conversation's path.
 */
export const chatTurns = choralWriterSchema.table('chat_turn', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  originBranchId: uuid('origin_branch_id').notNull(),
  parentTurnId: uuid('parent_turn_id'),
  retryOfTurnId: uuid('retry_of_turn_id'),
  regeneratedFromTurnId: uuid('regenerated_from_turn_id'),
  userMessageId: uuid('user_message_id').notNull(),
  assistantMessageId: uuid('assistant_message_id'),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull(),
  error: text('error'),
  memorySnapshot: jsonb('memory_snapshot').$type<MemoryState>(),
  memoryResult: jsonb('memory_result').$type<MemoryResult>(),
  /** Null only for turns started before configurations were recorded. */
  configuration: jsonb('configuration').$type<TurnConfiguration>(),
  /** Null when the turn ran without a Director, or when the narrator fell back to the whole whiteboard. */
  direction: jsonb('direction').$type<TurnDirection>(),
  /** Developments that happened during the turn, as their agents wrote them. Null for turns recorded before them. */
  developments: jsonb('developments').$type<AttributedDevelopment[]>(),
  /** Last attribution of the prose and last failure, computed on demand by the Debug mode; null until first requested. */
  attribution: jsonb('attribution').$type<TurnAttributionRecord>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table): PgTableExtraConfigValue[] => [
  index('chat_turn_project_idx').on(table.projectId),
  unique('chat_turn_project_id_unique').on(table.projectId, table.id),
  foreignKey({
    columns: [table.projectId, table.originBranchId],
    foreignColumns: [chatBranches.projectId, chatBranches.id],
    name: 'chat_turn_origin_branch_fk',
  }),
  foreignKey({
    columns: [table.projectId, table.parentTurnId],
    foreignColumns: [table.projectId, table.id],
    name: 'chat_turn_parent_fk',
  }),
  foreignKey({
    columns: [table.projectId, table.retryOfTurnId],
    foreignColumns: [table.projectId, table.id],
    name: 'chat_turn_retry_fk',
  }),
  foreignKey({
    columns: [table.projectId, table.regeneratedFromTurnId],
    foreignColumns: [table.projectId, table.id],
    name: 'chat_turn_regenerated_fk',
  }),
  foreignKey({
    columns: [table.projectId, table.userMessageId],
    foreignColumns: [chatMessages.projectId, chatMessages.id],
    name: 'chat_turn_user_message_fk',
  }),
  foreignKey({
    columns: [table.projectId, table.assistantMessageId],
    foreignColumns: [chatMessages.projectId, chatMessages.id],
    name: 'chat_turn_assistant_message_fk',
  }),
  check('chat_turn_status_check', sql`${table.status} in ('running', 'completed', 'failed')`),
  check('chat_turn_response_check', sql`(${table.status} = 'completed') = (${table.assistantMessageId} is not null)`),
  check('chat_turn_parent_check', sql`${table.parentTurnId} is distinct from ${table.id}`),
]);
