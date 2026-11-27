import { useId, useState } from 'react';
import { Alert, Box, Button, Loader, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import {
  defaultMemoryRead, readsMemory, type Agent, type MemoryTag, type ProjectAgent,
} from '@choral-writer/shared';
import { IconChevronDown, IconChevronUp, IconLibrary } from '@tabler/icons-react';
import {
  ConfigurationDetailPane, ConfigurationScrollArea, ConfigurationSection,
} from '../configuration/ConfigurationLayout';
import { useProjectSetup } from '../../hooks/useProjectSetup';
import { selectedVersion } from '../../hooks/useAgentTeam';
import type { useMemories } from '../../hooks/useMemories';
import { PromptDisplay } from '../llm/PromptDisplay';
import { AgentMemoryEditor } from '../memories/MemoryEditors';
import { IconAction } from '../atoms/IconAction';
import { AgentEditor } from './AgentEditor';
import { AgentTeamPipeline, type AgentRowExtras } from './AgentTeamPipeline';

type Memory = ReturnType<typeof useMemories>;

export function ProjectAgentSetup({ projectId, suggestedVersion, onSaved, memory }: {
  projectId: string; suggestedVersion?: string | null; onSaved?: () => void;
  memory: Memory;
}) {
  const setup = useProjectSetup(projectId, suggestedVersion);
  const [creating, setCreating] = useState<Agent['output'] | null>(null);
  const idPrefix = useId();
  // Until the user opens or closes a row, the suggested agent's detail is open.
  const [openId, setOpenId] = useState<string | null>();
  const suggestedId = setup.agents.find((agent) => agent.versions.some((version) => version.id === suggestedVersion))?.id;
  const expandedId = openId === undefined ? suggestedId : openId;

  function extras(agent: Agent): AgentRowExtras {
    const version = selectedVersion(agent, setup.versionIds);
    const persisted = memory.agents.find((item) => item.agentId === agent.id);
    const expanded = expandedId === agent.id;
    const Chevron = expanded ? IconChevronUp : IconChevronDown;
    const detailsId = `${idPrefix}-${agent.id}`;
    const name = version?.name ?? agent.id;
    return {
      summary: memorySummary(agent.output, persisted, memory.view?.state.tags ?? []),
      actions: (
        <IconAction label={`Détails de ${name}`} aria-expanded={expanded} aria-controls={detailsId}
          variant={expanded ? 'light' : 'subtle'} onClick={() => setOpenId(expanded ? null : agent.id)}>
          <Chevron size={18} aria-hidden="true" />
        </IconAction>
      ),
      details: (
        <Box id={detailsId} role="region" aria-label={`Détails de ${name}`} hidden={!expanded}>
          {expanded && version && (
            <Stack gap="sm" pt="sm">
              {readsMemory(agent.output) && persisted && memory.view && (
                <AgentMemoryEditor key={`${persisted.agentId}:${JSON.stringify(persisted.memoryRead)}`} agent={persisted}
                  tags={memory.view.state.tags} pending={memory.pending} save={memory.change} />
              )}
              {readsMemory(agent.output) && !persisted && (
                <Text size="sm" c="dimmed">Enregistrez l’équipe pour configurer l’accès mémoire de cet agent.</Text>
              )}
              <Text size="sm" fw={600}>Instructions</Text>
              <PromptDisplay content={version.instructions || 'Aucune instruction supplémentaire au prompt du projet.'} />
            </Stack>
          )}
        </Box>
      ),
    };
  }

  return <ConfigurationSection title="Agents"
    primaryAction={{
      label: 'Enregistrer l’équipe', loading: setup.pending, disabled: setup.loading,
      onClick: () => void setup.save().then((ok) => { if (ok) onSaved?.(); })
    }}
    actions={<IconAction component={Link} to="/agents" label="Voir la bibliothèque"><IconLibrary size={18} /></IconAction>}
    feedback={(setup.error || setup.saved || memory.error) && <>
      {setup.error && <Alert color="red" role="alert">{setup.error}<Button variant="subtle" onClick={setup.reload} disabled={setup.pending}>Recharger</Button></Alert>}
      {memory.error && <Alert color="red" role="alert">{memory.error}<Button variant="subtle" onClick={memory.reload}>Recharger</Button></Alert>}
      {setup.saved && <Alert color="choral" role="status">Configuration enregistrée. Elle sera utilisée au prochain tour.</Alert>}
    </>}>
    {setup.loading
      ? <ConfigurationScrollArea><Loader aria-label="Chargement de la configuration" /></ConfigurationScrollArea>
      : <ConfigurationDetailPane>
        <AgentTeamPipeline team={setup} disabled={setup.pending} onCreate={setCreating} extras={extras} />
      </ConfigurationDetailPane>}
    {creating && <AgentEditor agent={null} output={creating} onClose={() => setCreating(null)}
      onSaved={(agent) => { setup.adopt(agent); setCreating(null); }} />}
  </ConfigurationSection>;
}

/** The memory an agent receives, in a few words; the Director never receives any. */
function memorySummary(output: Agent['output'], persisted: ProjectAgent | undefined, tags: MemoryTag[]): string {
  if (!readsMemory(output)) return 'Le Directeur ne reçoit aucune mémoire';
  if (!persisted) return 'Accès mémoire réglable après enregistrement';
  const read = persisted.memoryRead ?? defaultMemoryRead(output);
  if (read.mode === 'all') return 'Toute la mémoire';
  if (read.mode === 'none' || read.tagIds.length === 0) return 'Aucune mémoire';
  const names = read.tagIds.flatMap((id) => tags.find((tag) => tag.id === id)?.name ?? []);
  return `Mémoire : ${names.length ? names.join(', ') : `${read.tagIds.length} tag(s)`}`;
}
