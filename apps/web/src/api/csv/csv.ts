import Papa from 'papaparse';

/**
 * Lecture et écriture CSV génériques. Le transport du texte délimité est isolé
 * du métier : les modules appelants fournissent les colonnes attendues et
 * valident eux-mêmes les valeurs qu'ils en extraient.
 */

/** Lignes d'un fichier délimité, indexées par leurs en-têtes normalisés. */
export type CsvRow = Record<string, string>;

const DEFAULT_DELIMITER = ';';
const CANDIDATE_DELIMITERS = [';', '\t', ','];

/**
 * Un en-tête est comparé sans casse, sans accents et sans séparateurs :
 * « Clé », « cle » et « CLÉ » désignent la même colonne.
 */
export function normalizeHeader(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLocaleLowerCase('fr').replace(/[\s-]+/g, '_');
}

/** Le séparateur est déduit de la première ligne pour accepter les exports Excel et Numbers. */
function detectDelimiter(text: string): string {
  const header = text.split('\n', 1)[0] ?? '';
  return CANDIDATE_DELIMITERS.reduce((best, candidate) =>
    header.split(candidate).length > header.split(best).length ? candidate : best, DEFAULT_DELIMITER);
}

/**
 * Lit un fichier délimité en lignes nommées par leurs en-têtes. Les lignes
 * vides sont ignorées ; une colonne attendue absente rend le fichier inutilisable.
 */
export function parseCSV(text: string, expected: readonly string[]): CsvRow[] {
  const result = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    delimiter: detectDelimiter(text),
    transformHeader: normalizeHeader,
  });
  if (result.errors.length) throw new Error(`Fichier illisible : ${result.errors[0]!.message}`);
  const columns = result.meta.fields ?? [];
  const missing = expected.filter((column) => !columns.includes(column));
  if (missing.length) throw new Error(`Colonnes manquantes : ${missing.join(', ')}.`);
  return result.data;
}

/**
 * Écrit un fichier lisible par un tableur : BOM et CRLF sont attendus par Excel,
 * qui reste l'outil d'édition courant de ces listes.
 */
export function toCSV(headers: readonly string[], rows: readonly (readonly string[])[], delimiter = DEFAULT_DELIMITER): string {
  return `\ufeff${[[...headers], ...rows].map((row) =>
    row.map((value) => escapeCell(value, delimiter)).join(delimiter)).join('\r\n')}\r\n`;
}

function escapeCell(value: string, delimiter: string): string {
  return /["\r\n]/.test(value) || value.includes(delimiter) || value.trim() !== value
    ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Accepte les graphies françaises et anglaises utilisées dans les tableurs. */
export function parseBoolean(value: string, label: string): boolean {
  const normalized = value.trim().toLocaleLowerCase('fr');
  if (['1', 'oui', 'o', 'vrai', 'true', 'yes', 'y', 'x'].includes(normalized)) return true;
  if (['', '0', 'non', 'n', 'faux', 'false', 'no'].includes(normalized)) return false;
  throw new Error(`La valeur « ${value} » de « ${label} » doit être oui ou non.`);
}