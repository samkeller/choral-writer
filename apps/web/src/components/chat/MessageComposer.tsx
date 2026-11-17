import { useState, type FormEvent } from 'react';
import { Alert, Button, Group, Stack, Textarea } from '@mantine/core';
import { messageInputSchema } from '@choral-writer/shared';

import { getErrorMessage } from '../../api/client.js';

export function MessageComposer({ pending, onSend }: {
  pending: boolean;
  onSend: (content: string) => Promise<boolean>;
}) {
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = messageInputSchema.safeParse({ content });
    if (!parsed.success) {
      setError('Saisissez un message de 1 à 20 000 caractères.');
      return;
    }
    setError('');
    try {
      if (await onSend(parsed.data.content)) setContent('');
    } catch (error) {
      setError(getErrorMessage(error));
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <Textarea
          aria-label="Votre message"
          onChange={(event) => setContent(event.currentTarget.value)}
          minRows={3} autosize maxRows={8} maxLength={20_000} disabled={pending}
        />
        {error && <Alert color="red" role="alert">{error}</Alert>}
        <Group justify="flex-end">
          <Button type="submit" loading={pending} disabled={!content.trim()}>Envoyer</Button>
        </Group>
      </Stack>
    </form>
  );
}
