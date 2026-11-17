import { useId } from 'react';
import { Badge, Box, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { Agent } from '@choral-writer/shared';

import { PromptDisplay } from '../llm/PromptDisplay';
import { PhaseTag } from '../phases/PhaseTag';
import { phasePresentation } from '../phases/phasePresentation';
import { AgentDetails } from './AgentDetails';
import { agentOutputPresentation } from './agentPresentation';
import { IconAction } from '../atoms/IconAction';
import styles from './AgentSurface.module.css';

interface AgentListProps {
  agents: Agent[];
  expandedIds: string[];
  onToggle: (id: string) => void;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
}

function AgentCard({ agent, expanded, onToggle, onEdit, onDelete }: {
  agent: Agent;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const id = useId();
  const latest = agent.versions[0];
  if (!latest) return null;
  const Chevron = expanded ? IconChevronUp : IconChevronDown;

  return (
    <Paper component="article" withBorder p={{ base: 'md', sm: 'lg' }}
      className={`${styles.surface} ${styles.agentCard}`} data-expanded={expanded || undefined}
      style={{ '--agent-phase-color': `var(--mantine-color-${phasePresentation[agent.phase].color}-5)` }}>
      <Group justify="space-between" align="flex-start" gap="md">
        <Stack gap="sm" className={styles.summary}>
          <Group gap="xs">
            <Title id={`${id}-title`} order={2} size="h4" className={styles.name}>{latest.name}</Title>
            <Badge size="xs" variant="outline" color="gray">v{latest.version}</Badge>
          </Group>
          <Group gap="xs">
            <PhaseTag phase={agent.phase} />
            <Text size="xs" c="dimmed">{agentOutputPresentation[agent.output].label}</Text>
          </Group>
          {!expanded && latest.instructions && (
            <PromptDisplay content={latest.instructions} compact />
          )}
        </Stack>
        <Stack gap="xs" align="flex-end">
          <IconAction label={`${expanded ? 'Réduire' : 'Consulter'} ${latest.name}`}
            variant={expanded ? 'light' : 'subtle'}
            aria-expanded={expanded} aria-controls={`${id}-detail`}
            onClick={onToggle}>
            <Chevron size={18} aria-hidden="true" />
          </IconAction>
          <Text size="xs" c="dimmed">{agent.projects.length} projet{agent.projects.length > 1 ? 's' : ''}</Text>
        </Stack>
      </Group>
      <Box id={`${id}-detail`} role="region" aria-labelledby={`${id}-title`} hidden={!expanded}>
        {expanded && <AgentDetails key={latest.id} agent={agent} onEdit={onEdit} onDelete={onDelete} />}
      </Box>
    </Paper>
  );
}

export function AgentList({ agents, expandedIds, onToggle, onEdit, onDelete }: AgentListProps) {
  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} role="status">
        {agents.length} agent{agents.length > 1 ? 's' : ''} · Bibliothèque globale
      </Text>
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} expanded={expandedIds.includes(agent.id)}
          onToggle={() => onToggle(agent.id)}
          onEdit={() => onEdit(agent)} onDelete={() => onDelete(agent)} />
      ))}
    </Stack>
  );
}
