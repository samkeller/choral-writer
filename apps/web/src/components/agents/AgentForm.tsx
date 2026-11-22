import { useState, type FormEvent } from 'react';
import { Alert, Button, Group, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import {
  agentInputSchema, agentOutputSchema, type Agent, type AgentInput, type AgentVersionInput,
} from '@choral-writer/shared';

import { getErrorMessage } from '../../api/client';
import { agentOutputPresentation } from './agentPresentation';
import { PhaseTag } from '../phases/PhaseTag';

type Props = {
  onCancel: () => void;
} & (
  | { initial?: undefined; baseVersionId?: undefined; onSubmit: (input: AgentInput) => Promise<void> }
  | {
    initial: Agent; onSubmit: (input: AgentVersionInput) => Promise<void>;
    /** The version the new one starts from; the latest by default. */
    baseVersionId?: string;
  }
);

export function AgentForm(props: Props) {
  const initial = props.initial?.versions.find((version) => version.id === props.baseVersionId)
    ?? props.initial?.versions[0];
  const [name, setName] = useState(initial?.name ?? '');
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [output, setOutput] = useState<Agent['output']>(props.initial?.output ?? 'envelope');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = agentInputSchema.safeParse({
      name, instructions, output, phase: agentOutputPresentation[output].phase,
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
        {props.initial && <Text size="sm" c="dimmed">Les projets conservent leur version actuelle.</Text>}
        <TextInput label="Nom" required maxLength={120} value={name}
          onChange={(event) => setName(event.currentTarget.value)} disabled={pending} autoFocus />
        <Group align="flex-end">
          <Select label="Contrat de sortie" value={output} allowDeselect={false} style={{ flex: 1, minWidth: 180 }}
            data={Object.entries(agentOutputPresentation).map(([value, { label }]) => ({ value, label }))}
            renderOption={({ option }) => (
              <Group gap="xs">
                <PhaseTag phase={agentOutputPresentation[agentOutputSchema.parse(option.value)].phase} />
                <Text size="sm">{option.label}</Text>
              </Group>
            )}
            onChange={(value) => { if (value) setOutput(agentOutputSchema.parse(value)); }}
            disabled={pending || Boolean(props.initial)} />
          <output aria-label="Phase de l’agent">
            <PhaseTag phase={agentOutputPresentation[output].phase} />
          </output>
        </Group>
        <Textarea label="Instructions" value={instructions}
          onChange={(event) => setInstructions(event.currentTarget.value)}
          minRows={9} autosize maxRows={18} maxLength={50_000} disabled={pending} />
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={props.onCancel} disabled={pending}>Annuler</Button>
          <Button type="submit" loading={pending}>{props.initial ? 'Publier la version' : 'Créer l’agent'}</Button>
        </Group>
      </Stack>
    </form>
  );
}
