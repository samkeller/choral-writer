import { useState } from 'react';
import { Alert, Button, Checkbox, Group, MultiSelect, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { defaultMemoryRead, type MemoryEntry, type MemoryMutation, type MemoryRead, type MemoryTag, type ProjectAgent } from '@choral-writer/shared';

type Save = (change: MemoryMutation['change']) => Promise<boolean>;

export function MemoryEntryEditor({ entry, tags, pending, save, close }: {
  entry: MemoryEntry | null; tags: MemoryTag[]; pending: boolean; save: Save; close: () => void;
}) {
  const [key, setKey] = useState(entry?.key ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [tagIds, setTagIds] = useState(entry?.tagIds ?? []);
  const [protectedEntry, setProtectedEntry] = useState(entry?.protected ?? false);
  return <form onSubmit={(event) => {
    event.preventDefault();
    void save({ op: 'saveEntry', id: entry?.id, entry: { key, content, tagIds, protected: protectedEntry } }).then((ok) => { if (ok) close(); });
  }}><Stack gap="sm">
    <TextInput label="Clé" required maxLength={200} value={key} onChange={(event) => setKey(event.currentTarget.value)} />
    <Textarea label="Texte mémoire" description="Texte simple ou Markdown." required autosize minRows={4} maxRows={16}
      maxLength={32_000} value={content} onChange={(event) => setContent(event.currentTarget.value)} />
    <MultiSelect label="Tags" required searchable data={tags.map((tag) => ({ value: tag.id, label: tag.name }))} value={tagIds} onChange={setTagIds} />
    <Checkbox label="Protéger cette entrée des modifications du Gardien" checked={protectedEntry}
      onChange={(event) => setProtectedEntry(event.currentTarget.checked)} />
    <Group justify="flex-end"><Button variant="subtle" disabled={pending} onClick={close}>Annuler</Button>
      <Button type="submit" disabled={tagIds.length === 0} loading={pending}>Enregistrer l’entrée</Button></Group>
  </Stack></form>;
}

export function MemoryTagEditor({ tag, pending, save, close }: {
  tag: MemoryTag | null; pending: boolean; save: Save; close: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? '');
  const [description, setDescription] = useState(tag?.description ?? '');
  return <form onSubmit={(event) => {
    event.preventDefault();
    void save({ op: 'saveTag', id: tag?.id, tag: { name, description } }).then((ok) => { if (ok) close(); });
  }}><Stack gap="sm">
    <TextInput label="Nom" required maxLength={120} value={name} onChange={(event) => setName(event.currentTarget.value)} />
    <Textarea label="Description" required autosize minRows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.currentTarget.value)} />
    <Group justify="flex-end"><Button variant="subtle" disabled={pending} onClick={close}>Annuler</Button>
      <Button type="submit" loading={pending}>Enregistrer le tag</Button></Group>
  </Stack></form>;
}

const ALL = '__all__';
export function MemoryReadSelect({ label, tags, read, onChange, disabled, guardian }: {
  label: string; tags: { value: string; label: string }[]; read: { mode: MemoryRead['mode']; tagRefs: string[] };
  onChange: (read: { mode: MemoryRead['mode']; tagRefs: string[] }) => void; disabled?: boolean; guardian?: boolean;
}) {
  return <MultiSelect label={label} description="Un tag correspondant suffit. Aucun tag signifie aucune mémoire ; les tags ne filtrent pas l’historique partagé."
    searchable disabled={disabled} data={[{ value: ALL, label: 'Toute la mémoire' }, ...tags]}
    value={read.mode === 'all' ? [ALL] : read.mode === 'selected' ? read.tagRefs : []}
    onChange={(values) => {
      if (values.includes(ALL) && read.mode !== 'all') onChange({ mode: 'all', tagRefs: [] });
      else if (values.includes(ALL) && values.length === 1) onChange({ mode: 'all', tagRefs: [] });
      else {
        const tagRefs = values.filter((value) => value !== ALL);
        onChange({ mode: guardian && tagRefs.length === 0 ? 'none' : 'selected', tagRefs });
      }
    }} />;
}

export function AgentMemoryEditor({ agent, tags, pending, save }: {
  agent: ProjectAgent; tags: MemoryTag[]; pending: boolean; save: Save;
}) {
  const [read, setRead] = useState<MemoryRead>(agent.memoryRead ?? defaultMemoryRead(agent.output));
  const [saved, setSaved] = useState(false);
  return <Stack gap="xs" miw={0}>
    {agent.output === 'memory_proposals' && <Text size="sm" c="dimmed">Le Gardien doit recevoir toute la mémoire pour la modifier ; sans sélection il est désactivé.</Text>}
    {agent.output === 'memory_proposals' && read.mode === 'selected' && <Alert color="yellow">
      La sélection actuelle ne permet pas au Gardien de fonctionner.
      <Button variant="subtle" onClick={() => { setRead({ mode: 'none', tagIds: [] }); setSaved(false); }}>Désactiver le Gardien</Button>
    </Alert>}
    <MemoryReadSelect label={`Mémoire reçue par ${agent.name}`} tags={agent.output === 'memory_proposals' ? [] : tags.map((tag) => ({ value: tag.id, label: tag.name }))}
      read={{ mode: read.mode, tagRefs: read.tagIds }} disabled={pending} guardian={agent.output === 'memory_proposals'}
      onChange={(next) => { setRead({ mode: next.mode, tagIds: next.tagRefs }); setSaved(false); }} />
    {saved && <Text size="sm" c="choral.3" role="status">Accès enregistrés.</Text>}
    <Button w="fit-content" maw="100%" aria-label={`Enregistrer les accès de ${agent.name}`} loading={pending} disabled={agent.output === 'memory_proposals' && read.mode === 'selected'} onClick={() => void save({ op: 'setAgentRead', agentId: agent.agentId, read }).then(setSaved)}>
      Enregistrer les accès</Button>
  </Stack>;
}
