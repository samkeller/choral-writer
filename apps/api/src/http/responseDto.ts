import type { z } from 'zod';

/** Output validation failures are server bugs, not invalid client requests. */
export function parseResponseDto<T>(schema: z.ZodType<T>, value: NoInfer<T>): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error('Invalid API response DTO.', { cause: parsed.error });
  return parsed.data;
}
