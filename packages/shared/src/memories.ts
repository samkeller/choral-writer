import { z } from 'zod';

const id = z.string().uuid();
const name = z.string().trim().min(1).max(120);
const reason = z.string().trim().min(1).max(2000);
const uniqueIds = id.array().max(100).refine((ids) => new Set(ids).size === ids.length, 'Identifiants répétés.');
const requiredTags = uniqueIds.refine((ids) => ids.length > 0, 'Choisissez au moins un tag.');

export const legacyMemoryReadSchema = z.object({
  mode: z.enum(['none', 'all', 'selected']), scopeIds: id.array(),
  tags: z.string().array(), keyPrefixes: z.string().array(),
}).strict();
export type LegacyMemoryRead = z.infer<typeof legacyMemoryReadSchema>;

export const memoryReadSchema = z.object({
  mode: z.enum(['none', 'all', 'selected']),
  tagIds: uniqueIds,
}).strict().refine((read) => read.mode === 'selected' || read.tagIds.length === 0,
  'La lecture complète ou désactivée ne prend pas de tags.');
export type MemoryRead = z.infer<typeof memoryReadSchema>;

export function defaultMemoryRead(output: string): MemoryRead {
  return { mode: output === 'envelope' ? 'selected' : 'all', tagIds: [] };
}

export const memoryTagInputSchema = z.object({
  name, description: z.string().trim().min(1).max(2000),
}).strict();
export const memoryTagSchema = memoryTagInputSchema.extend({ id });
export type MemoryTag = z.infer<typeof memoryTagSchema>;

const legacyScope = z.object({
  id, name, instructions: z.string(), writable: z.boolean(), archived: z.boolean().optional(),
});
export const legacyMemoryCatalogSchema = z.object({
  scopes: legacyScope.array(), templates: legacyScope.array(),
});
export type LegacyMemoryCatalog = z.infer<typeof legacyMemoryCatalogSchema>;

export const memoryEntryInputSchema = z.object({
  key: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(32_000),
  tagIds: requiredTags,
  protected: z.boolean(),
}).strict();
export const memoryEntrySchema = memoryEntryInputSchema.extend({
  id, archived: z.boolean(),
  source: z.enum(['user', 'guardian']),
  turnId: id.nullable(),
  updatedAt: z.string().datetime(),
  legacy: z.object({ scopeId: id, scopeName: z.string(), scopeInstructions: z.string(), tags: z.string().array() }).optional(),
});
export type MemoryEntry = z.infer<typeof memoryEntrySchema>;
export const memoryContextSchema = z.object({
  tags: memoryTagSchema.array(),
  entries: memoryEntrySchema.pick({ id: true, key: true, content: true, tagIds: true, legacy: true }).array(),
});
export type MemoryContext = z.infer<typeof memoryContextSchema>;
export const memoryStateSchema = z.object({
  v: z.literal(2),
  tags: memoryTagSchema.array().max(300),
  entries: memoryEntrySchema.array().max(2000),
  legacy: legacyMemoryCatalogSchema.optional(),
}).strict();
export type MemoryState = z.infer<typeof memoryStateSchema>;
export const emptyMemoryState = (): MemoryState => ({ v: 2, tags: [], entries: [] });
export type MemoryCatalog = { v: 2; tags: MemoryTag[]; legacy?: LegacyMemoryCatalog };
export type MemoryBank = { v: 2; entries: MemoryEntry[] };

export const memoryViewSchema = z.object({
  projectId: id, branchId: id, headTurnId: id.nullable(),
  revisionId: id.nullable(), catalogRevisionId: id.nullable(),
  enabled: z.boolean(), state: memoryStateSchema,
});
export type MemoryView = z.infer<typeof memoryViewSchema>;
export const memoryExpectedSchema = z.object({
  expectedHeadTurnId: id.nullable(),
  expectedRevisionId: id.nullable(),
  expectedCatalogRevisionId: id.nullable(),
}).strict();

