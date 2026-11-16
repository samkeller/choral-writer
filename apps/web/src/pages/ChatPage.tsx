import { Alert, Button, Center, Group, Loader, Select, Stack, Text } from '@mantine/core';
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
  const head = chat.history?.turns.at(-1);

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
            {chat.failedBranchId && (
              <Button variant="light" onClick={() => {
                if (chat.failedBranchId) chat.selectBranch(chat.failedBranchId);
              }}>
                Ouvrir l’alternative échouée
              </Button>
            )}
            {!chat.pending && (
              <Button variant="subtle" w="fit-content" onClick={chat.reload}>Recharger l’historique</Button>
            )}
          </Stack>
        </Alert>
      )}
      {chat.project && (
        <>
          <Select
            label="Branche de conversation"
            value={chat.history?.branch.id ?? null}
            data={chat.branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            onChange={(value) => { if (value) chat.selectBranch(value); }}
            disabled={chat.pending || !chat.history}
            allowDeselect={false}
          />
          <details className={styles.systemPrompt}>
            <summary>Prompt système</summary>
            <Text size="sm" c="dimmed" mt="sm">{chat.project.systemPrompt || 'Aucun prompt système.'}</Text>
          </details>
          <MessageList messages={chat.messages} partial={chat.partial} pending={chat.pending} />
          {head && (
            <Group>
              {head.status === 'completed' && (
                <Button variant="subtle" disabled={chat.pending} onClick={() => void chat.regenerate()}>
                  Régénérer la réponse
                </Button>
              )}
              {head.status === 'failed' && (
                <>
                  <Text c="red" size="sm">{head.error}</Text>
                  <Button variant="light" disabled={chat.pending} onClick={() => void chat.retry()}>
                    Réessayer la réponse
                  </Button>
                </>
              )}
            </Group>
          )}
          <MessageComposer pending={chat.pending} onSend={chat.send} />
        </>
      )}
    </Stack>
  );
}
