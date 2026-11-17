import { Alert, Button, Loader, Select, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProjects } from '../../hooks/useProjects.js';

export function AgentProjectLink({ versionId }: { versionId: string }) {
  const projects = useProjects();
  const [projectId, setProjectId] = useState<string | null>(null);
  return (
    <Stack gap="sm">
      <Text fw={500} size="sm">Utiliser cette version dans un projet</Text>
      {projects.loading && <Loader size="sm" aria-label="Chargement des projets" />}
      {projects.error && (
        <Alert color="red" role="alert">{projects.error}<Button variant="subtle" onClick={projects.reload}>Réessayer</Button></Alert>
      )}
      {!projects.loading && !projects.error && (
        <>
          <Select aria-label="Projet à configurer" searchable placeholder="Choisir un projet"
            value={projectId} onChange={setProjectId}
            data={projects.projects.map((project) => ({ value: project.id, label: project.name }))} />
          {projectId && (
            <Button component={Link} variant="light"
              to={`/projects/${projectId}?setup=agents&agentVersion=${versionId}`}>Configurer ce projet</Button>
          )}
          {projects.projects.length === 0 && <Text size="sm" c="dimmed">Créez d’abord un projet.</Text>}
        </>
      )}
    </Stack>
  );
}
