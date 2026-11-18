import { useState, type FormEvent } from 'react';
import { projectInputSchema, type ProjectInput } from '@choral-writer/shared';
import { getErrorMessage } from '../api/client';

export function useProjectForm(initial: ProjectInput | undefined, onSubmit: (input: ProjectInput) => Promise<void>) {
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

  return { name, setName, systemPrompt, setSystemPrompt, error, pending, submit };
}
