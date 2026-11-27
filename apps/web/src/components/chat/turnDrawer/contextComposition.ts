import { contextPartSchema, type ContextComposition, type ContextPart } from '@choral-writer/shared';

/**
 * Parts of a call's context. History, the main suspect when inputs grow, is the only warm color;
 * contributions share the Analysis blue they come from, and the direction the indigo of its stage.
 */
export const contextPartPresentation = {
  systemPrompt: { label: 'Prompt du projet', color: 'violet.8' },
  instructions: { label: 'Instructions de l’agent', color: 'pink.7' },
  rules: { label: 'Consignes fixes', color: 'gray.6' },
  history: { label: 'Historique', color: 'orange.7' },
  memory: { label: 'Mémoire', color: 'teal.7' },
  contributions: { label: 'Contributions', color: 'blue.7' },
  developments: { label: 'Développements', color: 'cyan.8' },
  direction: { label: 'Direction', color: 'indigo.7' },
  prose: { label: 'Prose du tour', color: 'grape.7' },
  input: { label: 'Saisie', color: 'lime.8' },
} satisfies Record<ContextPart, { label: string; color: string }>;

/** Parts in a stable order, so that bars and legend read the same from one call to the next. */
export const contextParts = contextPartSchema.options;

/** Sum of the estimated parts; null when the composition was not recorded. */
export function estimatedTotal(composition: ContextComposition | null): number | null {
  return composition ? composition.reduce((sum, entry) => sum + entry.estimatedTokens, 0) : null;
}

export type CompositionSegment = { part: ContextPart; estimatedTokens: number; share: number };

/** Each part with its share of the estimated total, in the order of `contextParts`; empty without any token. */
export function compositionSegments(composition: ContextComposition): CompositionSegment[] {
  const total = estimatedTotal(composition) ?? 0;
  if (total === 0) return [];
  return contextParts.flatMap((part) => {
    const estimatedTokens = composition
      .filter((entry) => entry.part === part)
      .reduce((sum, entry) => sum + entry.estimatedTokens, 0);
    return estimatedTokens > 0 ? [{ part, estimatedTokens, share: estimatedTokens / total }] : [];
  });
}

/** Share of the history in a composition, from 0 to 1; null when the composition was not recorded. */
export function historyShare(composition: ContextComposition | null): number | null {
  if (!composition) return null;
  return compositionSegments(composition).find((segment) => segment.part === 'history')?.share ?? 0;
}
