import { Alert, Button, Center, Code, Drawer, Group, Loader, Popover, ScrollArea, Select, Stack, Text } from '@mantine/core';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { IconAdjustmentsHorizontal, IconArrowLeft, IconInfoCircle, IconRefresh } from '@tabler/icons-react';
import { projectParamsSchema } from '@choral-writer/shared';

import { PageHeader } from '../components/PageHeader';
import { MessageComposer } from '../components/chat/MessageComposer';
import { MessageList } from '../components/chat/MessageList';
import { ProjectAgentSetup } from '../components/agents/ProjectAgentSetup';
import { useChat } from '../hooks/useChat';
import { NotFoundPage } from './NotFoundPage';
import { IconAction } from '../components/atoms/IconAction';

export function ChatPage() {
  const params = projectParamsSchema.safeParse(useParams());
  if (!params.success) return <NotFoundPage />;
  return <ProjectChat key={params.data.projectId} projectId={params.data.projectId} />;
}

function ProjectChat({ projectId }: { projectId: string }) {
  const [search, setSearch] = useSearchParams();
  const setupOpen = search.get('setup') === 'agents';
  const chat = useChat(projectId);
  const head = chat.history?.turns.at(-1);

  if (chat.loading) {
    return <Center py="xl"><Loader color="choral" aria-label="Chargement de la conversation" /></Center>;
  }

  return (
    <Stack gap="lg" maw={800} mx="auto" w="100%">
      <PageHeader
        title={chat.project?.name ?? 'Conversation'}
        actions={<Group gap="xs">
          <IconAction label="Configuration" disabled={chat.pending}
            onClick={() => setSearch((current) => { current.set('setup', 'agents'); return current; })}>
            <IconAdjustmentsHorizontal size={18} aria-hidden="true" />
          </IconAction>
          <IconAction component={Link} to="/projects" label="Tous les projets">
            <IconArrowLeft size={18} aria-hidden="true" />
          </IconAction>
        </Group>}
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
          <Group align="center" justify='space-between' gap="sm">
            <Select
              label="Branche de conversation"
              value={chat.history?.branch.id ?? null}
              data={chat.branches.map((branch) => ({ value: branch.id, label: branch.name }))}
              onChange={(value) => { if (value) chat.selectBranch(value); }}
              disabled={chat.pending || !chat.history}
              allowDeselect={false}
            />
            <Popover position="bottom-end" withArrow shadow="md" width={380}>
              <Popover.Target>
                <IconAction label="Afficher le prompt système">
                  <IconInfoCircle size={18} aria-hidden="true" />
                </IconAction>
              </Popover.Target>

              <Popover.Dropdown>
                <Stack gap="xs">
                  <Text size="sm" fw={600}>
                    Prompt système
                  </Text>
                  <ScrollArea.Autosize mah={300} type="auto">
                    <Code>
                      {chat.project.systemPrompt || 'Aucun prompt système.'}
                    </Code>
                  </ScrollArea.Autosize>
                </Stack>
              </Popover.Dropdown>
            </Popover>
          </Group>
          <MessageList messages={chat.messages} partial={chat.partial} pending={chat.pending} />
          {head && (
            <Group justify="flex-end" gap={4}>
              {head.status === 'completed' && (
                <IconAction label="Régénérer la réponse" disabled={chat.pending} onClick={() => void chat.regenerate()}>
                  <IconRefresh size={18} aria-hidden="true" />
                </IconAction>
              )}

              {head.status === 'failed' && (
                <>
                  <Text c="red" size="xs">{head.error}</Text>
                  <IconAction label="Réessayer la réponse" color="red" disabled={chat.pending} onClick={() => void chat.retry()}>
                    <IconRefresh size={18} aria-hidden="true" />
                  </IconAction>
                </>
              )}
            </Group>
          )}
          <MessageComposer pending={chat.pending} onSend={chat.send} />
          <Drawer opened={setupOpen} position="right" size="lg" title="Configuration du projet"
            overlayProps={{ backgroundOpacity: 0.35, blur: 3 }}
            onClose={() => setSearch((current) => {
              const next = new URLSearchParams(current);
              next.delete('setup');
              next.delete('agentVersion');
              return next;
            })}>
            {setupOpen && <ProjectAgentSetup projectId={projectId} suggestedVersion={search.get('agentVersion')} />}
          </Drawer>
        </>
      )}
    </Stack>
  );
}
