import { useId, type ReactNode } from 'react';
import { Badge, Box, Button, getThemeColor, Group, Select, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { IconLibrary, IconPlus, IconX } from '@tabler/icons-react';
import type { Agent } from '@choral-writer/shared';

import { addAgent, removeAgent, replaceVersion, roleCardinality, selectedVersion } from '../../hooks/useAgentTeam';
import { IconAction } from '../atoms/IconAction';
import { stagePresentation } from '../phases/stagePresentation';
import styles from './AgentTeamPipeline.module.css';

type Team = { agents: Agent[]; versionIds: string[]; change: (ids: string[]) => void };
type Version = Agent['versions'][number];

/** What a screen adds to an agent's row: a short summary, its own actions, an expanded detail. */
export type AgentRowExtras = { summary?: ReactNode; actions?: ReactNode; details?: ReactNode };

type TeamStep = {
  output: Agent['output'];
  stage: keyof typeof stagePresentation;
  description: string;
  empty: string;
};

/** The team's roles, in the order the pipeline runs them. */
const teamSteps: TeamStep[] = [
  {
    output: 'envelope', stage: 'analysis',
    description: 'Examinent la situation avant la narration et apportent leurs perspectives au Narrateur.',
    empty: 'Aucun agent d’analyse : le Narrateur écrit sans perspective préalable.',
  },
  {
    output: 'direction', stage: 'direction',
    description: 'Retient ou écarte les contributions et oriente la scène, sans en fixer l’issue.',
    empty: 'Sans Directeur, le tour passe directement de l’analyse au Narrateur.',
  },
  {
    output: 'narrative', stage: 'narrator',
    description: 'Écrit la prose montrée à l’utilisateur.',
    empty: 'Aucun Narrateur : choisissez-en un pour pouvoir jouer.',
  },
  {
    output: 'memory_proposals', stage: 'guardian',
    description: 'Propose les modifications de la mémoire après le tour.',
    empty: 'Aucun Gardien : choisissez-en un pour pouvoir jouer.',
  },
];

/**
 * Edits a team of agents role by role, in pipeline order: one row per retained agent,
 * then the library agents that can join this role. How many agents a role takes is
 * decided by `roleCardinality` in `useAgentTeam`; this component only reflects it.
 */
export function AgentTeamPipeline({ team, disabled, onCreate, extras }: {
  team: Team;
  disabled?: boolean;
  /** Offers to create an agent for a role; the caller is expected to add it to the team. */
  onCreate?: (output: Agent['output']) => void;
  extras?: (agent: Agent) => AgentRowExtras;
}) {
  return (
    <Stack gap="xl">
      {teamSteps.map((step) => (
        <PipelineStep key={step.output} step={step} team={team} disabled={disabled} onCreate={onCreate} extras={extras} />
      ))}
    </Stack>
  );
}

function PipelineStep({ step, team, disabled, onCreate, extras }: {
  step: TeamStep;
  team: Team;
  disabled?: boolean;
  onCreate?: (output: Agent['output']) => void;
  extras?: (agent: Agent) => AgentRowExtras;
}) {
  const titleId = useId();
  const theme = useMantineTheme();
  const { label, color } = stagePresentation[step.stage];
  const cardinality = roleCardinality(step.output);
  const roleAgents = team.agents.filter((agent) => agent.output === step.output);
  // Rows follow the team's order, which is also the order agents are saved and run in.
  const members = team.versionIds.flatMap((id) => {
    const agent = roleAgents.find((entry) => entry.versions.some((version) => version.id === id));
    const version = agent && selectedVersion(agent, team.versionIds);
    return agent && version ? [{ agent, version }] : [];
  });
  const candidates = roleAgents.filter((agent) => !members.some((member) => member.agent === agent));
  const picker = cardinality === 'many' ? 'Ajouter depuis la bibliothèque'
    : members.length ? 'Remplacer depuis la bibliothèque' : 'Choisir dans la bibliothèque';

  return (
    <Box component="section" aria-labelledby={titleId} className={styles.step}
      style={{ '--step-color': getThemeColor(color, theme) }}>
      <Stack gap="xs">
        <Stack gap={2}>
          <Group gap="xs">
            <Title id={titleId} order={3} size="h5">{label}</Title>
            {cardinality === 'optional' && <Badge size="xs" variant="outline" color="gray">Facultative</Badge>}
          </Group>
          <Text size="sm" c="dimmed">{step.description}</Text>
        </Stack>
        {members.map(({ agent, version }) => (
          <AgentRow key={agent.id} agent={agent} version={version} team={team} disabled={disabled}
            removable={cardinality !== 'one'} extras={extras?.(agent) ?? {}} />
        ))}
        {members.length === 0 && <Text size="sm" c="dimmed" className={styles.row}>{step.empty}</Text>}
        {(candidates.length > 0 || onCreate) && (
          <Group gap="xs">
            {candidates.length > 0 && (
              <LibraryPicker label={`${picker} : ${label}`} placeholder={picker} candidates={candidates} disabled={disabled}
                onPick={(agent) => team.change(addAgent(team.versionIds, team.agents, agent))} />
            )}
            {onCreate && (
              <Button variant="subtle" color="gray" size="sm" disabled={disabled} aria-label={`Créer un agent : ${label}`}
                leftSection={<IconPlus size={16} aria-hidden="true" />} onClick={() => onCreate(step.output)}>
                Créer un agent
              </Button>
            )}
          </Group>
        )}
      </Stack>
    </Box>
  );
}

/** Library agents that can join a role, each previewed with its latest instructions before it is added. */
function LibraryPicker({ label, placeholder, candidates, disabled, onPick }: {
  label: string;
  placeholder: string;
  candidates: Agent[];
  disabled?: boolean;
  onPick: (agent: Agent) => void;
}) {
  return (
    <Select aria-label={label} placeholder={placeholder} value={null} w={{ base: '100%', xs: '22rem' }}
      leftSection={<IconLibrary size={16} aria-hidden="true" />} disabled={disabled}
      comboboxProps={{ width: 'target' }} maxDropdownHeight={360}
      data={candidates.map((agent) => ({ value: agent.id, label: agent.versions[0]?.name ?? agent.id }))}
      renderOption={({ option }) => {
        const instructions = candidates.find((agent) => agent.id === option.value)?.versions[0]?.instructions;
        return (
          <Stack gap={2} miw={0}>
            <Text size="sm" fw={600}>{option.label}</Text>
            <Text size="xs" c="dimmed" lineClamp={3}>{instructions || 'Aucune instruction supplémentaire.'}</Text>
          </Stack>
        );
      }}
      onChange={(agentId) => {
        const agent = candidates.find((entry) => entry.id === agentId);
        if (agent) onPick(agent);
      }} />
  );
}

function AgentRow({ agent, version, team, disabled, removable, extras }: {
  agent: Agent;
  version: Version;
  team: Team;
  disabled?: boolean;
  removable: boolean;
  extras: AgentRowExtras;
}) {
  return (
    <Box className={styles.row}>
      <Group gap="xs" wrap="wrap">
        <Stack gap={0} className={styles.identity}>
          <Text size="sm" fw={600} truncate>{version.name}</Text>
          {extras.summary && <Text size="xs" c="dimmed" lineClamp={1}>{extras.summary}</Text>}
        </Stack>
        <Group gap={4} wrap="nowrap">
          <Select aria-label={`Version de ${version.name}`} w="11rem" allowDeselect={false} disabled={disabled}
            value={version.id}
            data={agent.versions.map((entry) => ({ value: entry.id, label: `v${entry.version} · ${entry.name}` }))}
            onChange={(versionId) => { if (versionId) team.change(replaceVersion(team.versionIds, agent, versionId)); }} />
          {extras.actions}
          {removable && (
            <IconAction label={`Retirer ${version.name}`} disabled={disabled}
              onClick={() => team.change(removeAgent(team.versionIds, agent))}>
              <IconX size={18} aria-hidden="true" />
            </IconAction>
          )}
        </Group>
      </Group>
      {extras.details}
    </Box>
  );
}
