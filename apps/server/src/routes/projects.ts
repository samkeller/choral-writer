import { and, eq, notInArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { agents, budgetReservations, globalSettings, llmCalls, projects, turns } from '../schema.js';
import { DomainError, ensureBranch, lockedProject } from '../memory.js';
import { agentSchema, defaultAgents } from '../agents.js';
import { withProjectExecutionLock } from '../locks.js';
import { BudgetError, projectSettingsSchema } from '../budget.js';
import { projectIdSchema, type RouteDependencies } from './types.js';

const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    worldMd: z.string().max(100_000).default(''),
    instructions: z.string().max(30_000).optional(),
    agentsYaml: z.string().max(100_000).optional(),
    settings: projectSettingsSchema.optional(),
  })
  .strict();
const callSchema = z.object({ prompt: z.string().trim().min(1).max(20_000) }).strict();

export function registerProjectRoutes(app: FastifyInstance, { db, settings, client }: RouteDependencies) {
  app.get('/api/settings/instructions', async () => {
    const [row] = await db.select().from(globalSettings).where(eq(globalSettings.key, 'instructions'));
    return { instructions: row.value };
  });
  app.put('/api/settings/instructions', async (request, reply) => {
    const body = z
      .object({ instructions: z.string().trim().min(1).max(30000) })
      .strict()
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid instructions' });
    await db
      .update(globalSettings)
      .set({ value: body.data.instructions })
      .where(eq(globalSettings.key, 'instructions'));
    return body.data;
  });
  app.post('/api/projects', async (request, reply) => {
    const body = createProjectSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid request' });
    let configs = defaultAgents(settings.llmModel);
    if (body.data.agentsYaml) {
      try {
        configs = z.array(agentSchema).min(1).parse(parseYaml(body.data.agentsYaml));
      } catch (error) {
        return reply.code(400).send({
          error: `Invalid agents YAML: ${error instanceof Error ? error.message : 'invalid format'}`,
        });
      }
    }
    if (
      new Set(configs.map((agent) => agent.key)).size !== configs.length ||
      configs.filter((agent) => agent.kind === 'interpreter' && agent.enabled).length !== 1 ||
      configs.filter(
        (agent) => agent.kind === 'output' && agent.params.purpose === 'narrator' && agent.enabled,
      ).length !== 1 ||
      configs.filter(
        (agent) => agent.kind === 'output' && agent.params.purpose === 'guardian' && agent.enabled,
      ).length !== 1
    ) {
      return reply.code(400).send({
        error: 'Agents require unique keys and exactly one enabled interpreter, narrator and guardian',
      });
    }
    const instructions = body.data.instructions ?? extractInstructions(body.data.worldMd);
    const project = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projects)
        .values({
          name: body.data.name,
          worldMd: body.data.worldMd,
          instructions,
          worldInitialized: !body.data.worldMd.trim(),
          settings: body.data.settings ?? {},
        })
        .returning();
      await tx.insert(agents).values(
        configs.map((agent) => ({
          projectId: created.id,
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
        })),
      );
      const branch = await ensureBranch(tx, created.id, null);
      return { ...created, activeBranchId: branch.branchId };
    });
    return reply.code(201).send(project);
  });
  app.get('/api/projects', async () => db.select().from(projects).orderBy(projects.createdAt));
  app.get('/api/projects/:id', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    const [project] = await db.select().from(projects).where(eq(projects.id, params.data.id));
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return project;
  });
  app.put('/api/projects/:id/settings', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const projectSettings = projectSettingsSchema.safeParse(request.body);
    if (!params.success || !projectSettings.success) {
      return reply.code(400).send({ error: 'Invalid project settings' });
    }
    return withProjectExecutionLock(db.$client, params.data.id, () =>
      db.transaction(async (tx) => {
        await lockedProject(tx, params.data.id);
        const [active] = await tx
          .select({ status: turns.status })
          .from(turns)
          .where(
            and(
              eq(turns.projectId, params.data.id),
              notInArray(turns.status, ['committed', 'failed', 'narrated']),
            ),
          )
          .limit(1);
        if (active) throw new DomainError('A turn is in progress', 409);
        const [updated] = await tx
          .update(projects)
          .set({ settings: projectSettings.data })
          .where(eq(projects.id, params.data.id))
          .returning();
        return updated;
      }),
    );
  });
  app.get('/api/projects/:id/budget-reservations', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, params.data.id));
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return db.select().from(budgetReservations).where(eq(budgetReservations.projectId, project.id));
  });
  app.post('/api/projects/:id/budget-reservations/:reservationId/settle', async (request, reply) => {
    const params = z
      .object({ id: z.string().uuid(), reservationId: z.string().uuid() })
      .safeParse(request.params);
    const body = z.object({ costUsd: z.number().finite().nonnegative() }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid settlement' });
    return withProjectExecutionLock(db.$client, params.data.id, () =>
      db.transaction(async (tx) => {
        await lockedProject(tx, params.data.id);
        const [updated] = await tx
          .update(budgetReservations)
          .set({ settledAmount: String(body.data.costUsd), settled: true })
          .where(
            and(
              eq(budgetReservations.id, params.data.reservationId),
              eq(budgetReservations.projectId, params.data.id),
              eq(budgetReservations.settled, false),
            ),
          )
          .returning();
        if (!updated) throw new DomainError('Reservation not found or already settled', 404);
        return updated;
      }),
    );
  });
  app.post('/api/projects/:id/llm-test', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    const body = callSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid request' });
    const [project] = await db.select().from(projects).where(eq(projects.id, params.data.id));
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return withProjectExecutionLock(db.$client, project.id, async () => {
      try {
        const response = await client.complete({
          projectId: project.id,
          purpose: 'test',
          model: settings.llmModel,
          messages: [{ role: 'user', content: body.data.prompt }],
          maxTokens: 512,
        });
        return { response };
      } catch (error) {
        if (error instanceof BudgetError) return reply.code(409).send({ error: error.message });
        request.log.error(error, 'LLM call failed');
        return reply.code(502).send({ error: 'LLM call failed; consult server logs' });
      }
    });
  });
  app.get('/api/projects/:id/llm-calls', async (request, reply) => {
    const params = projectIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid project ID' });
    return db
      .select()
      .from(llmCalls)
      .where(eq(llmCalls.projectId, params.data.id))
      .orderBy(llmCalls.createdAt);
  });
}

function extractInstructions(markdown: string): string {
  const sections = markdown.split(/(?=^#{1,2}\s)/m);
  return sections
    .filter((section) => /^#{1,2}\s+(pitch|style)\b/im.test(section))
    .join('\n\n')
    .trim();
}
