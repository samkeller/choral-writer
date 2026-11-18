import { describe, expect, it } from 'vitest';

import type { MemoryState } from '@choral-writer/shared';
import {
  ENTRY_CSV_TEMPLATE, TAG_CSV_TEMPLATE, memoryEntriesToCsv, memoryTagsToCsv, parseMemoryCsvFiles,
} from './memoryCsv';

const now = '2026-01-01T00:00:00.000Z';

function state(): MemoryState {
  const place = '019ad30c-19b0-7000-8000-0000000000a1';
  const person = '019ad30c-19b0-7000-8000-0000000000a2';
  return {
    v: 2,
    tags: [
      { id: place, name: 'Lieux', description: 'Endroits du récit' },
      { id: person, name: 'Personnes', description: 'Fiches des personnages' },
    ],
    entries: [
      { id: '019ad30c-19b0-7000-8000-0000000000a3', key: 'Château', content: 'Bâti sur la falaise.',
        tagIds: [place], protected: false, archived: false, source: 'user', turnId: null, updatedAt: now },
      { id: '019ad30c-19b0-7000-8000-0000000000a4', key: 'Mara; la gardienne',
        content: 'Dit :\n« Tout va bien ».', tagIds: [person, place], protected: true, archived: true,
        source: 'guardian', turnId: '019ad30c-19b0-7000-8000-0000000000a5', updatedAt: now },
    ],
  };
}

describe('memory CSV exchange', () => {
  it('round-trips tags and entries through both exported files', () => {
    const source = state();
    const parsed = parseMemoryCsvFiles(memoryTagsToCsv(source.tags), memoryEntriesToCsv(source));
    expect(parsed.tags).toEqual(source.tags.map(({ name, description }) => ({ name, description })));
    expect(parsed.entries).toEqual([
      { key: 'Château', content: 'Bâti sur la falaise.', tagNames: ['Lieux'], protected: false, archived: false },
      { key: 'Mara; la gardienne', content: 'Dit :\n« Tout va bien ».',
        tagNames: ['Personnes', 'Lieux'], protected: true, archived: true },
    ]);
  });

  it('accepts the delimiters a spreadsheet may write and accents in headers', () => {
    const tags = 'Nom\tDescription\r\nLieux\tEndroits du récit\r\n';
    const entries = 'CLÉ,CONTENU,TAGS,PROTÉGÉ,ARCHIVE\r\nChâteau,"Bâti, sur la falaise.",Lieux,non,non\r\n';
    expect(parseMemoryCsvFiles(tags, entries)).toEqual({
      tags: [{ name: 'Lieux', description: 'Endroits du récit' }],
      entries: [{ key: 'Château', content: 'Bâti, sur la falaise.', tagNames: ['Lieux'],
        protected: false, archived: false }],
    });
  });

  it('writes an Excel-friendly file with a header and quoted separators', () => {
    const csv = memoryEntriesToCsv(state());
    expect(csv.startsWith('\ufeffcle;contenu;tags;protege;archive\r\n')).toBe(true);
    expect(csv).toContain('"Mara; la gardienne"');
    expect(csv).toContain('oui;oui');
  });

  it('rejects unusable files instead of importing silently wrong structures', () => {
    const source = state();
    expect(() => parseMemoryCsvFiles('', memoryEntriesToCsv(source))).toThrow('vide');
    expect(() => parseMemoryCsvFiles(memoryTagsToCsv(source.tags), 'cle;contenu\r\nChâteau;Texte\r\n'))
      .toThrow('Colonnes manquantes');
    expect(() => parseMemoryCsvFiles(memoryTagsToCsv(source.tags), 'cle;contenu;tags;protege;archive\r\n"non fermé\r\n'))
      .toThrow('illisible');
  });

  it('refuses to empty the memory from a header-only file', () => {
    expect(() => parseMemoryCsvFiles('nom;description\r\n', 'cle;contenu;tags;protege;archive\r\n'))
      .toThrow('aucun tag');
  });

  it('requires at least one tag per entry and reports invalid booleans', () => {
    const tags = memoryTagsToCsv([{ id: '019ad30c-19b0-7000-8000-0000000000a1', name: 'Lieux', description: 'Endroits' }]);
    expect(() => parseMemoryCsvFiles(tags, 'cle;contenu;tags;protege;archive\r\nClé;Texte;;non;non\r\n'))
      .toThrow('incomplets');
    expect(() => parseMemoryCsvFiles(tags, 'cle;contenu;tags;protege;archive\r\nClé;Texte;Lieux;peut-être;non\r\n'))
      .toThrow('oui ou non');
  });

  it('documents the format with templates that are importable as they are', () => {
    expect(TAG_CSV_TEMPLATE).toBe('nom;description\nLieux;Endroits du récit\nPersonnes;Fiches des personnages');
    expect(ENTRY_CSV_TEMPLATE).toBe(
      'cle;contenu;tags;protege;archive\nChâteau;Bâti sur la falaise.;Lieux;non;non\nMara;Garde le château.;Personnes|Lieux;oui;non');
    expect(parseMemoryCsvFiles(TAG_CSV_TEMPLATE, ENTRY_CSV_TEMPLATE)).toEqual({
      tags: [
        { name: 'Lieux', description: 'Endroits du récit' },
        { name: 'Personnes', description: 'Fiches des personnages' },
      ],
      entries: [
        { key: 'Château', content: 'Bâti sur la falaise.', tagNames: ['Lieux'], protected: false, archived: false },
        { key: 'Mara', content: 'Garde le château.', tagNames: ['Personnes', 'Lieux'], protected: true, archived: false },
      ],
    });
  });
});