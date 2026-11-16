import { describe, expect, it, vi } from 'vitest';
import type { ChatBranch, Message } from '@choral-writer/shared';

import type { ChatServiceDependencies, ChatTransactionContext } from '../types/chat.types.js';
import type { Narrator } from '../types/narrator.types.js';
import { ChatService } from './chatService.js';

function setup() {
  const projectId = 'project';
  const branch: ChatBranch = {
    id: 'branch', projectId, name: 'Principale',
    sourceBranchId: null, forkTurnId: null, headTurnId: null,
    createdAt: new Date().toISOString(),
  };
  const user: Message = {
    id: 'user', projectId, role: 'user', content: 'Open the door.',
    createdAt: new Date().toISOString(),
  };
  const context = {
    project: { id: projectId, systemPrompt: 'Current prompt.' },
    branches: {
      list: vi.fn<ChatTransactionContext['branches']['list']>(),
      get: vi.fn<ChatTransactionContext['branches']['get']>().mockResolvedValue(branch),
      createMain: vi.fn<ChatTransactionContext['branches']['createMain']>(),
      fork: vi.fn<ChatTransactionContext['branches']['fork']>(),
      advance: vi.fn<ChatTransactionContext['branches']['advance']>(),
    },
    messages: {
      createUser: vi.fn<ChatTransactionContext['messages']['createUser']>().mockResolvedValue(user),
      createAssistant: vi.fn<ChatTransactionContext['messages']['createAssistant']>()
        .mockResolvedValue({ ...user, id: 'assistant', role: 'assistant', content: 'The door opens.' }),
    },
    turns: {
      get: vi.fn<ChatTransactionContext['turns']['get']>(),
      path: vi.fn<ChatTransactionContext['turns']['path']>().mockResolvedValue([]),
      start: vi.fn<ChatTransactionContext['turns']['start']>().mockResolvedValue('turn'),
      finish: vi.fn<ChatTransactionContext['turns']['finish']>(),
    },
    recordActivity: vi.fn<ChatTransactionContext['recordActivity']>(),
  } satisfies ChatTransactionContext;
  const narrate = vi.fn<Narrator>();
  const dependencies: ChatServiceDependencies = {
    projects: { get: vi.fn<ChatServiceDependencies['projects']['get']>() },
    servicesForProject: () => context,
    withProjectTransaction: async (_projectId, work) => work(context),
    narrate,
  };
  const emit = vi.fn(async () => {});
  const service = new ChatService(dependencies);
  const run = () => service.run({
    operation: 'send', projectId, branchId: branch.id,
    expectedHeadTurnId: null, content: user.content,
  }, emit, new AbortController().signal);
  return { context, narrate, emit, run };
}

describe('chat orchestration without infrastructure', () => {
  it('does not reclassify a persistence failure as a generation failure', async () => {
    const { context, narrate, run } = setup();
    const error = new Error('Persistence unavailable.');
    narrate.mockResolvedValue('The door opens.');
    context.turns.finish.mockRejectedValue(error);

    await expect(run()).rejects.toBe(error);
    expect(narrate).toHaveBeenCalledOnce();
    expect(context.turns.finish).toHaveBeenCalledExactlyOnceWith(
      'turn', 'branch', expect.objectContaining({ status: 'completed' }), expect.any(Date),
    );
    expect(context.branches.advance).not.toHaveBeenCalled();
    expect(context.recordActivity).not.toHaveBeenCalled();
  });

  it('aborts on a context read failure before publishing or generating a turn', async () => {
    const { context, narrate, emit, run } = setup();
    const error = new Error('Invalid ancestry.');
    context.turns.path.mockRejectedValue(error);

    await expect(run()).rejects.toBe(error);
    expect(context.turns.start).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(narrate).not.toHaveBeenCalled();
    expect(context.turns.finish).not.toHaveBeenCalled();
  });
});
