import { Alert, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { Link, useParams } from 'react-router-dom';
import { projectParamsSchema } from '@choral-writer/shared';

import { MessageComposer } from '../components/chat/MessageComposer.js';
import { MessageList } from '../components/chat/MessageList.js';
import { useChat } from '../hooks/useChat.js';
import { NotFoundPage } from './NotFoundPage.js';

export function ChatPage() {
  const params = projectParamsSchema.safeParse(useParams());
  if (!params.success) return <NotFoundPage />;
  return <ProjectChat key={params.data.projectId} projectId={params.data.projectId} />;
}

function ProjectChat({ projectId }: { projectId: string }) {
  const chat = useChat(projectId);

  if (chat.loading) return <Loader aria-label="Chargement de la conversation" />;

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={1} size="h2">{chat.project?.name ?? 'Conversation'}</Title>
        <Button component={Link} to="/projects" variant="subtle">Tous les projets</Button>
      </Group>
      {chat.error && (
        <Alert color="red" title="Conversation">
          {chat.error}
          {!chat.pending && <Button variant="subtle" onClick={chat.reload}>Recharger l’historique</Button>}
        </Alert>
      )}
      {chat.project && (
        <>
          <details>
            <summary>Prompt système</summary>
            <Text size="sm" c="dimmed" className="message-content" mt="sm">{chat.project.systemPrompt || 'Aucun prompt système.'}</Text>
          </details>
          <MessageList messages={chat.messages} partial={chat.partial} pending={chat.pending} />
          <MessageComposer pending={chat.pending} onSend={chat.send} />
        </>
      )}
    </Stack>
  );
}
