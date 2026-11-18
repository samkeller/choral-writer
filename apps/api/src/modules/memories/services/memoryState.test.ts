import { describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';
import { defaultMemoryRead, emptyMemoryState, type MemoryState, type ProjectAgent } from '@choral-writer/shared';
import { applyImportMemory, applyManualChange, applyMemorySetup, memoryPrompt, reduceProposals, selectedEntries, validateMemory } from './memoryState.js';

const now = '2026-01-01T00:00:00.000Z';
function setup() {
  const truth = uuidv7(), belief = uuidv7();
  const state: MemoryState = { ...emptyMemoryState(), tags: [
    { id: truth, name: 'world_rules', description: 'Faits canoniques établis.' },
    { id: belief, name: 'n_knowledge', description: 'Ce que N sait ou croit, même à tort.' },
  ], entries: [
    { id: uuidv7(), tagIds: [truth], key: 'Max', content: 'Max n’est pas un dieu.', protected: false,
      archived: false, source: 'user', turnId: null, updatedAt: now },
    { id: uuidv7(), tagIds: [belief], key: 'Max', content: 'N croit que Max est un dieu.', protected: false,
      archived: false, source: 'guardian', turnId: null, updatedAt: now },
  ] };
  const guardian: ProjectAgent = { agentId: uuidv7(), versionId: uuidv7(), name: 'Gardien', version: 1,
    phase: 'restitution', output: 'memory_proposals', instructions: '', memoryRead: defaultMemoryRead('memory_proposals') };
  return { state, guardian, truth, belief };
}

describe('memory tag routing and atomic reduction', () => {
  it('keeps canonical facts separate from beliefs, with OR matching and no implicit access', () => {
    const { state, truth, belief, guardian } = setup();
    const read = { mode: 'selected' as const, tagIds: [belief] };
    expect(selectedEntries(state, read).map((entry) => entry.content)).toEqual(['N croit que Max est un dieu.']);
    expect(memoryPrompt(state, { ...guardian, memoryRead: read })).not.toContain('Max n’est pas un dieu.');
    state.entries[1]!.legacy = { scopeId: belief, scopeName: 'N', scopeInstructions: 'Internal legacy writing policy.', tags: [] };
    expect(memoryPrompt(state, { ...guardian, memoryRead: read })).not.toContain('Internal legacy writing policy.');
    expect(selectedEntries(state, { mode: 'selected', tagIds: [truth, belief] })).toHaveLength(2);
    expect(selectedEntries(state, { mode: 'selected', tagIds: [uuidv7()] })).toEqual([]);
    expect(memoryPrompt(state, { ...guardian, output: 'envelope', memoryRead: null })).toBe('');
    state.entries[1]!.archived = true;
    expect(selectedEntries(state, read)).toEqual([]);
  });

  it('allows a justified revelation to archive a belief and explicitly broaden a fact audience', () => {
    const { state, truth, belief, guardian } = setup();
    const result = reduceProposals(state, [
      { op: 'archive', entryId: state.entries[1]!.id, reason: 'N assiste à la révélation.' },
      { op: 'edit', entryId: state.entries[0]!.id, content: 'Max n’est pas un dieu.',
        tagIds: [truth, belief], reason: 'N connaît maintenant ce fait.' },
    ], guardian, uuidv7(), uuidv7, now);
    expect(selectedEntries(result.state, { mode: 'selected', tagIds: [belief] }).map((entry) => entry.content))
      .toEqual(['Max n’est pas un dieu.']);
    expect(result.changes[1]).toMatchObject({ beforeTagIds: [truth], afterTagIds: [truth, belief] });
    expect(state.entries[1]!.archived).toBe(false);
  });

  it.each(['edit', 'archive', 'retag'] as const)('rejects %s of protected entries without applying earlier valid changes', (op) => {
    const { state, guardian, belief } = setup();
    state.entries[0]!.protected = true;
    const original = structuredClone(state);
    const forbidden = op === 'archive'
      ? { op: 'archive' as const, entryId: state.entries[0]!.id, reason: 'Test' }
      : { op: 'edit' as const, entryId: state.entries[0]!.id, content: state.entries[0]!.content,
        ...(op === 'retag' ? { tagIds: [belief] } : {}), reason: 'Test' };
    expect(() => reduceProposals(state, [
      { op: 'edit', entryId: state.entries[1]!.id, content: 'Autre croyance', reason: 'Test' }, forbidden,
    ], guardian, uuidv7(), uuidv7, now)).toThrow('protégé');
    expect(state).toEqual(original);
  });

  it('allows manual corrections and renames without changing identity or automatically protecting them', () => {
    const { state, guardian } = setup();
    const entry = state.entries[0]!;
    const edited = applyManualChange(state, { op: 'saveEntry', id: entry.id,
      entry: { key: 'Max corrigé', content: 'Max est mortel.', tagIds: entry.tagIds, protected: false },
    }, uuidv7, now);
    const result = reduceProposals(edited, [{ op: 'edit', entryId: entry.id,
      content: 'Max est devenu immortel.', reason: 'Transformation réellement narrée' }], guardian, uuidv7(), uuidv7, now);
    expect(result.state.entries[0]).toMatchObject({ id: entry.id, key: 'Max corrigé', content: 'Max est devenu immortel.' });
    expect(result.changes[0]!.before).toBe('Max est mortel.');
  });

  it('rejects unknown tags and duplicate targets without changing the source bank', () => {
    const { state, guardian } = setup();
    expect(() => reduceProposals(state, [{ op: 'create', tagIds: [uuidv7()], key: 'Autre',
      content: 'Souvenir', reason: 'Test' }], guardian, uuidv7(), uuidv7, now)).toThrow('tag inconnu');
    const edit = { op: 'edit' as const, entryId: state.entries[0]!.id, content: 'Autre', reason: 'Test' };
    expect(() => reduceProposals(state, [edit, edit], guardian, uuidv7(), uuidv7, now)).toThrow('Plusieurs propositions');
    expect(state.entries).toHaveLength(2);
  });

  it('resolves approved setup refs atomically without deleting existing memories or changing unmentioned tags', () => {
    const { state, guardian, truth } = setup();
    const analyst: ProjectAgent = { ...guardian, agentId: uuidv7(), output: 'envelope', phase: 'analysis' };
    const result = applyMemorySetup(state, {
      tags: [{ ref: 'new', name: 'objectifs', description: 'Objectifs actifs.' }],
      agents: [{ agentId: guardian.agentId, mode: 'all', tagRefs: [] },
        { agentId: analyst.agentId, mode: 'selected', tagRefs: [truth, 'new'] }],
    }, [guardian, analyst], uuidv7);
    expect(result.state.entries).toEqual(state.entries);
    expect(result.state.tags).toHaveLength(3);
    expect(result.assignments[1]!.read.tagIds).toEqual([truth, result.state.tags[2]!.id]);
    expect(state.tags).toHaveLength(2);
    expect(() => applyMemorySetup(state, { tags: [], agents: [
      { agentId: analyst.agentId, mode: 'selected', tagRefs: ['missing'] },
    ] }, [guardian, analyst], uuidv7)).toThrow('tag inconnu');
  });

  it('does not silently truncate active UTF-8 memory', () => {
    const { state } = setup();
    for (const entry of state.entries) entry.content = '€'.repeat(22_000);
    expect(() => validateMemory(state)).toThrow('128 Kio');
    state.entries[0]!.archived = true;
    expect(() => validateMemory(state)).not.toThrow();
  });

  it('refuses to apply a draft after its agent version changes', () => {
    const { state, guardian } = setup();
    expect(() => applyMemorySetup(state, { tags: [], agents: [
      { agentId: guardian.agentId, versionId: uuidv7(), mode: 'all', tagRefs: [] },
    ] }, [guardian], uuidv7)).toThrow('version d’un agent');
  });

  it('replaces tags and entries from an import while keeping identities of reused tags', () => {
    const { state, truth } = setup();
    const next = applyImportMemory(state, {
      tags: [{ name: 'WORLD_RULES', description: 'Faits canoniques établis.' },
        { name: 'Objectifs', description: 'Buts actifs.' }],
      entries: [
        { key: 'Max', content: 'Max est mortel.', tagNames: ['world_rules'], protected: false, archived: false },
        { key: 'Quête', content: 'Trouver la clé.', tagNames: ['Objectifs', 'world_rules'],
          protected: true, archived: true },
      ],
    }, uuidv7, now);
    expect(next.entries).toHaveLength(2);
    expect(next.tags.map((tag) => tag.name)).toEqual(['WORLD_RULES', 'Objectifs']);
    // Le tag conservé garde son identifiant pour ne pas casser les accès mémoire des agents.
    expect(next.tags[0]!.id).toBe(truth);
    expect(next.entries[0]).toMatchObject({ key: 'Max', tagIds: [truth], source: 'user', turnId: null, updatedAt: now });
    expect(next.entries[1]).toMatchObject({ tagIds: [next.tags[1]!.id, truth], protected: true, archived: true });
    expect(next.entries[0]!.id).not.toBe(state.entries[0]!.id);
  });

  it('rejects an import with an unknown tag, a duplicate tag, or an oversized active memory', () => {
    const { state } = setup();
    const tags = [{ name: 'Faits', description: 'Faits.' }];
    expect(() => applyImportMemory(state, { tags, entries: [
      { key: 'Max', content: 'Texte', tagNames: ['Absent'], protected: false, archived: false },
    ] }, uuidv7, now)).toThrow('tag absent');
    expect(() => applyImportMemory(state, { tags: [tags[0]!, { name: 'faits', description: 'Doublon.' }],
      entries: [] }, uuidv7, now)).toThrow('existe déjà');
    expect(() => applyImportMemory(state, { tags, entries: [
      { key: 'Long 1', content: '€'.repeat(30_000), tagNames: ['Faits'], protected: false, archived: false },
      { key: 'Long 2', content: '€'.repeat(30_000), tagNames: ['Faits'], protected: false, archived: false },
    ] }, uuidv7, now)).toThrow('128 Kio');
    expect(state.tags).toHaveLength(2);
  });
});
