import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import type { CallTrace, RequestReservation } from '@choral/engine';
import { budgetReservations, llmCalls } from './schema.js';
import { lockedProject } from './memory.js';

export const budgetSchema = z
  .object({
    project_usd: z.number().finite().positive().optional(),
    turn_usd: z.number().finite().positive().optional(),
    prices: z
      .record(
        z
          .object({
            input_per_million: z.number().finite().nonnegative(),
            output_per_million: z.number().finite().nonnegative(),
          })
          .strict(),
      )
      .default({}),
  })
  .strict();
export const projectSettingsSchema = z.object({ budget: budgetSchema.optional() }).strict();
export class BudgetError extends Error {}

export function budgetHooks(db: NodePgDatabase) {
  const reserve: RequestReservation = async (options) =>
    db.transaction(async (tx) => {
      const project = await lockedProject(tx, options.projectId);
      const budget = projectSettingsSchema.parse(project.settings).budget;
      if (!budget || (!budget.project_usd && (!budget.turn_usd || !options.turnId))) return undefined;
      const price = budget.prices[options.model];
      if (!price) throw new BudgetError(`No budget pricing configured for ${options.model}`);
      const inputTokens =
        options.messages.reduce(
          (total, message) => total + Buffer.byteLength(message.content, 'utf8') + 20,
          0,
        ) + 20;
      const amount =
        Math.ceil(
          (inputTokens * price.input_per_million + options.maxTokens * price.output_per_million) * 1000,
        ) / 1e9;
      const [costs] = await tx
        .select({
          projectCost: sql<string>`coalesce(sum(coalesce(${llmCalls.accountedCostUsd}, ${llmCalls.costUsd})), 0)`,
          turnCost: sql<string>`coalesce(sum(case when ${llmCalls.turnId} = ${options.turnId ?? null} then coalesce(${llmCalls.accountedCostUsd}, ${llmCalls.costUsd}) else 0 end), 0)`,
          projectUnknown: sql<number>`count(*) filter (where coalesce(${llmCalls.accountedCostUsd}, ${llmCalls.costUsd}) is null)`,
          turnUnknown: sql<number>`count(*) filter (where ${llmCalls.turnId} = ${options.turnId ?? null} and coalesce(${llmCalls.accountedCostUsd}, ${llmCalls.costUsd}) is null)`,
        })
        .from(llmCalls)
        .where(eq(llmCalls.projectId, options.projectId));
      if (
        (budget.project_usd !== undefined && Number(costs.projectUnknown) > 0) ||
        (budget.turn_usd !== undefined && options.turnId && Number(costs.turnUnknown) > 0)
      ) {
        throw new BudgetError('Earlier LLM calls have unknown cost; budget cannot be enforced');
      }
      const [pending] = await tx
        .select({
          projectCost: sql<string>`coalesce(sum(coalesce(${budgetReservations.settledAmount}, ${budgetReservations.amount})), 0)`,
          turnCost: sql<string>`coalesce(sum(case when ${budgetReservations.turnId} = ${options.turnId ?? null} then coalesce(${budgetReservations.settledAmount}, ${budgetReservations.amount}) else 0 end), 0)`,
        })
        .from(budgetReservations)
        .where(eq(budgetReservations.projectId, options.projectId));
      if (
        budget.project_usd !== undefined &&
        Number(costs.projectCost) + Number(pending.projectCost) + amount > budget.project_usd
      ) {
        throw new BudgetError('Project budget would be exceeded');
      }
      if (
        options.turnId &&
        budget.turn_usd !== undefined &&
        Number(costs.turnCost) + Number(pending.turnCost) + amount > budget.turn_usd
      ) {
        throw new BudgetError('Turn budget would be exceeded');
      }
      const [reservation] = await tx
        .insert(budgetReservations)
        .values({
          projectId: options.projectId,
          turnId: options.turnId,
          amount: String(amount),
        })
        .returning();
      return reservation.id;
    });

  async function trace(trace: CallTrace, reservationId?: string) {
    await db.transaction(async (tx) => {
      const project = await lockedProject(tx, trace.projectId);
      let estimate: string | undefined;
      if (reservationId) {
        const [reservation] = await tx
          .select()
          .from(budgetReservations)
          .where(and(eq(budgetReservations.id, reservationId), eq(budgetReservations.projectId, project.id)));
        if (!reservation || reservation.settled)
          throw new Error('Budget reservation not found or already settled');
        estimate = reservation.amount;
        await tx.delete(budgetReservations).where(eq(budgetReservations.id, reservationId));
      }
      const cost = trace.costUsd === undefined ? undefined : String(trace.costUsd);
      await tx.insert(llmCalls).values({ ...trace, costUsd: cost, accountedCostUsd: cost ?? estimate });
    });
  }
  return { reserve, trace };
}
