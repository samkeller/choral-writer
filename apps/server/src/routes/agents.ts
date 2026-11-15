import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { agents } from '../schema.js';
import { assertNoActiveTurn, DomainError, lockedProject } from '../memory.js';
import { agentSchema } from '../agents.js';
import { projectIdSchema, type RouteDependencies } from './types.js';

export function registerAgentRoutes(app: FastifyInstance, { db }: RouteDependencies) {
  app.get('/api/projects/:id/agents', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    return db.select().from(agents).where(eq(agents.projectId, params.data.id));
  });
  app.post('/api/projects/:id/agents', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = agentSchema.safeParse(request.body);
    if (!params.success || !body.success || body.data.kind !== 'analysis') {
      return reply.code(400).send({ error: 'Invalid analysis agent' });
    }
    return db.transaction(async (tx) => {
      await lockedProject(tx, params.data.id);
      await assertNoActiveTurn(tx, params.data.id);
      const [existing] = await tx
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.projectId, params.data.id), eq(agents.key, body.data.key)));
      if (existing) throw new DomainError('Agent key already exists', 409);
      const agent = body.data;
      const [created] = await tx
        .insert(agents)
        .values({
          projectId: params.data.id,
          key: agent.key,
          name: agent.name,
          kind: agent.kind,
          systemPrompt: agent.system_prompt,
          model: agent.model,
          params: agent.params,
          contextSpec: agent.context,
          schedule: agent.schedule,
          required: agent.required,
          enabled: agent.enabled,
        })
        .returning();
      return reply.code(201).send(created);
    });
  });
  app.put('/api/agents/:id', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = agentSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid agent' });
    const [existing] = await db.select().from(agents).where(eq(agents.id, params.data.id));
    if (!existing) return reply.code(404).send({ error: 'Agent not found' });
    const agent = body.data;
    if (
      agent.key !== existing.key ||
      agent.kind !== existing.kind ||
      (agent.kind === 'output' &&
        agent.params.purpose !== (existing.params as { purpose?: string }).purpose) ||
      (agent.kind !== 'analysis' && !agent.enabled)
    ) {
      return reply.code(400).send({
        error: 'Key, kind and output purpose cannot change; core agents must remain enabled',
      });
    }
    return db.transaction(async (tx) => {
      await lockedProject(tx, existing.projectId);
      await assertNoActiveTurn(tx, existing.projectId);
      const [updated] = await tx
        .update(agents)
        .set({
          name: agent.name,
          systemPrompt: agent.system_prompt,
          model: agent.model,
          params: agent.params,
          contextSpec: agent.context,
          schedule: agent.schedule,
          required: agent.required,
          enabled: agent.enabled,
        })
        .where(eq(agents.id, existing.id))
        .returning();
      return updated;
    });
  });
}
