import { useState } from 'react';
import {
  ActionIcon, Alert, Badge, Button, Center, Drawer, Group, Loader, Modal, Paper,
  Select, Stack, Text, TextInput, ThemeIcon, Title,
} from '@mantine/core';
import { IconArrowUpRight, IconPlus, IconSearch, IconSparkles, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { Agent, AgentInput, AgentVersionInput } from '@choral-writer/shared';

import { createAgent, deleteAgent, publishAgentVersion } from '../api/agents.js';
import { getErrorMessage } from '../api/client.js';
import { AgentForm } from '../components/agents/AgentForm.js';
import { AgentProjectLink } from '../components/agents/AgentProjectLink.js';
import { AgentVersionDetails, outputLabels } from '../components/agents/AgentVersionDetails.js';
import { PageHeader } from '../components/PageHeader.js';
import { useAgentLibrary } from '../hooks/useAgentLibrary.js';
import styles from './AgentsPage.module.css';
import surfaces from '../components/agents/AgentSurface.module.css';

export function AgentsPage() {
  const library = useAgentLibrary();
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<string | null>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Agent | null | undefined>();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const selected = library.agents.find((agent) => agent.id === selectedId);
  const version = selected?.versions.find((entry) => entry.id === versionId) ?? selected?.versions[0];
  const visible = library.agents.filter((agent) =>
    (phase === 'all' || agent.phase === phase)
    && agent.versions.some((entry) => entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())));

  async function create(input: AgentInput) {
    const agent = await createAgent(input);
    setEditing(undefined);
    setSelectedId(agent.id);
    setVersionId(null);
    library.reload();
  }

  async function publish(input: AgentVersionInput) {
    if (!editing) throw new Error('Aucun agent sélectionné.');
    const latest = editing.versions[0];
    if (!latest) throw new Error('Cet agent n’a aucune version.');
    await publishAgentVersion(editing.id, { ...input, expectedVersion: latest.version });
    setEditing(undefined);
    setVersionId(null);
    library.reload();
  }

  async function remove() {
    if (!selected) return;
    setPending(true);
    setError('');
    try {
      await deleteAgent(selected.id);
      setDeleting(false);
      setSelectedId(null);
      library.reload();
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <Stack gap="xl">
      <PageHeader title="Agents" description="Une bibliothèque de regards. Réutilisables, versionnés, à composer par projet."
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setEditing(null)}>Nouvel agent</Button>} />
      <Group align="flex-end" gap="sm">
        <TextInput placeholder="Rechercher un agent…" aria-label="Rechercher un agent" value={query}
          leftSection={<IconSearch size={16} />} onChange={(event) => setQuery(event.currentTarget.value)}
          style={{ flex: 1, minWidth: 180 }} />
        <Select aria-label="Filtrer par phase" value={phase} allowDeselect={false} onChange={setPhase}
          data={[{ value: 'all', label: 'Toutes les phases' }, { value: 'analysis', label: 'Analyse' },
          { value: 'restitution', label: 'Restitution' }]} />
      </Group>
      {library.loading && <Center py="xl"><Loader aria-label="Chargement des agents" /></Center>}
      {library.error && (
        <Alert color="red" role="alert" title="Bibliothèque indisponible">
          <Text>{library.error}</Text><Button variant="subtle" onClick={library.reload}>Réessayer</Button>
        </Alert>
      )}
      {!library.loading && !library.error && (
        <Stack gap="sm">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{visible.length} agents · Bibliothèque globale</Text>
          {visible.map((agent) => {
            const latest = agent.versions[0];
            if (!latest) return null;
            return (
              <Paper key={agent.id} component="button" type="button" withBorder p="md"
                className={`${styles.agentRow} ${surfaces.surface}`}
                onClick={() => { setSelectedId(agent.id); setVersionId(null); setError(''); }}>
                <Group wrap="nowrap" gap="md">
                  <ThemeIcon size="lg" variant="light" color={agent.phase === 'analysis' ? 'blue' : 'choral'}>
                    <IconSparkles size={20} stroke={1.5} />
                  </ThemeIcon>
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap="xs"><Title order={2} size="h4">{latest.name}</Title>
                      <Badge size="xs" variant="outline" color="gray">v{latest.version}</Badge></Group>
                    <Text size="xs" c="dimmed">{outputLabels[agent.output]}</Text>
                    <Text size="sm" c="dimmed" lineClamp={1}>{latest.instructions || 'Prêt à personnaliser'}</Text>
                  </Stack>
                  <Stack align="flex-end" gap={4}>
                    <Text size="xs" c="dimmed">{agent.projects.length} projet{agent.projects.length > 1 ? 's' : ''}</Text>
                    <IconArrowUpRight size={17} />
                  </Stack>
                </Group>
              </Paper>
            );
          })}
          {visible.length === 0 && <Paper withBorder p="xl"><Text c="dimmed">Aucun agent ne correspond à cette recherche.</Text></Paper>}
        </Stack>
      )}
      <Drawer opened={Boolean(selected)} onClose={() => setSelectedId(null)} position="right" size="lg"
        title="Détail de l’agent" overlayProps={{ backgroundOpacity: 0.35, blur: 3 }}>
        {selected && version && (
          <Stack gap="xl">
            <Group justify="space-between">
              <Title order={2} size="h3">{selected.versions[0]?.name}</Title>
              <Button size="xs" variant="light" onClick={() => setEditing(selected)}>Nouvelle version</Button>
            </Group>
            <Select label="Version consultée" allowDeselect={false} value={version.id} onChange={setVersionId}
              data={selected.versions.map((entry) => ({
                value: entry.id, label: `v${entry.version} · ${entry.name} · ${new Date(entry.createdAt).toLocaleDateString('fr-FR')}`,
              }))} />
            <AgentVersionDetails output={selected.output} version={version} />
            <Stack gap="sm">
              <Text fw={500} size="sm">Projets utilisant cette version</Text>
              {selected.projects.filter((project) => project.versionId === version.id).map((project) => (
                <Group key={project.id} justify="space-between">
                  <Text size="sm">{project.name}</Text>
                  <ActionIcon component={Link} to={`/projects/${project.id}?setup=agents`} variant="subtle"
                    aria-label={`Configurer ${project.name}`}><IconArrowUpRight size={18} /></ActionIcon>
                </Group>
              ))}
              {!selected.projects.some((project) => project.versionId === version.id)
                && <Text size="sm" c="dimmed">Cette version n’est liée à aucun projet.</Text>}
            </Stack>
            <AgentProjectLink key={version.id} versionId={version.id} />
            <Button
              variant="light"
              color="red"
              size="sm"
              leftSection={<IconTrash size={15} />}
              onClick={() => {
                setError('');
                setDeleting(true);
              }}
            >
              Supprimer
            </Button>
          </Stack>
        )}
      </Drawer>
      <Modal opened={editing !== undefined} onClose={() => setEditing(undefined)} size="lg"
        title={editing ? 'Nouvelle version' : 'Créer un agent'}>
        {editing === null && <AgentForm onSubmit={create} onCancel={() => setEditing(undefined)} />}
        {editing && <AgentForm key={editing.id} initial={editing} onSubmit={publish} onCancel={() => setEditing(undefined)} />}
      </Modal>
      <Modal opened={deleting} onClose={() => { if (!pending) setDeleting(false); }} title="Supprimer l’agent">
        <Stack>
          <Text size="sm">Supprimer cet agent et ses versions ? Les agents utilisés par un projet ou fournis par défaut sont protégés.</Text>
          {error && <Alert color="red" role="alert">{error}</Alert>}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDeleting(false)} disabled={pending}>Annuler</Button>
            <Button color="red" loading={pending} onClick={() => void remove()}>Confirmer la suppression</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
