import {
  boolean,
  check,
  jsonb,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  uniqueIndex,
  pgSchema,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { Memory, Message, Mutation } from '@choral/engine';

export const choralWriterSchema = pgSchema('choral_writer');

export const globalSettings = choralWriterSchema.table('global_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const projects = choralWriterSchema.table('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  instructions: text('instructions').notNull().default(''),
  worldMd: text('world_md').notNull().default(''),
  worldInitialized: boolean('world_initialized').notNull().default(true),
  settings: jsonb('settings').notNull().default({}),
  storyClockDays: numeric('story_clock_days').notNull().default('0'),
  lastEventSeq: integer('last_event_seq').notNull().default(0),
  activeBranchId: uuid('active_branch_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const agents = choralWriterSchema.table(
  'agents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    key: text('key').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    model: text('model').notNull(),
    params: jsonb('params').notNull().default({}),
    contextSpec: jsonb('context_spec').notNull().default({}),
    schedule: jsonb('schedule').notNull().default({}),
    required: boolean('required').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
  },
  (table) => [
    uniqueIndex('agents_project_key').on(table.projectId, table.key),
    check('agents_kind_check', sql`${table.kind} in ('interpreter', 'analysis', 'output')`),
  ],
);

export const turns = choralWriterSchema.table(
  'turns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    branchId: uuid('branch_id'),
    seq: integer('seq').notNull(),
    userInput: text('user_input').notNull(),
    metaDirection: text('meta_direction'),
    status: text('status').notNull(),
    interpretation: jsonb('interpretation'),
    resolution: jsonb('resolution'),
    prose: text('prose'),
    storyTimeLabel: text('story_time_label'),
    elapsedDays: numeric('elapsed_days'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    committedAt: timestamp('committed_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('turns_project_seq').on(table.projectId, table.seq)],
);

export const llmCalls = choralWriterSchema.table('llm_calls', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  turnId: uuid('turn_id').references(() => turns.id),
  agentId: uuid('agent_id').references(() => agents.id),
  purpose: text('purpose').notNull(),
  model: text('model').notNull(),
  messages: jsonb('messages').$type<Message[]>().notNull(),
  response: text('response'),
  inputTokens: integer('input_tokens'),
  cachedTokens: integer('cached_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: numeric('cost_usd'),
  accountedCostUsd: numeric('accounted_cost_usd'),
  latencyMs: integer('latency_ms').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const budgetReservations = choralWriterSchema.table('budget_reservations', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  turnId: uuid('turn_id').references(() => turns.id),
  amount: numeric('amount').notNull(),
  settled: boolean('settled').notNull().default(false),
  settledAmount: numeric('settled_amount'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const branches = choralWriterSchema.table('branches', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  parentBranchId: uuid('parent_branch_id'),
  forkEventSeq: integer('fork_event_seq').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = choralWriterSchema.table(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    seq: integer('seq').notNull(),
    turnId: uuid('turn_id').references(() => turns.id),
    category: text('category').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Mutation | Record<string, unknown>>().notNull(),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('events_project_seq').on(table.projectId, table.seq),
    check('events_category_check', sql`${table.category} in ('narrative', 'mutation')`),
  ],
);

export const memoryProjections = choralWriterSchema.table('memory_projections', {
  branchId: uuid('branch_id')
    .primaryKey()
    .references(() => branches.id),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  state: jsonb('state').$type<Memory>().notNull(),
});

export const whiteboardEntries = choralWriterSchema.table('whiteboard_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  turnId: uuid('turn_id')
    .notNull()
    .references(() => turns.id),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id),
  envelope: jsonb('envelope'),
  status: text('status').notNull(),
  error: text('error'),
});

export const proposals = choralWriterSchema.table('proposals', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  turnId: uuid('turn_id').references(() => turns.id),
  branchId: uuid('branch_id')
    .notNull()
    .references(() => branches.id),
  author: text('author').notNull(),
  payload: jsonb('payload').notNull(),
  status: text('status').notNull(),
  rejectCode: text('reject_code'),
  rejectDetail: text('reject_detail'),
  eventSeq: integer('event_seq'),
});

export const summaries = choralWriterSchema.table(
  'summaries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    level: integer('level').notNull(),
    fromTurn: integer('from_turn').notNull(),
    toTurn: integer('to_turn').notNull(),
    text: text('text').notNull(),
    sourceIds: jsonb('source_ids').$type<string[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('summaries_branch_level_range').on(table.branchId, table.level, table.fromTurn, table.toTurn),
  ],
);
