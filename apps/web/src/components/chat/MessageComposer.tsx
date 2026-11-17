import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Box, Button, Group, Stack, Textarea } from '@mantine/core';
import { IconSend } from '@tabler/icons-react';
import { messageInputSchema } from '@choral-writer/shared';

import { getErrorMessage } from '../../api/client';
import styles from './MessageComposer.module.css';

export function MessageComposer({ pending, onSend, actions }: {
  pending: boolean;
  onSend: (content: string) => Promise<boolean>;
  actions?: ReactNode;
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
        <Group align="flex-end" wrap="nowrap" gap="xs">
          <Textarea
            aria-label="Votre message"
            placeholder="Votre message…"
            classNames={{ root: styles.field, input: styles.input }}
            onChange={(event) => setContent(event.currentTarget.value)}
            minRows={1} autosize maxRows={8} maxLength={20_000} disabled={pending}
          />
          {actions}
          <Button type="submit" aria-label="Envoyer" loading={pending}
            disabled={!content.trim()} px="sm" className={styles.send}>
            <IconSend size={18} aria-hidden="true" />
            <Box component="span" visibleFrom="sm" ml="xs">Envoyer</Box>
          </Button>
        </Group>
        {error && <Alert color="red" role="alert">{error}</Alert>}
      </Stack>
    </form>
  );
}
