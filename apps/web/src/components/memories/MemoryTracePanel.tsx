import { useEffect, useState } from 'react';
import { Accordion, Alert, Badge, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import type { MemoryResult } from '@choral-writer/shared';
import { getMemoryTrace } from '../../api/memories/memoriesApi';
import { getErrorMessage } from '../../api/client';
import { MarkdownContent } from '../llm/MarkdownContent';

const changeLabels: Record<string, string> = {
  create: 'Création', edit: 'Correction', archive: 'Archivage',
};

export function MemoryResultDisplay({ result }: { result: MemoryResult }) {
  return <Stack gap="xs">
    <Group gap="xs">
      <Badge color={result.status === 'failed' ? 'red' : result.status === 'success' ? 'green' : 'gray'}>
        {result.status === 'failed' ? 'Échec mémoire' : result.status === 'success' ? 'Mémoire traitée' : 'Non exécutée'}
      </Badge>
      <Text size="xs" c="dimmed">Gardien {(result.guardianMs / 1000).toFixed(1)} s · Écriture {(result.reducerMs / 1000).toFixed(1)} s</Text>
    </Group>
    <Text size="sm">{result.message}</Text>
    {result.code && <Text size="xs" c="dimmed">{result.code}</Text>}
    {result.changes.length > 0 && <Accordion variant="separated">
      {result.changes.map((change, index) => <Accordion.Item key={`${change.targetId}:${index}`} value={String(index)}>
        <Accordion.Control>{changeLabels[change.op] ?? change.op}
          {' · '}{change.reason}</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="xs">
            {change.before !== null && <><Text size="xs" fw={600}>Avant</Text><MarkdownContent content={change.before} /></>}
            {change.after !== null && <><Text size="xs" fw={600}>Après</Text><MarkdownContent content={change.after} /></>}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>)}
    </Accordion>}
  </Stack>;
}

export function MemoryTracePanel({ projectId, turnId }: { projectId: string; turnId: string }) {
  const [trace, setTrace] = useState<Awaited<ReturnType<typeof getMemoryTrace>> | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setTrace(null); setError('');
    void getMemoryTrace(projectId, turnId, controller.signal).then((next) => {
      if (!controller.signal.aborted) setTrace(next);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(getErrorMessage(failure)); });
    return () => controller.abort();
  }, [projectId, turnId, revision]);
  if (error) return <Alert color="red" role="alert">{error}
    <Button variant="subtle" onClick={() => setRevision((value) => value + 1)}>Réessayer</Button>
  </Alert>;
  if (!trace) return <Loader aria-label="Chargement des traces mémoire" />;
  return <Stack>
    <Text size="sm" c="dimmed">{trace.input
      ? `${trace.input.entries.length} entrée(s) dans l’état d’entrée du tour, avant filtrage par agent.`
      : 'Tour antérieur à M6 : aucun état mémoire d’entrée enregistré.'}</Text>
    {trace.runs.length === 0 && <Text>Aucun traitement mémoire enregistré.</Text>}
    {[...trace.runs].reverse().map((run) => <Paper p="sm" withBorder key={run.id}>
      <Text size="xs" c="dimmed" mb="xs">{new Date(run.createdAt).toLocaleString()}</Text>
      <MemoryResultDisplay result={run.result} />
    </Paper>)}
  </Stack>;
}
