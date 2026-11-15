import { describe, expect, it } from 'vitest';
import { applyMutation, emptyMemory, reduceProposal, replay, type Memory, type Mutation } from './memory.js';
import { buildContext } from './context.js';

const quote = 'source';
function accept(memory: Memory, proposal: unknown): Mutation {
  const result = reduceProposal(memory, proposal, { source: 'seed', evidence: quote });
  if (result.status !== 'accepted') throw new Error(JSON.stringify(result.rejection));
  return result.event;
}
function fixture() {
  let state = emptyMemory();
  const events: Mutation[] = [];
  for (const proposal of [
    { op: 'create_entity', key: 'leon', name: 'Léon', kind: 'person', source_quote: quote },
    { op: 'create_entity', key: 'marie', name: 'Marie', kind: 'person', source_quote: quote },
    { op: 'create_entity', key: 'pierre', name: 'Pierre', kind: 'person', source_quote: quote },
    {
      op: 'add_fact',
      text: 'Léon a tué le baron',
      subjects: ['leon'],
      tags: [],
      importance: 'HIGH',
      public: false,
      known_by: ['leon'],
      source_quote: quote,
    },
    {
      op: 'set_knowledge',
      character: 'marie',
      fact_ref: 'F1',
      content: 'Hugo a tué le baron',
      status: 'believes',
      is_false: true,
      source_quote: quote,
    },
  ]) {
    const event = accept(state, proposal);
    state = applyMutation(state, event);
    events.push(event);
  }
  return { state, events };
}
describe('memory', () => {
  it('replays events identically and rejects duplicates and unknown entities', () => {
    const { state, events } = fixture();
    expect(replay(events)).toEqual(state);
    expect(
      reduceProposal(
        state,
        {
          op: 'add_fact',
          text: ' LÉON   A TUÉ LE BARON ',
          subjects: ['leon'],
          tags: [],
          importance: 'HIGH',
          public: true,
          known_by: [],
          source_quote: quote,
        },
        { source: 'debug' },
      ),
    ).toMatchObject({ status: 'rejected', rejection: { code: 'DUPLICATE_FACT' } });
    expect(
      reduceProposal(
        state,
        {
          op: 'set_knowledge',
          character: 'unknown',
          content: 'test',
          status: 'believes',
          is_false: false,
          source_quote: quote,
        },
        { source: 'debug' },
      ),
    ).toMatchObject({ status: 'rejected', rejection: { code: 'ENTITY_NOT_FOUND' } });
  });

  it('requires an explicitly relevant resolution event for a high fact', () => {
    const { state } = fixture();
    const proposal = {
      op: 'supersede_fact',
      ref: 'F1',
      new_text: 'Le baron est vivant',
      known_by: ['leon'],
      reason: 'Il revient',
      source_quote: quote,
    };
    expect(reduceProposal(state, proposal, { source: 'guardian' })).toMatchObject({
      rejection: { code: 'HIGH_FACT_NEEDS_JUSTIFICATION' },
    });
    expect(
      reduceProposal(
        state,
        { ...proposal, resolution_event: 0 },
        {
          source: 'guardian',
          resolution: {
            happened: [{ text: 'Le baron revient', participants: ['marie'] }],
            time: { label: 'soir', elapsed_days: 0 },
          },
        },
      ),
    ).toMatchObject({ rejection: { code: 'HIGH_FACT_NEEDS_JUSTIFICATION' } });
    const result = reduceProposal(
      state,
      { ...proposal, resolution_event: 0 },
      {
        source: 'guardian',
        resolution: {
          happened: [{ text: 'Léon voit le baron revenir', participants: ['leon'] }],
          time: { label: 'soir', elapsed_days: 0 },
        },
      },
    );
    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      const next = applyMutation(state, result.event);
      expect(next.facts.map((fact) => fact.status)).toEqual(['superseded', 'active']);
      expect(next.knowledge.filter((row) => !row.ended)).toMatchObject([
        { character: 'leon', fact_ref: 'F2' },
      ]);
    }
  });

  it('keeps false beliefs separate from the secret truth in analysis contexts', () => {
    const { state } = fixture();
    const data = {
      memory: state,
      interpretation: { raw: 'Bonjour' },
      focus: ['marie', 'leon'],
      events: [{ text: 'Léon a tué le baron', participants: ['marie'] }],
      summaries: [{ level: 1, from_turn: 1, to_turn: 1, text: 'Léon a tué le baron' }],
      prose: [{ turn: 1, text: 'Léon a tué le baron' }],
    };
    const marie = buildContext(
      ['global', 'projet', 'agent'],
      data,
      {
        facts: { importance_min: 1, about: 'all' },
        knowledge_of: ['marie'],
        events: { last: 1 },
        summaries: [1],
        recent_prose: 1,
      },
      'analysis',
    );
    expect(marie).toContain('Hugo a tué le baron');
    expect(marie).not.toContain('Léon a tué le baron');
    expect(marie).not.toContain('F1');
    const pierre = buildContext(
      ['global', 'projet', 'agent'],
      data,
      { knowledge_of: ['pierre'] },
      'analysis',
    );
    expect(pierre).not.toContain('Hugo a tué le baron');
    expect(pierre).not.toContain('Léon a tué le baron');
    const narrator = buildContext(['global', 'projet', 'agent'], data, {}, 'output');
    expect(narrator).toContain('"fact_ref":"F1","content":"Hugo a tué le baron"');
    expect(() =>
      buildContext(['global', 'projet', 'agent'], data, { whiteboard: true }, 'analysis'),
    ).toThrow();
  });

  it('does not silently drop mandatory instructions to fit the budget', () => {
    const data = {
      memory: emptyMemory(),
      interpretation: { raw: 'x' },
      focus: [],
      events: [],
      summaries: [],
      prose: [],
    };
    expect(() =>
      buildContext(['global', 'projet', 'agent'], data, { max_input_tokens: 3 }, 'analysis'),
    ).toThrow();
  });

  it('builds history, summaries and prose excerpts only from authorized facts and beliefs', () => {
    let { state } = fixture();
    const publicFact = accept(state, {
      op: 'add_fact',
      text: 'La porte est fermée',
      subjects: ['marie'],
      tags: [],
      importance: 'LOW',
      public: true,
      known_by: [],
      source_quote: quote,
    });
    state = applyMutation(state, publicFact);
    const data = {
      memory: state,
      interpretation: { raw: 'Bonjour' },
      focus: ['marie'],
      events: [{ text: 'Léon a tué le baron', participants: ['marie'] }],
      summaries: [{ level: 1, from_turn: 1, to_turn: 1, text: 'Léon a tué le baron' }],
      prose: [{ turn: 1, text: 'Léon a tué le baron. La porte est fermée. Hugo a tué le baron.' }],
      analysis_history: [
        {
          turn: 1,
          entries: [
            { fact_ref: 'F1' },
            { fact_ref: 'F2' },
            {
              character: 'marie',
              fact_ref: 'F1',
              content: 'Hugo a tué le baron',
              status: 'believes' as const,
              is_false: true,
            },
          ],
        },
      ],
    };
    const marie = buildContext(
      ['global', 'projet', 'agent'],
      data,
      {
        knowledge_of: ['marie'],
        events: { last: 1 },
        summaries: [1],
        recent_prose: 1,
      },
      'analysis',
    );
    expect(marie).toContain('Événements:');
    expect(marie).toContain('Résumés:');
    expect(marie).toContain('Prose récente:');
    expect(marie).toContain('La porte est fermée');
    expect(marie).toContain('Hugo a tué le baron');
    expect(marie).not.toContain('Léon a tué le baron');
    const pierre = buildContext(
      ['global', 'projet', 'agent'],
      data,
      {
        knowledge_of: ['pierre'],
        events: { last: 1 },
        summaries: [1],
        recent_prose: 1,
      },
      'analysis',
    );
    expect(pierre).toContain('La porte est fermée');
    expect(pierre).not.toContain('Hugo a tué le baron');
    expect(pierre).not.toContain('Léon a tué le baron');
  });
});
