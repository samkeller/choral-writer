import { Alert, Button, Checkbox, Divider, Group, Loader, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { Agent } from '@choral-writer/shared';

import { useProjectSetup } from '../../hooks/useProjectSetup.js';
import { AgentVersionDetails } from './AgentVersionDetails.js';
import styles from './AgentSurface.module.css';
import { IconLibrary } from '@tabler/icons-react';
import { PhaseTag } from '../phases/PhaseTag.js';
import { IconAction } from '../atoms/IconAction.js';

export function ProjectAgentSetup({ projectId, suggestedVersion }: {
  projectId: string;
  suggestedVersion?: string | null;
}) {
  const setup = useProjectSetup(projectId, suggestedVersion);

  function selectRequired(output: Agent['output'], versionId: string | null) {
    if (!versionId) return;
    const oldIds = new Set(setup.agents.filter((agent) => agent.output === output)
      .flatMap((agent) => agent.versions.map((version) => version.id)));
    setup.change([...setup.versionIds.filter((id) => !oldIds.has(id)), versionId]);
  }

  return (
    <Stack gap="xl">
      <Stack gap="xs">
        <Group justify='space-between'>
          <Text fw={600}>Agents</Text>
          <IconAction component={Link} to="/agents" label="Voir la bibliothèque">
            <IconLibrary size={18} aria-hidden="true" />
          </IconAction>
        </Group>
      </Stack>
      {setup.loading && <Loader aria-label="Chargement de la configuration" />}
      {setup.error && (
        <Alert color="red" role="alert">
          {setup.error}<Button variant="subtle" onClick={setup.reload} disabled={setup.pending}>Recharger</Button>
        </Alert>
      )}
      {!setup.loading && (
        <>

          <Stack gap="md">
            <Group gap="sm">
              <Title order={4} size="sm"><PhaseTag phase="analysis" /></Title>
            </Group>
            {setup.agents.filter((agent) => agent.output === 'envelope').map((agent) => {
              const selected = agent.versions.find((version) => setup.versionIds.includes(version.id));
              const latest = agent.versions[0];
              if (!latest) return null;
              return (
                <Paper key={agent.id} withBorder p="md" className={styles.surface}>
                  <Stack gap="sm">
                    <Checkbox label={latest.name} checked={Boolean(selected)} disabled={setup.pending}
                      onChange={(event) => setup.change(event.currentTarget.checked
                        ? [...setup.versionIds, latest.id]
                        : setup.versionIds.filter((id) => !agent.versions.some((version) => version.id === id)))} />
                    {selected && (
                      <>
                        <Select label={`Version de ${latest.name}`} value={selected.id} allowDeselect={false}
                          disabled={setup.pending} data={agent.versions.map((version) => ({
                            value: version.id, label: `v${version.version} · ${version.name}`,
                          }))} onChange={(value) => {
                            if (value) setup.change(setup.versionIds.map((id) => id === selected.id ? value : id));
                          }} />
                        <Stack mt="sm"><AgentVersionDetails output={agent.output} version={selected} /></Stack>
                      </>
                    )}
                  </Stack>
                </Paper>
              );
            })}
            {!setup.agents.some((agent) => agent.output === 'envelope')
              && <Text size="sm" c="dimmed">Aucun agent d’analyse dans la bibliothèque pour le moment.</Text>}
          </Stack>
          <Divider />
          <Stack gap="lg">
            <Group gap="sm">
              <Title order={4} size="sm"><PhaseTag phase="restitution" /></Title>
            </Group>
            {(['narrative', 'memory_proposals'] as const).map((output) => {
              const eligible = setup.agents.filter((agent) => agent.output === output);
              const agent = eligible.find((entry) => entry.versions.some((version) => setup.versionIds.includes(version.id)));
              const version = agent?.versions.find((entry) => setup.versionIds.includes(entry.id));
              return (
                <Paper key={output} withBorder p="md" className={styles.surface}>
                  <Stack gap="sm">
                    <Select label={output === 'narrative' ? 'Réponse utilisateur · Narrateur' : 'Mémoire · Gardien'}
                      value={version?.id ?? null} allowDeselect={false} searchable disabled={setup.pending}
                      placeholder="Choisir un agent et sa version"
                      data={eligible.map((entry) => ({
                        group: entry.versions[0]?.name ?? entry.id,
                        items: entry.versions.map((item) => ({
                          value: item.id, label: `${item.name} · v${item.version}`,
                        })),
                      }))}
                      onChange={(value) => selectRequired(output, value)} />
                    {agent && version && (
                      <AgentVersionDetails output={agent.output} version={version} />
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>



          {setup.saved && <Alert color="choral" role="status">Configuration enregistrée. Elle sera utilisée au prochain tour.</Alert>}
          <Group justify="flex-end">
            <Button loading={setup.pending} onClick={() => void setup.save()}>Enregistrer la configuration</Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
