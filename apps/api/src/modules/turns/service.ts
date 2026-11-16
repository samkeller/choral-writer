import { asc, desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { ChatEvent, Message } from '@choral-writer/shared';

import type { Database } from '../../db/client.js';
import { messages } from '../../db/entities/message.js';
import { turns } from '../../db/entities/turn.js';
import { projects } from '../../db/entities/project.js';
import type { createCallLLM } from '../../llm/call-llm.js';
import { lockProject, type ProjectsService } from '../projects/service.js';

function messageDto(row: typeof messages.$inferSelect): Message {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export function createTurnsService(
  database: Database,
  projectService: ProjectsService,
  callLLM: ReturnType<typeof createCallLLM>,
) {
  return {
    async history(projectId: string): Promise<Message[]> {
      await projectService.get(projectId);
      const rows = await database.select().from(messages).where(eq(messages.projectId, projectId))
        .orderBy(asc(messages.createdAt), asc(messages.id));
      return rows.map(messageDto);
    },
    async run(
      projectId: string,
      content: string,
      emit: (event: ChatEvent) => Promise<void>,
      signal: AbortSignal,
    ) {
      // The row lock spans generation: competing turns fail fast and crashes release it.
      return database.transaction(async (tx) => {
        const project = await lockProject(tx, projectId);
        const history = await tx.select().from(messages).where(eq(messages.projectId, projectId))
          .orderBy(desc(messages.createdAt), desc(messages.id)).limit(40);
        const [user] = await tx.insert(messages).values({
          id: uuidv7(), projectId, role: 'user', content,
        }).returning();
        const turnId = uuidv7();
        await tx.insert(turns).values({ id: turnId, projectId, userMessageId: user.id, status: 'running' });
        await emit({ type: 'chat.turn.started', turnId, message: messageDto(user) });

        let generated: string;
        try {
          const result = await callLLM({
            turnId,
            stage: 'narrator',
            signal,
            messages: [
              { role: 'system', content: project.systemPrompt },
              ...history.reverse().map((message) => ({ role: message.role, content: message.content })),
              { role: 'user', content },
            ],
            onDelta: (delta) => emit({ type: 'chat.message.delta', delta }),
          });
          generated = result.content;
        } catch (error) {
          await tx.update(turns).set({
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          }).where(eq(turns.id, turnId));
          return { status: 'failed' as const, turnId, error };
        }

        const [assistant] = await tx.insert(messages).values({
          id: uuidv7(), projectId, role: 'assistant', content: generated,
          createdAt: new Date(),
        }).returning();
        await tx.update(turns).set({
          status: 'completed', assistantMessageId: assistant.id, completedAt: new Date(),
        }).where(eq(turns.id, turnId));
        await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
        return { status: 'completed' as const, turnId, message: messageDto(assistant) };
      });
    },
  };
}

export type TurnsService = ReturnType<typeof createTurnsService>;
