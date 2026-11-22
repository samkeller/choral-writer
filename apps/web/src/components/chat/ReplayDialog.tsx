import { useState, type FormEvent } from 'react';
import { Alert, Button, Center, Checkbox, Group, Loader, Modal, Select, Stack, Text, Textarea } from '@mantine/core';
import { IconPencilPlus } from '@tabler/icons-react';
import type { Agent, AgentVersionInput, Project, ReplayConfiguration } from '@choral-writer/shared';

import { publishNextVersion } from '../../api/agents/agentsApi';
import { getErrorMessage } from '../../api/client';
import { agentSelections, selectVersion, toggleAnalysisAgent, useProjectSetup } from '../../hooks/useProjectSetup';
import { AgentForm } from '../agents/AgentForm';
import { IconAction } from '../atoms/IconAction';

type Team = ReturnType<typeof useProjectSetup>;
type VersionEdit = { agent: Agent; baseVersionId: string };

/**
 * Prepares the replacement configuration of a replay, starting from the project's.
 * The project is never changed; a version published here stays in the agent's history.
 */
export function ReplayDialog({ project, onClose, onReplay }: {
  project: Project;
  onClose: () => void;
  onReplay: (configuration: ReplayConfiguration) => void;
}) {
  const team = useProjectSetup(project.id);
  const [systemPrompt, setSystemPrompt] = useState(project.systemPrompt);
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
    const baseVersionId = selectedVersion(team, agent)?.id ?? agent.versions[0]?.id;
    if (baseVersionId) setVersionEdit({ agent, baseVersionId });
  }

  const title = versionEdit ? `Nouvelle version de ${displayName(team, versionEdit.agent)}` : 'Rejouer le dernier tour avec…';
  return (
    <Modal opened onClose={onClose} size="lg" title={title}>
      {versionEdit
        ? <AgentForm initial={versionEdit.agent} baseVersionId={versionEdit.baseVersionId}
          onSubmit={publish} onCancel={() => setVersionEdit(null)} />
        : (
          <form onSubmit={submit}>
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Même saisie et même mémoire qu’avant le tour : la variante part dans une nouvelle branche.
                La configuration du projet ne change pas.
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
                <AnalysisAgents team={team} onEditVersion={editVersion} />
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
        )}
    </Modal>
  );
}

function RequiredAgentRow({ team, output, label, onEditVersion }: {
  team: Team;
  output: Exclude<Agent['output'], 'envelope'>;
  label: string;
  onEditVersion: (agent: Agent) => void;
}) {
  const candidates = team.agents.filter((agent) => agent.output === output);
  const selected = candidates.find((agent) => selectedVersion(team, agent));
  return (
    <Group align="flex-end" gap="xs" wrap="nowrap">
      <Select label={label} style={{ flex: 1, minWidth: 0 }} searchable allowDeselect={false}
        value={selected ? selectedVersion(team, selected)?.id ?? null : null}
        placeholder="Choisir cet agent et sa version"
        data={candidates.map((agent) => ({
          group: agent.versions[0]?.name ?? agent.id,
          items: agent.versions.map((version) => ({ value: version.id, label: `${version.name} · v${version.version}` })),
        }))}
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

function AnalysisAgents({ team, onEditVersion }: { team: Team; onEditVersion: (agent: Agent) => void }) {
  const analysts = team.agents.filter((agent) => agent.output === 'envelope');
  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>Agents d’analyse</Text>
      {analysts.map((agent) => {
        const name = displayName(team, agent);
        const selected = selectedVersion(team, agent);
        return (
          <Group key={agent.id} gap="xs" wrap="nowrap">
            <Checkbox label={name} checked={Boolean(selected)} style={{ flex: 1, minWidth: 0 }}
              onChange={(event) => team.change(toggleAnalysisAgent(team.versionIds, agent, event.currentTarget.checked))} />
            <Select aria-label={`Version de ${name}`} w={160} allowDeselect={false} disabled={!selected}
              value={(selected ?? agent.versions[0])?.id ?? null}
              data={agent.versions.map((version) => ({ value: version.id, label: `v${version.version} · ${version.name}` }))}
              onChange={(versionId) => {
                if (versionId && selected) team.change(team.versionIds.map((id) => id === selected.id ? versionId : id));
              }} />
            <IconAction label={`Nouvelle version de ${name}`} onClick={() => onEditVersion(agent)}>
              <IconPencilPlus size={18} aria-hidden="true" />
            </IconAction>
          </Group>
        );
      })}
      {analysts.length === 0 && <Text size="sm" c="dimmed">Aucun agent d’analyse dans la bibliothèque.</Text>}
    </Stack>
  );
}

function selectedVersion(team: Team, agent: Agent) {
  return agent.versions.find((version) => team.versionIds.includes(version.id));
}

function displayName(team: Team, agent: Agent): string {
  return (selectedVersion(team, agent) ?? agent.versions[0])?.name ?? agent.id;
}
