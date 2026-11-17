import { useState } from 'react';
import { Alert, Button, Center, Group, Loader, Modal, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { Project, ProjectInput } from '@choral-writer/shared';

import { createProject, deleteProject, updateProject } from '../api/projects/projectsApi';
import { getErrorMessage } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { PromptDisplay } from '../components/llm/PromptDisplay';
import { ProjectForm } from '../components/projects/ProjectForm';
import { useProjects } from '../hooks/useProjects';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { ClickableCard } from '../components/atoms/clickableCard/ClickableCard';
import { IconAction } from '../components/atoms/IconAction';

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
      <PageHeader
        title="Projets"
        actions={<Button onClick={() => setEditing(null)}>Nouveau projet</Button>}
      />
      {loading && <Center py="xl"><Loader color="choral" aria-label="Chargement des projets" /></Center>}
      {error && (
        <Alert color="red" title="Impossible de charger les projets" role="alert">
          <Stack gap="sm">
            <Text>{error}</Text>
            <Button variant="subtle" w="fit-content" onClick={reload}>Réessayer</Button>
          </Stack>
        </Alert>
      )}
      {!loading && !error && projects.length === 0 && (
        <Paper withBorder p="xl">
          <Stack align="flex-start" gap="sm">
            <Text c="dimmed">Aucun projet pour le moment.</Text>
            <Button onClick={() => setEditing(null)}>Créer un projet</Button>
          </Stack>
        </Paper>
      )}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {projects.map((project) => (
          <ClickableCard
            key={project.id}
            to={`/projects/${project.id}`}
            label={`Ouvrir ${project.name}`}
          >
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Title order={3} size="h4">
                  {project.name}
                </Title>

                <Group gap={4}>
                  <IconAction label="Modifier" onClick={() => setEditing(project)}>
                    <IconEdit size={18} aria-hidden="true" />
                  </IconAction>
                  <IconAction label="Supprimer" color="red" onClick={() => {
                    setDeleteError('');
                    setDeleting(project);
                  }}>
                    <IconTrash size={18} aria-hidden="true" />
                  </IconAction>
                </Group>
              </Group>

              <PromptDisplay content={project.systemPrompt || 'Aucune description.'} compact lineClamp={4} />
            </Stack>
          </ClickableCard>
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
          {deleteError && <Alert color="red" role="alert">{deleteError}</Alert>}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)} disabled={deletePending}>Annuler</Button>
            <Button color="red" loading={deletePending} onClick={() => void remove()}>Confirmer la suppression</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
