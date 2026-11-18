import {
  check, foreignKey, integer, jsonb, primaryKey, text, timestamp, unique, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { agentOutputSchema, agentPhaseSchema } from '@choral-writer/shared';
import type { MemoryRead } from '@choral-writer/shared';

import { choralWriterSchema } from '../../namespace.js';
import { projects } from '../project.js';

export const agentPhase = choralWriterSchema.enum('agent_phase', agentPhaseSchema.options);
export const agentOutput = choralWriterSchema.enum('agent_output', agentOutputSchema.options);

export const agents = choralWriterSchema.table('agent', {
  id: uuid('id').primaryKey(),
  phase: agentPhase('phase').notNull(),
  output: agentOutput('output').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('agent_id_contract_unique').on(table.id, table.phase, table.output),
  check('agent_phase_output_check', sql`(${table.phase} = 'analysis' AND ${table.output} = 'envelope')
    OR (${table.phase} = 'restitution' AND ${table.output} IN ('narrative', 'memory_proposals'))`),
]);

export const agentVersions = choralWriterSchema.table('agent_version', {
  id: uuid('id').primaryKey(),
  agentId: uuid('agent_id').notNull(),
  version: integer('version').notNull(),
  name: text('name').notNull(),
  instructions: text('instructions').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    columns: [table.agentId], foreignColumns: [agents.id],
    name: 'agent_version_agent_id_fkey',
  }).onDelete('cascade'),
  unique('agent_version_number_unique').on(table.agentId, table.version),
  unique('agent_version_owner_unique').on(table.agentId, table.id),
]);

export const projectAgents = choralWriterSchema.table('project_agent', {
  projectId: uuid('project_id').notNull(),
  agentId: uuid('agent_id').notNull(),
  versionId: uuid('version_id').notNull(),
  phase: agentPhase('phase').notNull(),
  output: agentOutput('output').notNull(),
  memoryRead: jsonb('memory_read').$type<MemoryRead>(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.agentId], name: 'project_agent_pkey' }),
  foreignKey({
    columns: [table.projectId], foreignColumns: [projects.id],
    name: 'project_agent_project_id_fkey',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.agentId, table.phase, table.output], foreignColumns: [agents.id, agents.phase, agents.output],
    name: 'project_agent_contract_fk',
  }),
  foreignKey({
    columns: [table.agentId, table.versionId], foreignColumns: [agentVersions.agentId, agentVersions.id],
    name: 'project_agent_version_fk',
  }),
  uniqueIndex('project_agent_required_output_unique').on(table.projectId, table.output)
    .where(sql`${table.phase} <> 'analysis'`),
]);
