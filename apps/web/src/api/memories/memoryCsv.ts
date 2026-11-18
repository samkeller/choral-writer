import { memoryImportSchema, type MemoryEntry, type MemoryImport, type MemoryState, type MemoryTag } from '@choral-writer/shared';

import { parseBoolean, parseCSV, toCSV } from '../csv/csv';

/**
 * Échange de la mémoire sous forme de deux fichiers CSV : un catalogue de tags
 * et une liste de souvenirs qui référencent les tags par nom. Le format reste
 * éditable dans un tableur ; les identifiants sont regénérés à l'import.
 */

const TAG_COLUMNS = ['nom', 'description'] as const;
const ENTRY_COLUMNS = ['cle', 'contenu', 'tags', 'protege', 'archive'] as const;
const TAG_SEPARATOR = '|';

/**
 * Modèles de fichiers montrés dans l'interface : l'en-tête attendu suivi de
 * lignes d'exemple. Dérivés du même codec que l'export, ils restent importables
 * tels quels et documentent le séparateur de tags ainsi que les booléens.
 */
export const TAG_CSV_TEMPLATE = csvTemplate(TAG_COLUMNS, [
  ['Lieux', 'Endroits du récit'],
  ['Personnes', 'Fiches des personnages'],
]);
export const ENTRY_CSV_TEMPLATE = csvTemplate(ENTRY_COLUMNS, [
  ['Château', 'Bâti sur la falaise.', 'Lieux', 'non', 'non'],
  ['Mara', 'Garde le château.', ['Personnes', 'Lieux'].join(TAG_SEPARATOR), 'oui', 'non'],
]);

function csvTemplate(columns: readonly string[], rows: readonly (readonly string[])[]): string {
  return toCSV(columns, rows).replace('\ufeff', '').trimEnd().replaceAll('\r\n', '\n');
}

/** Sérialise le catalogue de tags. */
export function memoryTagsToCsv(tags: readonly MemoryTag[]): string {
  return toCSV(TAG_COLUMNS, tags.map((tag) => [tag.name, tag.description]));
}

/** Sérialise les souvenirs d'une branche en résolvant les tags par leur nom. */
export function memoryEntriesToCsv(state: MemoryState): string {
  const names = new Map(state.tags.map((tag) => [tag.id, tag.name]));
  return toCSV(ENTRY_COLUMNS, state.entries.map((entry: MemoryEntry) => [
    entry.key,
    entry.content,
    entry.tagIds.map((id) => names.get(id) ?? id).join(TAG_SEPARATOR),
    entry.protected ? 'oui' : 'non',
    entry.archived ? 'oui' : 'non',
  ]));
}

/**
 * Lit les deux fichiers d'un remplacement de mémoire. Les souvenirs référencent
 * les tags par nom ; une référence absente du catalogue est refusée.
 */
export function parseMemoryCsvFiles(tagText: string, entryText: string): MemoryImport {
  if (!tagText.trim()) throw new Error('Le fichier des tags est vide.');
  if (!entryText.trim()) throw new Error('Le fichier des souvenirs est vide.');
  const tags = parseCSV(tagText, TAG_COLUMNS).map((row) => ({
    name: row.nom ?? '', description: row.description ?? '',
  }));
    // Un fichier réduit à son en-tête ne doit pas vider la mémoire par inadvertance.
    if (!tags.length) throw new Error('Le fichier des tags ne contient aucun tag.');
  const entries = parseCSV(entryText, ENTRY_COLUMNS).map((row) => ({
    key: row.cle ?? '',
    content: row.contenu ?? '',
    tagNames: [...new Set((row.tags ?? '').split(TAG_SEPARATOR).map((name) => name.trim())
      .filter((name) => name !== ''))],
    protected: parseBoolean(row.protege ?? '', 'protege'),
    archived: parseBoolean(row.archive ?? '', 'archive'),
  }));
  const parsed = memoryImportSchema.safeParse({ tags, entries });
  if (!parsed.success) {
    throw new Error('Les fichiers importés sont incomplets : vérifiez les colonnes et les valeurs des deux fichiers.');
  }
  return parsed.data;
}