import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Group, Loader, Modal, Pagination, Paper, Stack, Switch, Text, TextInput, Textarea, Title } from '@mantine/core';
import type { MemoryEntry, MemoryMutation, MemorySetupProposal, MemoryTag } from '@choral-writer/shared';
import { readsMemory } from '@choral-writer/shared';
import { IconArchive, IconEdit, IconFileSpreadsheet, IconHistory, IconPlus, IconRefresh, IconTags } from '@tabler/icons-react';
import {
  ConfigurationDetailPane,
  ConfigurationListPane,
  ConfigurationListItem,
  ConfigurationScrollArea,
  ConfigurationSection,
  ConfigurationSplitView,
} from '../components/configuration/ConfigurationLayout';
import { IconAction } from '../components/atoms/IconAction';
import { MarkdownContent } from '../components/llm/MarkdownContent';
import { MemoryEntryEditor, MemoryReadSelect, MemoryTagEditor } from '../components/memories/MemoryEditors';
import { MemoryResultDisplay } from '../components/memories/MemoryTracePanel';
import { MemoryTransfer } from '../components/memories/MemoryTransfer';
import { BranchSwitcher } from '../components/chat/BranchSwitcher';
import type { useMemories } from '../hooks/useMemories';

type Editor = { kind: 'entry'; value: MemoryEntry | null } | { kind: 'tag'; value: MemoryTag | null };

