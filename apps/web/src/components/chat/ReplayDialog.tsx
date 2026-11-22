import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Center, Checkbox, Group, Loader, Modal, Select, Stack, Text, Textarea } from '@mantine/core';
import { IconPencilPlus } from '@tabler/icons-react';
import type {
  Agent, AgentVersionInput, ChatTurn, Project, ReplayConfiguration, TurnConfiguration,
} from '@choral-writer/shared';

import { publishNextVersion } from '../../api/agents/agentsApi';
import { getTurnTraceSummary } from '../../api/chat/traceApi';
import { getErrorMessage } from '../../api/client';
import {
  agentSelections, replaceVersion, requiredVersionOptions, selectVersion, selectedVersion, toggleOptionalAgent,
  useAgentTeam,
} from '../../hooks/useAgentTeam';
import { AgentForm } from '../agents/AgentForm';
import { IconAction } from '../atoms/IconAction';

type Team = ReturnType<typeof useAgentTeam>;
type VersionEdit = { agent: Agent; baseVersionId: string };
/** Where the dialog starts: the configuration recorded on a failed turn, or the project's. */
type Start = { configuration: TurnConfiguration | null };

/**
 * Prepares the replacement configuration of a replay. A completed turn is replayed
 * from the project's configuration into a new branch; a failed turn is retried in
 * place, starting from the configuration it ran with. The project is never changed,
 * and a version published here stays in the agent's history.
 */
export function ReplayDialog({ project, turn, onClose, onReplay }: {
  project: Project;
  turn: ChatTurn;
  onClose: () => void;
  onReplay: (configuration: ReplayConfiguration) => void;
}) {
  const failed = turn.status === 'failed';
  const [start, setStart] = useState<Start | null>(failed ? null : { configuration: null });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!failed) return;
    const controller = new AbortController();
    getTurnTraceSummary(project.id, turn.id, controller.signal)
      .then((summary) => { if (!controller.signal.aborted) setStart({ configuration: summary.configuration }); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(getErrorMessage(failure)); });
    return () => controller.abort();
  }, [failed, project.id, turn.id]);

  return (
    <Modal opened onClose={onClose} size="lg" title="Rejouer le dernier tour avec…">
      {error && <Alert color="red" role="alert">{error}</Alert>}
      {!error && !start && <Center py="md"><Loader aria-label="Chargement de la configuration du tour" /></Center>}
      {start && <ReplayForm project={project} failed={failed} start={start} onClose={onClose} onReplay={onReplay} />}
    </Modal>
  );
}

function ReplayForm({ project, failed, start, onClose, onReplay }: {
  project: Project;
  failed: boolean;
  start: Start;
  onClose: () => void;
  onReplay: (configuration: ReplayConfiguration) => void;
}) {
  const team = useAgentTeam(project.id, { versionIds: start.configuration?.agents.map((agent) => agent.versionId) });
  const [systemPrompt, setSystemPrompt] = useState(start.configuration?.systemPrompt ?? project.systemPrompt);
  const [versionEdit, setVersionEdit] = useState<VersionEdit | null>(null);
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      onReplay({ systemPrompt, agents: agentSelections(team.versionIds, team.agents) });
    } catch (failure) {
      setError(getErrorMessage(failure));
    }
  }

  async function publish(input: AgentVersionInput) {
    if (!versionEdit) return;
    team.adopt(await publishNextVersion(versionEdit.agent, input));
    setVersionEdit(null);
  }

  function editVersion(agent: Agent) {
    const baseVersionId = (selectedVersion(agent, team.versionIds) ?? agent.versions[0])?.id;
    if (baseVersionId) setVersionEdit({ agent, baseVersionId });
  }

  if (versionEdit) {
    return (
      <Stack gap="sm">
        <Text fw={500}>Nouvelle version de {displayName(team, versionEdit.agent)}</Text>
        <AgentForm initial={versionEdit.agent} baseVersionId={versionEdit.baseVersionId}
          onSubmit={publish} onCancel={() => setVersionEdit(null)} />
      </Stack>
    );
  }
  return (
    <form onSubmit={submit}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {failed
            ? 'Le tour en échec est relancé sur cette branche, avec la même saisie et la même mémoire. '
              + 'Le dialogue part de la configuration avec laquelle il a tourné.'
            : 'Même saisie et même mémoire qu’avant le tour : la variante part dans une nouvelle branche.'}
          {' '}La configuration du projet ne change pas.
        </Text>
        {team.loading && <Center py="md"><Loader aria-label="Chargement de la configuration" /></Center>}
        {team.error && (
          <Alert color="red" role="alert">
            <Text size="sm">{team.error}</Text>
            <Button variant="subtle" onClick={team.reload}>Recharger</Button>
          </Alert>
        )}
        {!team.loading && !team.error && <>
          <RequiredAgentRow team={team} output="narrative" label="Narrateur" onEditVersion={editVersion} />
          <RequiredAgentRow team={team} output="memory_proposals" label="Gardien" onEditVersion={editVersion} />
          <OptionalAgents team={team} output="envelope" title="Agents d’analyse" onEditVersion={editVersion}
            empty="Aucun agent d’analyse dans la bibliothèque." />
          <OptionalAgents team={team} output="direction" title="Directeur (facultatif, un seul)" onEditVersion={editVersion} />
          <Textarea label="Prompt du projet" value={systemPrompt} autosize minRows={4} maxRows={12}
            maxLength={50_000} onChange={(event) => setSystemPrompt(event.currentTarget.value)} />
        </>}
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={team.loading || Boolean(team.error)}>Rejouer</Button>
        </Group>
      </Stack>
    </form>
  );
}

