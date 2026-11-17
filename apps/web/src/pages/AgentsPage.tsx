import { useState } from 'react';
import { Alert, Button, Center, Group, Loader, Paper, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import type { Agent } from '@choral-writer/shared';

import { AgentDeleteDialog } from '../components/agents/AgentDeleteDialog.js';
import { AgentEditor } from '../components/agents/AgentEditor.js';
import { AgentList } from '../components/agents/AgentList.js';
import { PageHeader } from '../components/PageHeader.js';
import { PhaseSelect, type PhaseFilter } from '../components/phases/PhaseSelect.js';
import { useAgentLibrary } from '../hooks/useAgentLibrary.js';

export function AgentsPage() {
  const library = useAgentLibrary();
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<PhaseFilter>('all');
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<Agent | null | undefined>();
  const [deleting, setDeleting] = useState<Agent | null>(null);
  const visible = library.agents.filter((agent) =>
    (phase === 'all' || agent.phase === phase)
    && agent.versions.some((entry) => entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const filtered = query !== '' || phase !== 'all';

  function saved(agent: Agent) {
    setEditing(undefined);
    setExpandedIds((ids) => ids.includes(agent.id) ? ids : [...ids, agent.id]);
    setQuery('');
    setPhase('all');
    library.reload();
  }

  return (
    <Stack gap="xl">
      <PageHeader title="Agents"
        actions={<Button leftSection={<IconPlus size={16} />} onClick={() => setEditing(null)}>Nouvel agent</Button>} />
      <Group align="flex-end" gap="sm">
        <TextInput placeholder="Rechercher un agent…" aria-label="Rechercher un agent" value={query}
          leftSection={<IconSearch size={16} />} onChange={(event) => setQuery(event.currentTarget.value)}
          style={{ flex: 1, minWidth: 180 }} />
        <PhaseSelect value={phase} onChange={setPhase} />
      </Group>
      {library.loading && <Center py="xl"><Loader aria-label="Chargement des agents" /></Center>}
      {library.error && (
        <Alert color="red" role="alert" title="Bibliothèque indisponible">
          <Text>{library.error}</Text><Button variant="subtle" onClick={library.reload}>Réessayer</Button>
        </Alert>
      )}
      {!library.loading && !library.error && (
        <>
          <AgentList agents={visible} expandedIds={expandedIds}
            onToggle={(id) => setExpandedIds((ids) => ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id])}
            onEdit={setEditing} onDelete={setDeleting} />
          {visible.length === 0 && (
            <Paper withBorder p="xl">
              <Stack align="flex-start" gap="sm">
                <Text fw={500}>{filtered ? 'Aucun agent ne correspond à cette recherche.' : 'Votre bibliothèque est encore vide.'}</Text>
                {filtered
                  ? <Button variant="light" onClick={() => { setQuery(''); setPhase('all'); }}>Réinitialiser les filtres</Button>
                  : <Button variant="light" onClick={() => setEditing(null)}>Créer un agent</Button>}
              </Stack>
            </Paper>
          )}
        </>
      )}
      {editing !== undefined && <AgentEditor agent={editing} onClose={() => setEditing(undefined)} onSaved={saved} />}
      {deleting && <AgentDeleteDialog agent={deleting} onClose={() => setDeleting(null)} onDeleted={() => {
        setDeleting(null);
        setExpandedIds((ids) => ids.filter((id) => id !== deleting.id));
        library.reload();
      }} />}
    </Stack>
  );
}
