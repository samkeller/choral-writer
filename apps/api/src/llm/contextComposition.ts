import { CONTEXT_CHARS_PER_TOKEN, type ContextComposition, type ContextPart } from '@choral-writer/shared';

/**
 * A piece of a request's text, tagged with the part of the context it belongs to. `embedded` names
 * the passages of `text` that belong to another part, such as developments listed among contributions:
 * they are counted under their own part and taken out of this one.
 */
export type ContextSection = {
  part: ContextPart;
  text: string;
  embedded?: readonly { part: ContextPart; text: string }[];
};

/** An estimate from the length of the text; the provider's `inputTokens` stays the real count. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CONTEXT_CHARS_PER_TOKEN);
}

/** Text of the non-empty sections, as a prompt reads them. */
export function joinSections(sections: readonly ContextSection[]): string {
  return sections.map((section) => section.text).filter(Boolean).join('\n\n');
}

/**
 * Estimated tokens per part, in order of first appearance; sections of the same part add up and
 * empty parts are left out. Separators and message framing are not counted.
 */
export function measureComposition(sections: readonly ContextSection[]): ContextComposition {
  const totals = new Map<ContextPart, number>();
  const add = (part: ContextPart, tokens: number) => {
    if (tokens > 0) totals.set(part, (totals.get(part) ?? 0) + tokens);
  };
  for (const { part, text, embedded = [] } of sections) {
    const embeddedTokens = embedded.map((passage) => estimateTokens(passage.text));
    add(part, Math.max(0, estimateTokens(text) - embeddedTokens.reduce((sum, tokens) => sum + tokens, 0)));
    embedded.forEach((passage, index) => add(passage.part, embeddedTokens[index] ?? 0));
  }
  return [...totals].map(([part, estimatedTokens]) => ({ part, estimatedTokens }));
}
