import { useMemo, useState } from 'react';
import { Code, SegmentedControl, Stack, Text } from '@mantine/core';
import { analysisEnvelopeSchema } from '@choral-writer/shared';

import { AnalysisEnvelopeDisplay } from './AnalysisEnvelopeDisplay';
import { MarkdownContent } from './MarkdownContent';
import styles from './LLMResponseDisplay.module.css';

interface LLMResponseDisplayProps {
  response: string | null;
}

type ParsedResponse =
  | { kind: 'empty' }
  | { kind: 'text'; content: string }
  | { kind: 'json'; value: unknown; formatted: string };

export function LLMResponseDisplay({ response }: LLMResponseDisplayProps) {
  const [view, setView] = useState<'visual' | 'json'>('visual');
  const parsed = useMemo<ParsedResponse>(() => {
    if (!response?.trim()) return { kind: 'empty' };
    try {
      const value: unknown = JSON.parse(response);
      return { kind: 'json', value, formatted: JSON.stringify(value, null, 2) ?? String(value) };
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return { kind: 'text', content: response };
    }
  }, [response]);

  if (parsed.kind === 'empty') {
    return <Text c="dimmed">Aucune réponse enregistrée.</Text>;
  }
  if (parsed.kind === 'text') {
    const narrator = parsed.content.match(/^\s*<resolution>([\s\S]*?)<\/resolution>\s*<prose>([\s\S]*?)<\/prose>\s*$/);
    const resolution = narrator?.[1];
    const prose = narrator?.[2];
    return (
      <Stack gap="sm" className={styles.response}>
        <SegmentedControl fullWidth value={view}
          onChange={(value) => { if (value === 'visual' || value === 'json') setView(value); }}
          data={[{ value: 'visual', label: 'Lecture' }, { value: 'json', label: 'Source' }]} />
        {view === 'json'
          ? <Code block className={styles.formatted}>{parsed.content}</Code>
          : resolution !== undefined && prose !== undefined
            ? <>
                <details className={styles.branch}>
                  <summary>Résolution</summary>
                  <MarkdownContent content={resolution} />
                </details>
                <section aria-label="Narration"><MarkdownContent content={prose} /></section>
              </>
            : <MarkdownContent content={parsed.content} />}
      </Stack>
    );
  }

  const envelope = analysisEnvelopeSchema.safeParse(parsed.value);
  return (
    <Stack gap="sm" className={styles.response}>
      <SegmentedControl
        fullWidth
        value={view}
        onChange={(value) => {
          if (value === 'visual' || value === 'json') setView(value);
        }}
        data={[
          { value: 'visual', label: envelope.success ? 'Whiteboard' : 'Visuel' },
          { value: 'json', label: 'JSON' },
        ]}
      />
      {view === 'json'
        ? <Code block className={styles.formatted}>{parsed.formatted}</Code>
        : envelope.success
          ? <AnalysisEnvelopeDisplay envelope={envelope.data} />
          : <JsonTree value={parsed.value} />}
    </Stack>
  );
}

function JsonTree({ value }: { value: unknown }) {
  return <Stack gap={4} className={styles.tree}><JsonNode name="Réponse" value={value} depth={0} /></Stack>;
}

function JsonNode({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <Scalar name={name} value="[]" />;
    return (
      <details open={depth === 0} className={styles.branch}>
        <summary>
          <span className={styles.branchTitle}>{name}</span>
          <span className={styles.branchCount}>{value.length} éléments</span>
        </summary>
        <div className={styles.children}>
          {value.map((entry, index) => (
            <JsonNode key={index} name={`[${index}]`} value={entry} depth={depth + 1} />
          ))}
        </div>
      </details>
    );
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return <Scalar name={name} value="{}" />;
    return (
      <details open={depth === 0} className={styles.branch}>
        <summary>
          <span className={styles.branchTitle}>{name}</span>
          <span className={styles.branchCount}>{entries.length} clés</span>
        </summary>
        <div className={styles.children}>
          {entries.map(([key, entry]) => (
            <JsonNode key={key} name={key} value={entry} depth={depth + 1} />
          ))}
        </div>
      </details>
    );
  }

  return <Scalar name={name} value={typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)} />;
}

function Scalar({ name, value }: { name: string; value: string }) {
  return (
    <div className={styles.scalar}>
      <Text size="sm" fw={500}>{name}</Text>
      <Text size="sm" c="dimmed" className={styles.scalarValue}>{value}</Text>
    </div>
  );
}
