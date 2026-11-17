import { useState } from 'react';
import { Divider, Group, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconArrowUpRight, IconPlus, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { Agent } from '@choral-writer/shared';

import { AgentProjectLink } from './AgentProjectLink.js';
import { AgentVersionDetails } from './AgentVersionDetails.js';
import { IconAction } from '../atoms/IconAction.js';

export function AgentDetails({ agent, onEdit, onDelete }: {
  agent: Agent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [versionId, setVersionId] = useState<string | null>(null);
  const version = agent.versions.find((entry) => entry.id === versionId) ?? agent.versions[0];
  if (!version) return null;
  const projects = agent.projects.filter((project) => project.versionId === version.id);

  return (
    <Stack gap="lg" pt="lg">
      <Divider />
      <Group justify="space-between" align="flex-end">
        <Select label="Version consultée" allowDeselect={false} value={version.id} onChange={setVersionId}
          style={{ flex: 1, minWidth: 0 }} maw={420}
          data={agent.versions.map((entry) => ({
            value: entry.id,
            label: `v${entry.version} · ${entry.name} · ${new Date(entry.createdAt).toLocaleDateString('fr-FR')}`,
          }))} />
        <IconAction label="Nouvelle version" variant="light" onClick={onEdit}>
          <IconPlus size={18} aria-hidden="true" />
        </IconAction>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <Stack gap="sm" style={{ minWidth: 0 }}>
          <Title order={3} size="sm">Instructions de cette version</Title>
          <AgentVersionDetails output={agent.output} version={version} />
        </Stack>
        <Stack gap="lg" style={{ minWidth: 0 }}>
          <Stack gap="sm">
            <Title order={3} size="sm">Projets utilisant cette version</Title>
            {projects.map((project) => (
              <Group key={project.id} justify="space-between">
                <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{project.name}</Text>
                <IconAction component={Link} to={`/projects/${project.id}?setup=agents`}
                  label={`Configurer ${project.name}`}>
                  <IconArrowUpRight size={18} aria-hidden="true" />
                </IconAction>
              </Group>
            ))}
            {projects.length === 0 && <Text size="sm" c="dimmed">Cette version n’est liée à aucun projet.</Text>}
          </Stack>
          <AgentProjectLink key={version.id} versionId={version.id} />
        </Stack>
      </SimpleGrid>
      <Group justify="flex-end">
        <IconAction color="red" label="Supprimer l’agent" onClick={onDelete}>
          <IconTrash size={18} aria-hidden="true" />
        </IconAction>
      </Group>
    </Stack>
  );
}
