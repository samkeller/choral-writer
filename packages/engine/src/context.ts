import { z } from 'zod';
import type { Memory } from './memory.js';
import type { Interpretation } from './contracts.js';

export const contextSpecSchema = z
  .object({
    max_input_tokens: z.number().int().positive().default(6000),
    rules: z.boolean().default(false),
    facts: z
      .object({
        importance_min: z.number().int().min(1).max(3).default(1),
        about: z.enum(['focus', 'all']).default('focus'),
      })
      .optional(),
    entities: z.union([z.enum(['none', 'focus', 'all']), z.array(z.string())]).default('none'),
    knowledge_of: z.array(z.string()).default([]),
    events: z.object({ last: z.number().int().nonnegative() }).optional(),
    summaries: z.array(z.number().int().positive()).default([]),
    recent_prose: z.number().int().nonnegative().default(0),
    whiteboard: z.boolean().default(false),
  })
  .strict();
export type ContextSpec = z.input<typeof contextSpecSchema>;
type NarrativeEvent = { text: string; participants: string[] };
type Summary = { level: number; from_turn: number; to_turn: number; text: string };
type Prose = { turn: number; text: string };
type AnalysisHistory = {
  turn: number;
  entries: {
    fact_ref?: string;
    character?: string;
    content?: string;
    status?: 'knows' | 'believes' | 'suspects';
    is_false?: boolean;
  }[];
};
export type ContextData = {
  memory: Memory;
  interpretation: Interpretation | { raw: string };
  focus: string[];
  events: NarrativeEvent[];
  summaries: Summary[];
  prose: Prose[];
  analysis_history?: AnalysisHistory[];
  whiteboard?: unknown;
};