export function ProjectMemories({ memory, selectBranch }: {
  memory: ReturnType<typeof useMemories>; selectBranch: (branch: string) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmation, setConfirmation] = useState<{ label: string; change: MemoryMutation['change'] } | null>(null);
  const [query, setQuery] = useState('');
  const [archives, setArchives] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const [draft, setDraft] = useState<MemorySetupProposal | null>(null);
  const [draftBase, setDraftBase] = useState<typeof memory.view>(null);
  const [approved, setApproved] = useState<number[]>([]);
  useEffect(() => setApproved([]), [memory.lastResult]);
  const view = memory.view;
  const error = memory.error && <Alert color="red" title="Mémoire" role="alert">
    <Stack gap="xs"><Text>{memory.error}</Text><Button variant="subtle" w="fit-content" disabled={memory.pending || memory.loading}
      onClick={memory.reload}>Recharger l’état courant (garder le formulaire)</Button></Stack></Alert>;
  if (!view) return <ConfigurationSection title="Mémoire" feedback={error}><ConfigurationScrollArea>
    {memory.loading && <Loader aria-label="Chargement de la mémoire" />}
  </ConfigurationScrollArea></ConfigurationSection>;
  const filtered = view.state.entries.filter((entry) => (archives || !entry.archived)
    && `${entry.key} ${entry.content} ${entry.tagIds.map((id) => view.state.tags.find((tag) => tag.id === id)?.name ?? '').join(' ')}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const currentPage = Math.max(1, Math.min(page, Math.ceil(filtered.length / 25)));
  const shown = filtered.slice((currentPage - 1) * 25, currentPage * 25);
  const selected = shown.find((entry) => entry.id === selectedId) ?? shown[0];
  const selectedStatus = selected ? [selected.archived && 'Archivée', selected.protected && 'Protégée'].filter(Boolean).join(' · ') : '';
  return (
    <ConfigurationSection title="Mémoire"
      primaryAction={{ label: 'Proposer la configuration', accessibleLabel: 'Proposer la configuration mémoire', loading: memory.pending,
        onClick: () => void memory.propose().then((proposal) => { if (proposal) { setDraftBase(view); setDraft(proposal); } }) }}
      actions={<>
        <IconAction label={`Tags (${view.state.tags.length})`} onClick={() => setTagsOpen(true)}><IconTags size={18} /></IconAction>
        <IconAction label="Import / export CSV" disabled={memory.pending} onClick={() => setTransferOpen(true)}><IconFileSpreadsheet size={18} /></IconAction>
        {memory.lastResult && <IconAction onClick={() => setResultOpen(true)}
          label={`Dernier traitement : ${memory.lastResult.status === 'success' ? 'terminé' : memory.lastResult.status === 'failed' ? 'échec' : 'non exécuté'}${memory.lastResult.tagSuggestions?.length ? ` · ${memory.lastResult.tagSuggestions.length} suggestion(s)` : ''}`}>
          <IconHistory size={18} />
        </IconAction>}
        {view.headTurnId && <IconAction label="Relancer le Gardien" disabled={!view.enabled || memory.pending}
          onClick={() => setRetryOpen(true)}><IconRefresh size={18} /></IconAction>}
      </>}
      controls={<>
        <BranchSwitcher branches={memory.branches} currentId={view.branchId} disabled={memory.pending}
          onChange={selectBranch} />
        <Switch label="Mémoire activée" checked={view.enabled} disabled={memory.pending}
          onChange={(event) => void memory.change({ op: 'settings', enabled: event.currentTarget.checked })} />
        <Text size="xs" c="dimmed">Gardien : {memory.agents.some((agent) => agent.output === 'memory_proposals') ? 'configuré' : 'absent'}</Text>
      </>}
      feedback={<>{error}{memory.notice && <Alert color="choral" role="status">{memory.notice}</Alert>}</>}>
      <ConfigurationSplitView>
        <ConfigurationListPane title="Souvenirs" count={filtered.length}
          actions={<IconAction label="Créer une entrée manuellement" disabled={memory.pending || !view.state.tags.length}
            onClick={() => setEditor({ kind: 'entry', value: null })}><IconPlus size={18} /></IconAction>}
          filters={<Stack gap="xs">
            <TextInput label="Rechercher une entrée ou un tag" placeholder="Rechercher…" value={query} onChange={(event) => { setQuery(event.currentTarget.value); setPage(1); }} />
            <Checkbox size="xs" label="Inclure les archives" checked={archives} onChange={(event) => { setArchives(event.currentTarget.checked); setPage(1); }} />
            {!view.state.tags.length && <Text size="xs" c="dimmed">Ajoutez un tag pour créer une entrée.</Text>}
          </Stack>}>
          {!shown.length && <Text size="sm" c="dimmed">Aucune entrée dans cette sélection.</Text>}
          {shown.map((entry) => <ConfigurationListItem key={entry.id} selected={selected?.id === entry.id}
            onClick={() => setSelectedId(entry.id)} label={entry.key} description={entry.content}
            status={entry.protected ? { label: 'Protégée' } : undefined}
            metadata={`${entry.archived ? 'Archivée · ' : ''}${entry.tagIds.map((id) => view.state.tags.find((tag) => tag.id === id)?.name ?? id).join(' · ')}`} />)}
          {filtered.length > 25 && <Pagination mt="sm" value={currentPage} onChange={(next) => { setPage(next); setSelectedId(null); }} total={Math.ceil(filtered.length / 25)} size="sm" />}
        </ConfigurationListPane>
        <ConfigurationDetailPane>
          {selected ? <>
            <Group justify="space-between" align="flex-start" gap="sm" wrap="wrap">
              <Stack gap="xs" miw={0} style={{ flex: '1 1 14rem' }}>
                <Title order={3} size="h4" style={{ overflowWrap: 'anywhere' }}>{selected.key}</Title>
                <Text size="xs" c="dimmed">{selected.source === 'user' ? 'Correction manuelle' : 'Gardien'}{selectedStatus ? ` · ${selectedStatus}` : ''}</Text>
                <Group gap={4}>{selected.tagIds.map((id) => <Badge key={id} variant="light" color="gray">{view.state.tags.find((tag) => tag.id === id)?.name ?? id}</Badge>)}</Group>
              </Stack>
              <Group gap="xs" wrap="nowrap">
                <IconAction label={`Modifier ${selected.key}`} disabled={memory.pending} onClick={() => setEditor({ kind: 'entry', value: selected })}><IconEdit size={18} /></IconAction>
                <IconAction label={`${selected.archived ? 'Restaurer' : 'Archiver'} ${selected.key}`} disabled={memory.pending} onClick={() => setConfirmation({ label: `${selected.archived ? 'Restaurer' : 'Archiver'} « ${selected.key} » ?`, change: { op: 'archiveEntry', id: selected.id, archived: !selected.archived } })}><IconArchive size={18} /></IconAction>
              </Group>
            </Group>
            <MarkdownContent content={selected.content} />
          </> : <Text c="dimmed" size="sm">Sélectionnez une entrée dans la liste. Le Gardien enrichit la mémoire après les scènes ; vous pouvez aussi la corriger ici.</Text>}
        </ConfigurationDetailPane>
      </ConfigurationSplitView>
      <Modal opened={tagsOpen} onClose={() => setTagsOpen(false)} title="Tags mémoire" size="lg">
        <Stack><Text size="sm" c="dimmed">Le Gardien utilise ces descriptions pour classer les souvenirs. Ajouter un tag n’abonne aucun agent.</Text>
          <Button w="fit-content" variant="light" disabled={memory.pending} onClick={() => setEditor({ kind: 'tag', value: null })}>Ajouter un tag</Button>
          {view.state.tags.map((tag) => <Paper p="sm" withBorder key={tag.id}><Group justify="space-between" align="flex-start" gap="sm" wrap="wrap"><Stack gap={2} miw={0} style={{ flex: '1 1 12rem' }}><Text fw={600} style={{ overflowWrap: 'anywhere' }}>{tag.name}</Text><Text size="sm" style={{ overflowWrap: 'anywhere' }}>{tag.description}</Text></Stack>
            <IconAction label={`Modifier ${tag.name}`} disabled={memory.pending} onClick={() => setEditor({ kind: 'tag', value: tag })}><IconEdit size={16} /></IconAction></Group></Paper>)}
          {!view.state.tags.length && <Text c="dimmed" size="sm">Aucun tag défini.</Text>}
        </Stack>
      </Modal>
      <Modal opened={draft !== null} onClose={() => { if (!memory.pending) setDraft(null); }} title="Vérifier la proposition" size="lg">
        {draft && <Stack>{error}<Text size="sm">La proposition n’est pas enregistrée. Les tags existants non mentionnés sont conservés.</Text>
          {draft.tags.map((tag, index) => <Stack key={tag.ref} gap="xs">
            <TextInput label={`Nom du tag ${index + 1}`} required value={tag.name} maxLength={120} onChange={(event) => { const name = event.currentTarget.value; setDraft({ ...draft, tags: draft.tags.map((item, i) => i === index ? { ...item, name } : item) }); }} />
            <Textarea label={`Description du tag ${index + 1}`} required value={tag.description} maxLength={2000} onChange={(event) => { const description = event.currentTarget.value; setDraft({ ...draft, tags: draft.tags.map((item, i) => i === index ? { ...item, description } : item) }); }} />
          </Stack>)}
          {draft.agents.map((assignment, index) => {
            const agent = memory.agents.find((item) => item.agentId === assignment.agentId);
            if (agent && !readsMemory(agent.output)) return null;
            const tags = [...view.state.tags.map((tag) => ({ value: tag.id, label: draft.tags.find((item) => item.ref === tag.id)?.name ?? tag.name })),
            ...draft.tags.filter((tag) => !view.state.tags.some((item) => item.id === tag.ref)).map((tag) => ({ value: tag.ref, label: tag.name }))];
            return <MemoryReadSelect key={assignment.agentId} label={`Mémoire proposée pour ${agent?.name ?? assignment.agentId}`} tags={agent?.output === 'memory_proposals' ? [] : tags} guardian={agent?.output === 'memory_proposals'}
              read={assignment} onChange={(read) => setDraft({ ...draft, agents: draft.agents.map((item, i) => i === index ? { ...item, ...read } : item) })} />;
          })}
          {draft.agents.some((item) => memory.agents.find((agent) => agent.agentId === item.agentId)?.output === 'memory_proposals' && item.mode === 'selected') && <Alert color="yellow">Le Gardien doit recevoir toute la mémoire ou être désactivé.
            <Button variant="subtle" onClick={() => setDraft({ ...draft, agents: draft.agents.map((item) => memory.agents.find((agent) => agent.agentId === item.agentId)?.output === 'memory_proposals' && item.mode === 'selected' ? { ...item, mode: 'none', tagRefs: [] } : item) })}>Désactiver le Gardien dans la proposition</Button></Alert>}
          <Group justify="flex-end"><Button variant="default" disabled={memory.pending} onClick={() => setDraft(null)}>Annuler</Button>
            <Button loading={memory.pending} disabled={!draftBase || draft.tags.some((tag) => !tag.name.trim() || !tag.description.trim()) || draft.agents.some((item) => memory.agents.find((agent) => agent.agentId === item.agentId)?.output === 'memory_proposals' && item.mode === 'selected')}
              onClick={() => { if (draftBase) void memory.change({ op: 'applySetup', proposal: draft }, draftBase).then((ok) => { if (ok) setDraft(null); }); }}>Appliquer la proposition</Button></Group>
        </Stack>}
      </Modal>
      <Modal opened={resultOpen} onClose={() => setResultOpen(false)} title="Dernier traitement mémoire" size="lg">
        {memory.lastResult && <Stack><MemoryResultDisplay result={memory.lastResult} />{memory.lastResult.tagSuggestions?.map((suggestion, index) => <Paper key={`${suggestion.name}:${index}`} p="sm" withBorder>
          <Text fw={600}>{suggestion.name}</Text><Text size="sm">{suggestion.description}</Text><Text size="xs" c="dimmed">{suggestion.reason}</Text>
          <Button mt="xs" size="xs" variant="light" disabled={approved.includes(index)} loading={memory.pending} onClick={() => void memory.change({ op: 'saveTag', tag: { name: suggestion.name, description: suggestion.description } }).then((ok) => { if (ok) setApproved((current) => [...current, index]); })}>{approved.includes(index) ? 'Tag ajouté' : 'Approuver ce tag'}</Button>
        </Paper>)}{error}</Stack>}
      </Modal>
      {transferOpen && <MemoryTransfer view={view} pending={memory.pending} save={memory.change} close={() => setTransferOpen(false)} />}
      <Modal opened={editor !== null} onClose={() => { if (!memory.pending) setEditor(null); }} title={editor?.kind === 'entry' ? 'Entrée mémoire' : 'Tag mémoire'}>
        {error}{editor?.kind === 'entry' && <MemoryEntryEditor entry={editor.value} tags={view.state.tags} pending={memory.pending} save={memory.change} close={() => setEditor(null)} />}
        {editor?.kind === 'tag' && <MemoryTagEditor tag={editor.value} pending={memory.pending} save={memory.change} close={() => setEditor(null)} />}
      </Modal>
      <Modal opened={confirmation !== null} onClose={() => { if (!memory.pending) setConfirmation(null); }} title="Confirmer">{error}<Text mb="md">{confirmation?.label}</Text>
        <Group justify="flex-end"><Button variant="subtle" disabled={memory.pending} onClick={() => setConfirmation(null)}>Annuler</Button><Button loading={memory.pending} onClick={() => { if (confirmation) void memory.change(confirmation.change).then((ok) => { if (ok) setConfirmation(null); }); }}>Confirmer</Button></Group></Modal>
      <Modal opened={retryOpen} onClose={() => setRetryOpen(false)} title="Relancer la mémoire"><Text mb="md">Le Gardien relira la dernière scène terminée avec la mémoire et la configuration actuelles. Aucun texte narratif ne sera régénéré.</Text>
        <Group justify="flex-end"><Button variant="subtle" onClick={() => setRetryOpen(false)}>Annuler</Button><Button onClick={() => { setRetryOpen(false); void memory.runGuardian(); }}>Relancer le Gardien</Button></Group></Modal>
    </ConfigurationSection>
  )
}
