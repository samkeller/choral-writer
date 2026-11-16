import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core';
import { Link, useParams } from 'react-router-dom';
import { projectParamsSchema } from '@choral-writer/shared';

import { PageHeader } from '../components/PageHeader.js';
import { MessageComposer } from '../components/chat/MessageComposer.js';
import { MessageList } from '../components/chat/MessageList.js';
import styles from './ChatPage.module.css';
import { useChat } from '../hooks/useChat.js';
import { NotFoundPage } from './NotFoundPage.js';

export function ChatPage() {
  const params = projectParamsSchema.safeParse(useParams());
  if (!params.success) return <NotFoundPage />;
  return <ProjectChat key={params.data.projectId} projectId={params.data.projectId} />;
}

function ProjectChat({ projectId }: { projectId: string }) {
  const chat = useChat(projectId);

  if (chat.loading) {
    return <Center py="xl"><Loader color="choral" aria-label="Chargement de la conversation" /></Center>;
  }

  return (
    <Stack gap="lg" maw={800} mx="auto" w="100%">
      <PageHeader
        title={chat.project?.name ?? 'Conversation'}
        actions={<Button component={Link} to="/projects" variant="subtle">Tous les projets</Button>}
      />
      {chat.error && (
        <Alert color="red" title="Conversation" role="alert">
          <Stack gap="sm">
            <Text>{chat.error}</Text>
            {!chat.pending && (
              <Button variant="subtle" w="fit-content" onClick={chat.reload}>Recharger l’historique</Button>
            )}
          </Stack>
        </Alert>
      )}
      {chat.project && (
        <>
          <details className={styles.systemPrompt}>
            <summary>Prompt système</summary>
            <Text size="sm" c="dimmed" mt="sm">{chat.project.systemPrompt || 'Aucun prompt système.'}</Text>
          </details>
          <MessageList messages={chat.messages} partial={chat.partial} pending={chat.pending} />
          <MessageComposer pending={chat.pending} onSend={chat.send} />
        </>
      )}
    </Stack>
  );
}
