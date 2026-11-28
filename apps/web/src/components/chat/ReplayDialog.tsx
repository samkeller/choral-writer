import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Center, Group, Loader, Modal, Stack, Text, Textarea } from '@mantine/core';
import { IconPencilPlus } from '@tabler/icons-react';
import type {
  Agent, AgentVersionInput, ChatTurn, Project, ReplayConfiguration, TurnConfiguration,
} from '@choral-writer/shared';

import { publishNextVersion } from '../../api/agents/agentsApi';
import { getTurnTraceSummary } from '../../api/chat/traceApi';
import { getErrorMessage } from '../../api/client';
import { agentSelections, selectedVersion, useAgentTeam } from '../../hooks/useAgentTeam';
import { AgentForm } from '../agents/AgentForm';
import { AgentTeamPipeline } from '../agents/AgentTeamPipeline';
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
          <AgentTeamPipeline team={team} extras={(agent) => ({
            actions: (
              <IconAction label={`Nouvelle version de ${displayName(team, agent)}`} onClick={() => editVersion(agent)}>
                <IconPencilPlus size={18} aria-hidden="true" />
              </IconAction>
            ),
          })} />
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

function displayName(team: Team, agent: Agent): string {
  return (selectedVersion(agent, team.versionIds) ?? agent.versions[0])?.name ?? agent.id;
}
