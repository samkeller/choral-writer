import { useState, type FormEvent } from 'react';
import { Alert, Button, Group, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import {
  agentInputSchema, type Agent, type AgentInput, type AgentVersionInput,
} from '@choral-writer/shared';

import { getErrorMessage } from '../../api/client.js';
import { outputLabels } from './AgentVersionDetails.js';

type Props = {
  onCancel: () => void;
} & (
  | { initial?: undefined; onSubmit: (input: AgentInput) => Promise<void> }
  | { initial: Agent; onSubmit: (input: AgentVersionInput) => Promise<void> }
);

export function AgentForm(props: Props) {
  const initial = props.initial?.versions[0];
  const [name, setName] = useState(initial?.name ?? '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [output, setOutput] = useState<string>(props.initial?.output ?? 'envelope');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = agentInputSchema.safeParse({
      name, instructions, output, phase: output === 'envelope' ? 'analysis' : 'restitution',
    });
    if (!parsed.success) {
      setError('Renseignez un nom (120 caractères maximum) et des instructions de moins de 50 000 caractères.');
      return;
    }
    setPending(true);
    setError('');
    try {
      if (props.initial) {
        await props.onSubmit({ name: parsed.data.name, instructions: parsed.data.instructions });
      } else {
        await props.onSubmit(parsed.data);
      }
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          {props.initial
            ? 'Publier une version ne modifie aucun projet. Chaque projet choisit quand l’adopter.'
            : 'Un agent réutilisable, une phase fixe. Ses instructions pourront évoluer par versions.'}
        </Text>
        <TextInput label="Nom" required maxLength={120} value={name}
          onChange={(event) => setName(event.currentTarget.value)} disabled={pending} autoFocus />
        <Select label="Contrat de sortie" value={output} allowDeselect={false}
          description="Détermine la phase et le format attendu par le moteur."
          data={Object.entries(outputLabels).map(([value, label]) => ({ value, label }))}
          onChange={(value) => { if (value) setOutput(value); }} disabled={pending || Boolean(props.initial)} />
        <Textarea label="Instructions" value={instructions}
          onChange={(event) => setInstructions(event.currentTarget.value)}
          minRows={9} autosize maxRows={18} maxLength={50_000} disabled={pending}
          placeholder="Définissez son regard, ses priorités et sa manière de contribuer…" />
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={props.onCancel} disabled={pending}>Annuler</Button>
          <Button type="submit" loading={pending}>{props.initial ? 'Publier la version' : 'Créer l’agent'}</Button>
        </Group>
      </Stack>
    </form>
  );
}