function RequiredAgentRow({ team, output, label, onEditVersion }: {
  team: Team;
  output: Exclude<Agent['output'], 'envelope'>;
  label: string;
  onEditVersion: (agent: Agent) => void;
}) {
  const selected = team.agents.find((agent) => agent.output === output && selectedVersion(agent, team.versionIds));
  return (
    <Group align="flex-end" gap="xs" wrap="nowrap">
      <Select label={label} style={{ flex: 1, minWidth: 0 }} searchable allowDeselect={false}
        value={selected ? selectedVersion(selected, team.versionIds)?.id ?? null : null}
        placeholder="Choisir cet agent et sa version" data={requiredVersionOptions(team.agents, output)}
        onChange={(versionId) => {
          if (versionId) team.change(selectVersion(team.versionIds, team.agents, output, versionId));
        }} />
      {selected && (
        <IconAction label={`Nouvelle version de ${displayName(team, selected)}`} onClick={() => onEditVersion(selected)}>
          <IconPencilPlus size={18} aria-hidden="true" />
        </IconAction>
      )}
    </Group>
  );
}

/** Agents a team may go without: analysis agents, and the Director (at most one). */
function OptionalAgents({ team, output, title, empty, onEditVersion }: {
  team: Team;
  output: Extract<Agent['output'], 'envelope' | 'direction'>;
  title: string;
  /** Shown when the library has none; without it, the section is hidden. */
  empty?: string;
  onEditVersion: (agent: Agent) => void;
}) {
  const candidates = team.agents.filter((agent) => agent.output === output);
  if (candidates.length === 0 && !empty) return null;
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>{title}</Text>
      {candidates.map((agent) => {
        const name = displayName(team, agent);
        const selected = selectedVersion(agent, team.versionIds);
        return (
          <Group key={agent.id} gap="xs" wrap="nowrap">
            <Checkbox label={name} checked={Boolean(selected)} style={{ flex: 1, minWidth: 0 }}
              onChange={(event) => team.change(toggleOptionalAgent(team.versionIds, team.agents, agent, event.currentTarget.checked))} />
            <Select aria-label={`Version de ${name}`} w={160} allowDeselect={false} disabled={!selected}
              value={(selected ?? agent.versions[0])?.id ?? null}
              data={agent.versions.map((version) => ({ value: version.id, label: `v${version.version} · ${version.name}` }))}
              onChange={(versionId) => {
                if (versionId && selected) team.change(replaceVersion(team.versionIds, agent, versionId));
              }} />
            <IconAction label={`Nouvelle version de ${name}`} onClick={() => onEditVersion(agent)}>
              <IconPencilPlus size={18} aria-hidden="true" />
            </IconAction>
          </Group>
        );
      })}
      {candidates.length === 0 && <Text size="sm" c="dimmed">{empty}</Text>}
    </Stack>
  );
}

function displayName(team: Team, agent: Agent): string {
  return (selectedVersion(agent, team.versionIds) ?? agent.versions[0])?.name ?? agent.id;
}
