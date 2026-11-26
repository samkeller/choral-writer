import { useState } from 'react';
import { Badge, Group, Paper, Select, Stack, Text } from '@mantine/core';
import type { AnalysisEnvelope } from '@choral-writer/shared';

import styles from './AnalysisEnvelopeDisplay.module.css';
import { DevelopmentScopeBadge } from './DevelopmentScopeBadge';

const importanceOrder = { HIGH: 0, NORMAL: 1, LOW: 2 };

export function AnalysisEnvelopeDisplay({
  envelope, agentName = envelope.agent,
}: {
  envelope: AnalysisEnvelope;
  agentName?: string;
}) {
  const [selectedKind, setSelectedKind] = useState<string | null>(null);
  const kinds = [...new Set(envelope.items.map((item) => item.kind))];
  const items = envelope.items
    .filter((item) => selectedKind === null || item.kind === selectedKind)
    .sort((left, right) => importanceOrder[left.importance] - importanceOrder[right.importance]);

  return (
    <Paper p="sm" withBorder className={styles.envelope}>
      <Text fw={600} mb="xs">{agentName}</Text>
      <Text size="sm" mb="sm">{envelope.summary}</Text>
      {kinds.length > 0 && (
        <Select
          label="Type d’élément"
          aria-label={`Filtrer les éléments de ${agentName}`}
          placeholder={`Tous (${envelope.items.length})`}
          value={selectedKind}
          onChange={setSelectedKind}
          data={kinds.map((kind) => ({
            value: kind,
            label: `${kind} (${envelope.items.filter((item) => item.kind === kind).length})`,
          }))}
          clearable
          clearButtonProps={{
            'aria-label': `Afficher tous les éléments de ${agentName}`,
            'aria-hidden': false,
            tabIndex: 0,
          }}
          size="xs"
          mb="sm"
          className={styles.filter}
          comboboxProps={{ withinPortal: false }}
        />
      )}
      <Stack gap={0}>
        {items.map((item, index) => (
          <div key={`${item.kind}-${index}`} className={styles.item}>
            <Group gap="xs" mb={4}>
              <Badge variant="light" color="blue">{item.kind}</Badge>
              <ImportanceBadge importance={item.importance} />
              <DevelopmentScopeBadge item={item} />
            </Group>
            <Text size="sm">{item.text}</Text>
          </div>
        ))}
      </Stack>
    </Paper>
  );
}

function ImportanceBadge({ importance }: { importance: 'LOW' | 'NORMAL' | 'HIGH' }) {
  const presentation = {
    LOW: { label: 'Faible', color: 'gray' },
    NORMAL: { label: 'Normale', color: 'blue' },
    HIGH: { label: 'Élevée', color: 'yellow' },
  }[importance];
  return <Badge size="xs" variant="light" color={presentation.color}>{presentation.label}</Badge>;
}
