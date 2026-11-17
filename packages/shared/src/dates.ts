import { z } from 'zod';

/** JSON dates must be ISO timestamps, not arbitrary coercible values. */
export const dateFromJsonSchema = z.string().datetime().transform((value) => new Date(value));
