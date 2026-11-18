import { useId, useState } from 'react';
import { Group, NavLink, Text } from '@mantine/core';
import { IconArrowBackUp, IconBook2, IconBrain, IconUsers } from '@tabler/icons-react';
import type { Project } from '@choral-writer/shared';
import { ProjectAgentSetup } from '../components/agents/ProjectAgentSetup';
import { ProjectFormFields } from '../components/projects/ProjectForm';
import { ConfigurationDetailPane, ConfigurationPanel, ConfigurationSection, ConfigurationWorkspace } from '../components/configuration/ConfigurationLayout';
import { IconAction } from '../components/atoms/IconAction';
import { updateProject } from '../api/projects/projectsApi';
import { useMemories } from '../hooks/useMemories';
import { useProjectForm } from '../hooks/useProjectForm';
import { ProjectMemories } from './MemoriesPage';

type Section = 'project' | 'agents' | 'memory';
export function ProjectConfiguration({ project, branchId, selectBranch, suggestedVersion, initialSection, onProjectSaved }: {
  project: Project; branchId: string | null; selectBranch: (branch: string) => void; suggestedVersion: string | null;
  initialSection: Section; onProjectSaved: () => void;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  const memory = useMemories(project.id, branchId);
  const sections = [
    { value: 'project' as const, label: 'Projet', icon: IconBook2 },
    { value: 'agents' as const, label: 'Agents', icon: IconUsers },
    { value: 'memory' as const, label: 'Mémoire', icon: IconBrain },
  ];
  return (
    <ConfigurationWorkspace navigation={sections.map(({ value, label, icon: Icon }) => <NavLink key={value} component="button"
      label={<Group gap="xs" wrap="nowrap"><Icon size={16} /><Text size="sm">{label}</Text></Group>} px={{ base: 4, sm: 'sm' }}
      active={section === value} aria-current={section === value ? 'page' : undefined}
      onClick={() => setSection(value)} />)}>
      <ConfigurationPanel active={section === 'project'}>
        <ProjectSettings project={project} onSaved={onProjectSaved} />
      </ConfigurationPanel>
      <ConfigurationPanel active={section === 'agents'}>
        <ProjectAgentSetup projectId={project.id} suggestedVersion={suggestedVersion} memory={memory} onSaved={memory.reload} />
      </ConfigurationPanel>
      <ConfigurationPanel active={section === 'memory'}>
        <ProjectMemories memory={memory} selectBranch={selectBranch} />
      </ConfigurationPanel>
    </ConfigurationWorkspace>
  );
}

function ProjectSettings({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const formId = useId();
  const form = useProjectForm({ name: project.name, systemPrompt: project.systemPrompt }, async (input) => {
    await updateProject(project.id, input);
    onSaved();
  });
  return <ConfigurationSection title="Projet"
    primaryAction={{ label: 'Enregistrer', form: formId, loading: form.pending }}
    actions={
      <IconAction label="Annuler les modifications" disabled={form.pending} onClick={onSaved}>
        <IconArrowBackUp size={18} />
      </IconAction>
    }>
    <ConfigurationDetailPane>
      <form id={formId} onSubmit={form.submit}><ProjectFormFields form={form} /></form>
    </ConfigurationDetailPane>
  </ConfigurationSection>;
}
