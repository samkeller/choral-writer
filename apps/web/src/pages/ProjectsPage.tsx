import { useState } from 'react';
import { ActionIcon, Alert, Button, Center, Code, Group, Loader, Modal, Paper, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { Link } from 'react-router-dom';
import type { Project, ProjectInput } from '@choral-writer/shared';

import { createProject, deleteProject, updateProject } from '../api/projects.js';
import { getErrorMessage } from '../api/client.js';
import { PageHeader } from '../components/PageHeader.js';
import { ProjectForm } from '../components/projects/ProjectForm.js';
import { useProjects } from '../hooks/useProjects.js';
import { IconEdit, IconMessageCircle, IconTrash, IconUsers } from '@tabler/icons-react';
import { ClickableCard } from '../components/atoms/clickableCard/ClickableCard.js';

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
        description="Un monde, un prompt système et une conversation indépendante par projet."
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
          >
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Title order={3} size="h4">
                  {project.name}
                </Title>

                <Group gap={4}>
                  <Tooltip label="Modifier">
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={() => setEditing(project)}
                    >
                      <IconEdit size={18} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="Supprimer">
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => {
                        setDeleteError('');
                        setDeleting(project);
                      }}
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              <Code>
                {project.systemPrompt || 'Aucune description.'}
              </Code>
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
