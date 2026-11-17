import { z } from 'zod';
import { dateFromJsonSchema } from '../../dates.js';

export const chatBranchParamsSchema = z.object({
  projectId: z.string().uuid(),
  branchId: z.string().uuid(),
});

export const chatBranchDtoSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  sourceBranchId: z.string().uuid().nullable(),
  forkTurnId: z.string().uuid().nullable(),
  headTurnId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export const chatBranchSchema = chatBranchDtoSchema.extend({ createdAt: dateFromJsonSchema });