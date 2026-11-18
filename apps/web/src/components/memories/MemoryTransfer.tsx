import { useState, type ReactNode } from 'react';
import { Alert, Button, Code, CopyButton, FileInput, Group, Modal, Paper, Stack, Text } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import type { MemoryImport, MemoryMutation, MemoryView } from '@choral-writer/shared';

import {
  ENTRY_CSV_TEMPLATE, TAG_CSV_TEMPLATE, memoryEntriesToCsv, memoryTagsToCsv, parseMemoryCsvFiles,
} from '../../api/memories/memoryCsv';
import { getErrorMessage } from '../../api/client';
import { IconAction } from '../atoms/IconAction';

export const MEMORY_TAG_FILE = 'memoire-tags.csv';
export const MEMORY_ENTRY_FILE = 'memoire-souvenirs.csv';

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Un fichier de l'échange : son bouton de téléchargement, son format copiable et son import. */
function CsvFile({ label, file, template, description, download, input }: {
  label: string;
  file: string;
  template: string;
  description: string;
  download: () => void;
  input: ReactNode;
}) {
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" gap="xs" wrap="wrap">
          <Stack gap={2} miw={0} style={{ flex: '1 1 10rem' }}>
            <Text fw={600}>{label}</Text>
            <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{file}</Text>
          </Stack>
          <Group gap="xs" wrap="nowrap">
            <CopyButton value={template} timeout={2000}>
              {({ copied, copy }) => (
                <IconAction label={copied ? 'Format copié' : `Copier le format des ${label.toLocaleLowerCase('fr')}`}
                  onClick={copy}>
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </IconAction>
              )}
            </CopyButton>
            <Button variant="light" size="sm" onClick={download}>Télécharger</Button>
          </Group>
        </Group>
        <Text size="sm" c="dimmed">{description}</Text>
        <Code>{template}</Code>
        {input}
      </Stack>
    </Paper>
  );
}

/**
 * Échange la mémoire d'une branche avec deux fichiers CSV : un catalogue de tags
 * et une liste de souvenirs qui référencent les tags par nom. L'import remplace
 * intégralement la branche ; les identifiants sont regénérés côté serveur.
 */
export function MemoryTransfer({ view, pending, save, close }: {
  view: MemoryView;
  pending: boolean;
  save: (change: MemoryMutation['change']) => Promise<boolean>;
  close: () => void;
}) {
  const [tagFile, setTagFile] = useState<File | null>(null);
  const [entryFile, setEntryFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const busy = pending || parsing;

  async function replace() {
    if (!tagFile || !entryFile) return;
    setParsing(true);
    setError('');
    let memory: MemoryImport;
    try {
      memory = parseMemoryCsvFiles(await tagFile.text(), await entryFile.text());
    } catch (failure) {
      setError(getErrorMessage(failure));
      return;
    } finally {
      setParsing(false);
    }
    if (await save({ op: 'replaceMemory', memory })) close();
  }

  return (
    <Modal opened onClose={() => { if (!busy) close(); }} title="Import / export CSV" size="lg">
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          Deux fichiers à conserver ensemble : les souvenirs référencent les tags par leur nom.
          Chaque format est copiable tel quel et directement importable.
        </Text>
        <CsvFile label="Tags" file={MEMORY_TAG_FILE} template={TAG_CSV_TEMPLATE}
          description="Le catalogue des tags, référencés par leur nom depuis les souvenirs."
          download={() => download(MEMORY_TAG_FILE, memoryTagsToCsv(view.state.tags))}
          input={<FileInput label="Fichier des tags" accept=".csv,text/csv" clearable disabled={busy}
            value={tagFile} onChange={setTagFile} />} />
        <CsvFile label="Souvenirs" file={MEMORY_ENTRY_FILE} template={ENTRY_CSV_TEMPLATE}
          description="Les souvenirs de la branche. Les tags sont séparés par | ; protege et archive attendent oui ou non."
          download={() => download(MEMORY_ENTRY_FILE, memoryEntriesToCsv(view.state))}
          input={<FileInput label="Fichier des souvenirs" accept=".csv,text/csv" clearable disabled={busy}
            value={entryFile} onChange={setEntryFile} />} />
        <Alert color="yellow" title="Import destructif">
          Les tags et les souvenirs de la branche courante seront entièrement remplacés par le contenu des deux fichiers.
          Les accès mémoire des agents restent en place : un tag renommé doit être resélectionné.
        </Alert>
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" disabled={busy} onClick={close}>Annuler</Button>
          <Button color="red" loading={busy} disabled={!tagFile || !entryFile} onClick={() => void replace()}>
            Remplacer la mémoire
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
