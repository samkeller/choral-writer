import { useState } from 'react';
import { Alert, Button, Group, Loader, Modal, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { Project, ProjectInput } from '@choral-writer/shared';

import { createProject, deleteProject, updateProject } from '../api/projects.js';
import { getErrorMessage } from '../api/client.js';
import { ProjectForm } from '../components/projects/ProjectForm.js';
import { useProjects } from '../hooks/useProjects.js';

export function ProjectsPage() {
  const { projects, loading, error, reload } = useProjects();
  const [editing, setEditing] = useState<Project | null | undefined>();
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function save(input: ProjectInput) {
    if (editing) await updateProject(editing.id, input);
    else await createProject(input);
    setEditing(undefined);
    reload();
  }

  async function remove() {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError('');
    try {
      await deleteProject(deleting.id);
      setDeleting(null);
      reload();
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={1} size="h2">Projets</Title>
        <Button onClick={() => setEditing(null)}>Nouveau projet</Button>
      </Group>
      <Text c="dimmed">Un monde, un prompt système et une conversation indépendante par projet.</Text>
      {loading && <Loader aria-label="Chargement des projets" />}
      {error && (
        <Alert color="red" title="Impossible de charger les projets">
          {error}
          <Button variant="subtle" onClick={reload}>Réessayer</Button>
        </Alert>
      )}
      {!loading && !error && projects.length === 0 && (
        <Paper withBorder p="xl">
          <Text>Aucun projet pour le moment. Créez votre premier chatbot.</Text>
        </Paper>
      )}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {projects.map((project) => (
          <Paper key={project.id} withBorder p="lg">
            <Stack>
              <Title order={2} size="h3">{project.name}</Title>
              <Text c="dimmed" size="sm" lineClamp={3}>{project.systemPrompt || 'Aucun prompt système.'}</Text>
              <Group gap="xs">
                <Button component={Link} to={`/projects/${project.id}`}>Ouvrir le chat</Button>
                <Button variant="default" onClick={() => setEditing(project)}>Modifier</Button>
                <Button
                  variant="subtle" color="red"
                  onClick={() => { setDeleteError(''); setDeleting(project); }}
                >
                  Supprimer
                </Button>
              </Group>
            </Stack>
          </Paper>
        ))}
      </SimpleGrid>
      <Modal opened={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? 'Modifier le projet' : 'Nouveau projet'}>
        {editing !== undefined && (
          <ProjectForm
            key={editing?.id ?? 'new'} initial={editing ?? undefined}
            onSubmit={save} onCancel={() => setEditing(undefined)}
          />
        )}
      </Modal>
      <Modal opened={deleting !== null} onClose={() => { if (!deletePending) setDeleting(null); }} title="Supprimer le projet">
        <Stack>
          <Text>Supprimer « {deleting?.name} » et tout son historique ? Cette action est irréversible.</Text>
          {deleteError && <Alert color="red">{deleteError}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)} disabled={deletePending}>Annuler</Button>
            <Button color="red" loading={deletePending} onClick={() => void remove()}>Confirmer la suppression</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