/**
 * Contenu d'un remplacement intégral de la mémoire, quel que soit son mode de
 * saisie (formulaire ou import de fichiers). Les entrées référencent les tags
 * par nom pour rester indépendantes des identifiants générés par le serveur.
 */
export const memoryImportEntrySchema = z.object({
  key: memoryEntryInputSchema.shape.key,
  content: memoryEntryInputSchema.shape.content,
  tagNames: z.string().trim().min(1).max(120).array().min(1).max(100),
  protected: z.boolean(),
  archived: z.boolean(),
}).strict();

export const memoryImportSchema = z.object({
  tags: memoryTagInputSchema.array().max(300),
  entries: memoryImportEntrySchema.array().max(2000),
}).strict();

export type MemoryImport = z.infer<typeof memoryImportSchema>;

const tagRef = z.string().trim().min(1).max(120);
export const memorySetupProposalSchema = z.object({
  tags: memoryTagInputSchema.extend({ ref: tagRef }).array().max(300),
  agents: z.object({
    agentId: id, versionId: id.optional(), mode: z.enum(['none', 'all', 'selected']), tagRefs: tagRef.array().max(100),
  }).strict().array().max(100),
}).strict();
export type MemorySetupProposal = z.infer<typeof memorySetupProposalSchema>;

const mutation = z.discriminatedUnion('op', [
  z.object({ op: z.literal('settings'), enabled: z.boolean() }),
  z.object({ op: z.literal('saveTag'), id: id.optional(), tag: memoryTagInputSchema }),
  z.object({ op: z.literal('applySetup'), proposal: memorySetupProposalSchema }),
  z.object({ op: z.literal('saveEntry'), id: id.optional(), entry: memoryEntryInputSchema }),
  z.object({ op: z.literal('archiveEntry'), id, archived: z.boolean() }),
  z.object({ op: z.literal('setAgentRead'), agentId: id, read: memoryReadSchema }),
  z.object({ op: z.literal('replaceMemory'), memory: memoryImportSchema }),
]);
export const memoryMutationSchema = z.object({
  ...memoryExpectedSchema.shape, change: mutation,
}).strict();
export type MemoryMutation = z.infer<typeof memoryMutationSchema>;

export const memoryProposalSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), key: memoryEntryInputSchema.shape.key,
    content: memoryEntryInputSchema.shape.content, tagIds: requiredTags, reason }).strict(),
  z.object({ op: z.literal('edit'), entryId: id, content: memoryEntryInputSchema.shape.content,
    key: memoryEntryInputSchema.shape.key.optional(), tagIds: requiredTags.optional(), reason }).strict(),
  z.object({ op: z.literal('archive'), entryId: id, reason }).strict(),
]);
export const memoryTagSuggestionSchema = memoryTagInputSchema.extend({ reason }).strict();
export const memoryProposalsSchema = z.object({
  v: z.literal(2), proposals: memoryProposalSchema.array().max(100),
  tagSuggestions: memoryTagSuggestionSchema.array().max(10).default([]),
}).strict();
export type MemoryProposal = z.infer<typeof memoryProposalSchema>;
export const memoryChangeSchema = z.object({
  op: z.string(), targetId: id, reason: z.string(),
  before: z.string().nullable(), after: z.string().nullable(),
  beforeTagIds: id.array().optional(), afterTagIds: id.array().optional(),
});
export const memoryResultSchema = z.object({
  status: z.enum(['success', 'failed', 'skipped']),
  message: z.string(), code: z.string().nullable(),
  changes: memoryChangeSchema.array(),
  tagSuggestions: memoryTagSuggestionSchema.array().optional(),
  guardianMs: z.number().int().nonnegative(), reducerMs: z.number().int().nonnegative(),
});
export type MemoryResult = z.infer<typeof memoryResultSchema>;
export const memoryRunSchema = z.object({
  id, turnId: id, branchId: id, createdAt: z.string().datetime(), result: memoryResultSchema,
});
export type MemoryRun = z.infer<typeof memoryRunSchema>;
export const memoryTraceSchema = z.object({
  input: memoryStateSchema.nullable(), runs: memoryRunSchema.array(),
});
