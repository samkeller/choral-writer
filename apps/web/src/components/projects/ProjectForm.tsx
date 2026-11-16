import { useState, type FormEvent } from 'react';
import { Alert, Button, Group, Stack, Textarea, TextInput } from '@mantine/core';
import { projectInputSchema, type ProjectInput } from '@choral-writer/shared';

import { getErrorMessage } from '../../api/client.js';

interface ProjectFormProps {
  initial?: ProjectInput;
  onSubmit: (input: ProjectInput) => Promise<void>;
  onCancel: () => void;
}

export function ProjectForm({ initial, onSubmit, onCancel }: ProjectFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? '');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = projectInputSchema.safeParse({ name, systemPrompt });
    if (!parsed.success) {
      setError('Le nom est obligatoire (120 caractères maximum) et le prompt est limité à 50 000 caractères.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await onSubmit(parsed.data);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput
          label="Nom du projet" required maxLength={120} value={name}
          onChange={(event) => setName(event.currentTarget.value)} disabled={pending} autoFocus
        />
        <Textarea
          label="Prompt système"
          description="Définissez le monde, le rôle et le ton du chatbot. Ce prompt accompagne chaque message."
          value={systemPrompt} onChange={(event) => setSystemPrompt(event.currentTarget.value)}
          minRows={8} autosize maxRows={18} maxLength={50_000} disabled={pending}
        />
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel} disabled={pending}>Annuler</Button>
          <Button type="submit" loading={pending}>Enregistrer</Button>
        </Group>
      </Stack>
    </form>
  );
}