export function buildContext(
  instructions: [string, string, string],
  data: ContextData,
  specInput: ContextSpec,
  kind: 'analysis' | 'output' | 'interpreter',
): string {
  const spec = contextSpecSchema.parse(specInput);
  if (kind !== 'output' && spec.whiteboard) throw new Error('Only output agents can access the whiteboard');
  const focus = new Set(data.focus);
  const allowed = new Set(spec.knowledge_of);
  const knownTruth = new Set(
    data.memory.knowledge
      .filter((row) => !row.ended && allowed.has(row.character) && !row.is_false && row.fact_ref)
      .map((row) => row.fact_ref),
  );
  const visible = data.memory.facts.filter(
    (fact) => fact.status === 'active' && (kind === 'output' || fact.public || knownTruth.has(fact.ref)),
  );
  const level = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;
  const relevant = (subjects: string[]) =>
    spec.facts?.about === 'all' || subjects.some((subject) => focus.has(subject));
  const selectedFacts =
    kind === 'output'
      ? visible
      : spec.facts
        ? visible.filter(
            (fact) => level[fact.importance] >= spec.facts!.importance_min && relevant(fact.subjects),
          )
        : [];
  const rules = spec.rules ? visible.filter((fact) => fact.tags.includes('rule')) : [];
  const entities = data.memory.entities.filter(
    (entity) =>
      kind === 'output' ||
      spec.entities === 'all' ||
      (spec.entities === 'focus' && focus.has(entity.key)) ||
      (Array.isArray(spec.entities) && spec.entities.includes(entity.key)),
  );
  const knowledge = data.memory.knowledge
    .filter((row) => !row.ended && (kind === 'output' || allowed.has(row.character)))
    .map((row) => {
      if (row.is_false && kind !== 'output')
        return { character: row.character, content: row.content, status: row.status, is_false: true };
      return row;
    });
  const selectedSummaries = data.summaries.filter(
    (summary) =>
      spec.summaries.includes(summary.level) &&
      !data.summaries.some(
        (higher) =>
          spec.summaries.includes(higher.level) &&
          higher.level > summary.level &&
          higher.from_turn <= summary.from_turn &&
          higher.to_turn >= summary.to_turn,
      ),
  );
  const history = (data.analysis_history ?? [])
    .map((turn) => ({
      turn: turn.turn,
      entries: turn.entries.flatMap((entry) => {
        if (entry.character) {
          if (!allowed.has(entry.character)) return [];
          const row = data.memory.knowledge.find(
            (item) =>
              !item.ended &&
              item.character === entry.character &&
              item.fact_ref === entry.fact_ref &&
              item.content === entry.content &&
              item.status === entry.status &&
              item.is_false === entry.is_false,
          );
          if (!row) return [];
          if (row.content) return [{ character: row.character, status: row.status, text: row.content }];
          const fact = visible.find((item) => item.ref === row.fact_ref);
          return fact ? [{ character: row.character, status: row.status, text: fact.text }] : [];
        }
        const fact = visible.find((item) => item.ref === entry.fact_ref);
        return fact ? [{ text: fact.text }] : [];
      }),
    }))
    .filter((turn) => turn.entries.length > 0);
  const summaries =
    kind === 'output'
      ? selectedSummaries
      : selectedSummaries.flatMap((summary) => {
          const entries = history.filter(
            (turn) => turn.turn >= summary.from_turn && turn.turn <= summary.to_turn,
          );
          return entries.length
            ? [
                {
                  level: summary.level,
                  from_turn: summary.from_turn,
                  to_turn: summary.to_turn,
                  text: entries
                    .map((turn) => `Tour ${turn.turn}: ${turn.entries.map((entry) => entry.text).join('; ')}`)
                    .join('\n'),
                },
              ]
            : [];
        });
  const visibleExcerpts = new Set([
    ...visible.map((fact) => fact.text),
    ...data.memory.knowledge
      .filter((row) => !row.ended && allowed.has(row.character) && row.content)
      .map((row) => row.content!),
  ]);
  const analysisProse = data.prose.slice(-spec.recent_prose).flatMap((item) => {
    const excerpts = [...visibleExcerpts].filter((text) => item.text.includes(text));
    return excerpts.length ? [{ turn: item.turn, excerpts }] : [];
  });
  const disclosure =
    kind === 'output'
      ? data.memory.entities
          .filter((entity) => focus.has(entity.key))
          .map((entity) => ({
            character: entity.key,
            facts: data.memory.facts
              .filter(
                (fact) =>
                  fact.status === 'active' &&
                  !fact.public &&
                  !data.memory.knowledge.some(
                    (row) =>
                      row.character === entity.key &&
                      row.fact_ref === fact.ref &&
                      !row.ended &&
                      !row.is_false,
                  ),
              )
              .map((fact) => fact.ref),
          }))
      : [];
  const suffix = [`Saisie : ${JSON.stringify(data.interpretation)}`];
  if (kind === 'output' && spec.whiteboard)
    suffix.push(`Whiteboard : ${JSON.stringify(data.whiteboard ?? [])}`);
  const budget = spec.max_input_tokens;
  const size = (value: string) => new TextEncoder().encode(value).length;
  let prompt = instructions.join('\n\n');
  const ending = `\n\n${suffix.join('\n\n')}`;
  if (size(prompt) + size(ending) > budget) throw new Error('Mandatory context exceeds input budget');
  const sections: [string, unknown[]][] = [
    ['Règles', rules],
    ['Entités', entities],
    ['Faits', selectedFacts],
    ['Connaissances', knowledge],
    ['Ne pas révéler à', disclosure],
    ['Résumés', summaries],
    [
      'Événements',
      spec.events?.last
        ? kind === 'output'
          ? data.events.slice(-spec.events.last)
          : history.slice(-spec.events.last)
        : [],
    ],
    [
      'Prose récente',
      spec.recent_prose ? (kind === 'output' ? data.prose.slice(-spec.recent_prose) : analysisProse) : [],
    ],
  ];
  for (const [label, items] of sections) {
    for (const item of items) {
      const part = `\n${label}: ${JSON.stringify(item)}`;
      if (size(prompt) + size(part) + size(ending) <= budget) {
        prompt += part;
      } else if (
        kind === 'output' &&
        ['Entités', 'Faits', 'Connaissances', 'Ne pas révéler à'].includes(label)
      ) {
        throw new Error('Critical output context exceeds input budget');
      }
    }
  }
  return prompt + ending;
}
