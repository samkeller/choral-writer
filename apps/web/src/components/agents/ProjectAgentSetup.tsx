import { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Loader, Paper, Select, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import { readsMemory, type Agent } from '@choral-writer/shared';
import { IconLibrary, IconPlus } from '@tabler/icons-react';
import {
  ConfigurationDetailPane,
  ConfigurationListPane,
  ConfigurationListItem,
  ConfigurationScrollArea,
  ConfigurationSection,
  ConfigurationSplitView,
} from '../configuration/ConfigurationLayout';
import { selectVersion, useProjectSetup } from '../../hooks/useProjectSetup';
import type { useMemories } from '../../hooks/useMemories';
import { PromptDisplay } from '../llm/PromptDisplay';
import { AgentMemoryEditor } from '../memories/MemoryEditors';
import { IconAction } from '../atoms/IconAction';
import { AgentEditor } from './AgentEditor';

const outputLabels: Record<Agent['output'], string> = {
  envelope: 'Analyse',
  direction: 'Directeur',
  narrative: 'Narrateur',
  memory_proposals: 'Gardien',
};

export function ProjectAgentSetup({ projectId, suggestedVersion, onSaved, memory }: {
  projectId: string; suggestedVersion?: string | null; onSaved?: () => void;
  memory: ReturnType<typeof useMemories>;
}) {
  const setup = useProjectSetup(projectId, suggestedVersion);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!selectedId && setup.agents.length) {
      const preferred = setup.agents.find((agent) => agent.versions.some((version) => version.id === suggestedVersion))
        ?? setup.agents.find((agent) => agent.versions.some((version) => setup.versionIds.includes(version.id))) ?? setup.agents[0];
      setSelectedId(preferred?.id ?? null);
    }
  }, [selectedId, setup.agents, setup.versionIds, suggestedVersion]);
  const agent = setup.agents.find((item) => item.id === selectedId);
  const version = agent?.versions.find((item) => setup.versionIds.includes(item.id));
  const displayedVersion = version ?? agent?.versions[0];
  const persisted = memory.agents.find((item) => item.agentId === agent?.id);
  function selectRequired(output: Agent['output'], versionId: string) {
    setup.change(selectVersion(setup.versionIds, setup.agents, output, versionId));
    const next = setup.agents.find((item) => item.versions.some((v) => v.id === versionId));
    if (next) setSelectedId(next.id);
  }
  /** Sélectionne un agent créé depuis cette page sans attendre le rechargement de la bibliothèque. */
  function selectCreated(created: Agent) {
    setup.adopt(created);
    setSelectedId(created.id);
  }
  return <ConfigurationSection title="Agents"
    primaryAction={{
      label: 'Enregistrer l’équipe', loading: setup.pending, disabled: setup.loading,
      onClick: () => void setup.save().then((ok) => { if (ok) onSaved?.(); })
    }}
    actions={<>
      <IconAction label="Nouvel agent" onClick={() => setCreating(true)}><IconPlus size={18} /></IconAction>
      <IconAction component={Link} to="/agents" label="Voir la bibliothèque"><IconLibrary size={18} /></IconAction>
    </>}
    feedback={(setup.error || setup.saved) && <>
      {setup.error && <Alert color="red" role="alert">{setup.error}<Button variant="subtle" onClick={setup.reload} disabled={setup.pending}>Recharger</Button></Alert>}
      {setup.saved && <Alert color="choral" role="status">Configuration enregistrée. Elle sera utilisée au prochain tour.</Alert>}
    </>}>
    {setup.loading ? <ConfigurationScrollArea><Loader aria-label="Chargement de la configuration" /></ConfigurationScrollArea> :
      <ConfigurationSplitView>
        <ConfigurationListPane title="Bibliothèque du projet" count={setup.agents.length}>
          {setup.agents.map((item) => {
            const selected = item.versions.find((v) => setup.versionIds.includes(v.id));
            const latest = item.versions[0];
            if (!latest) return null;
            return <ConfigurationListItem key={item.id} selected={selectedId === item.id}
              onClick={() => setSelectedId(item.id)} label={selected?.name ?? latest.name}
              status={selected ? { label: 'Actif', color: 'choral' } : undefined}
              description={`${outputLabels[item.output]}${selected ? ` · v${selected.version}` : ' · Non sélectionné'}`} />;
          })}
          {!setup.agents.length && <Text size="sm" c="dimmed">Aucun agent dans la bibliothèque.</Text>}
        </ConfigurationListPane>
        <ConfigurationDetailPane>
          {
            agent && displayedVersion ? <>
              {
                agent.output === 'envelope' || agent.output === 'direction' ? <>
                  <Checkbox
                    label={`Activer ${displayedVersion.name}`}
                    description={agent.output === 'direction' ? 'Facultatif ; un seul Directeur par projet.' : undefined}
                    checked={Boolean(version)}
                    disabled={setup.pending}
                    onChange={(event) => setup.change(event.currentTarget.checked
                      ? selectVersion(setup.versionIds, setup.agents, agent.output, displayedVersion.id)
                      : setup.versionIds.filter((id) => !agent.versions.some((item) => item.id === id)))
                    }
                  />
                  <Select 
                  label={`Version de ${displayedVersion.name}`} value={displayedVersion.id} allowDeselect={false}
                    disabled={setup.pending || !version} data={agent.versions.map((item) => ({ value: item.id, label: `v${item.version} · ${item.name}` }))}
                    onChange={(value) => { if (value && version) setup.change(setup.versionIds.map((id) => id === version.id ? value : id)); }} />
                </> : <Select label={agent.output === 'narrative' ? 'Réponse utilisateur · Narrateur' : 'Mémoire · Gardien'}
                  value={version?.id ?? null} searchable allowDeselect={false} disabled={setup.pending}
                  placeholder="Choisir cet agent et sa version" data={setup.agents.filter((item) => item.output === agent.output).map((item) => ({
                    group: item.versions[0]?.name ?? item.id, items: item.versions.map((v) => ({ value: v.id, label: `${v.name} · v${v.version}` })),
                  }))} onChange={(value) => { if (value) selectRequired(agent.output, value); }} />}
              {!readsMemory(agent.output) && <Text size="sm" c="dimmed">Le Directeur ne reçoit aucune mémoire.</Text>}
              {readsMemory(agent.output) && persisted && memory.view && <><Text fw={600}>Accès mémoire</Text>
                <AgentMemoryEditor key={`${persisted.agentId}:${JSON.stringify(persisted.memoryRead)}`} agent={persisted} tags={memory.view.state.tags}
                  pending={memory.pending} save={memory.change} /></>}
              {readsMemory(agent.output) && !persisted && <Text size="sm" c="dimmed">Enregistrez l’équipe pour configurer l’accès mémoire de cet agent.</Text>}
              {memory.error && <Alert color="red" role="alert">{memory.error}<Button variant="subtle" onClick={memory.reload}>Recharger</Button></Alert>}
              <Paper key={`${agent.id}:${displayedVersion.id}`
              } component="details" withBorder p="sm">
                <Text component="summary" fw={600} c="choral.3">Lire les instructions</Text>
                <Box mt="sm"><PromptDisplay content={displayedVersion.instructions || 'Aucune instruction supplémentaire au prompt du projet.'} /></Box>
              </Paper>
            </> : <Text size="sm" c="dimmed">Sélectionnez un agent pour voir ses instructions et ses accès.</Text>
          }
        </ConfigurationDetailPane>
      </ConfigurationSplitView>
    }
    {creating && <AgentEditor agent={null} onClose={() => setCreating(false)}
      onSaved={(agent) => { selectCreated(agent); setCreating(false); }} />}
  </ConfigurationSection>;
}
