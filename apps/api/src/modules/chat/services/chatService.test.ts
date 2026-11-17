import { describe, expect, it, vi } from 'vitest';
import type { AnalysisEnvelope, ChatBranch, Message, ProjectAgent } from '@choral-writer/shared';

import type { ChatServiceDependencies, ChatTransactionContext } from '../types/chat.types.js';
import type { Narrator } from '../types/narrator.types.js';
import { ChatService } from './chatService.js';

function setup() {
  const projectId = 'project';
  const branch: ChatBranch = {
    id: 'branch', projectId, name: 'Principale',
    sourceBranchId: null, forkTurnId: null, headTurnId: null,
    createdAt: new Date(),
  };
  const user: Message = {
    id: 'user', projectId, role: 'user', content: 'Open the door.',
    createdAt: new Date(),
  };
  const narrator: ProjectAgent = {
    agentId: 'narrator', versionId: 'narrator-version', phase: 'restitution', output: 'narrative',
    version: 1, name: 'Narrator', instructions: '',
  };
  const context = {
    project: { id: projectId, systemPrompt: 'Current prompt.' },
    projectAgents: [narrator],
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
  const analyze = vi.fn<ChatServiceDependencies['analyze']>().mockResolvedValue([]);
  const dependencies: ChatServiceDependencies = {
    projects: { get: vi.fn<ChatServiceDependencies['projects']['get']>() },
    servicesForProject: () => context,
    withProjectTransaction: async (_projectId, work) => work(context),
    analyze,
    narrate,
  };
  const emit = vi.fn(async () => {});
  const service = new ChatService(dependencies);
  const run = () => service.run({
    operation: 'send', projectId, branchId: branch.id,
    expectedHeadTurnId: null, content: user.content,
  }, emit, new AbortController().signal);
  return { context, analyze, narrate, emit, run };
}

describe('chat orchestration without infrastructure', () => {
  it('adds enabled narrator instructions to the project prompt', async () => {
    const { context, narrate, run } = setup();
    context.projectAgents[0]!.instructions = 'Write in a concise, playful tone.';
    narrate.mockResolvedValue('The door opens.');

    await run();

    expect(narrate).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'narrator',
      agentVersionId: 'narrator-version',
      systemPrompt: 'Current prompt.\n\nWrite in a concise, playful tone.',
      whiteboard: [],
    }));
  });

  it('passes validated analysis results to the narrator', async () => {
    const { context, analyze, narrate, run } = setup();
    context.projectAgents.push({
      agentId: 'analyst', versionId: 'analyst-version', phase: 'analysis', output: 'envelope',
      version: 1, name: 'Chaos', instructions: 'Find uncertainty.',
    });
    const whiteboard: AnalysisEnvelope[] = [{
      v: 1, agent: 'Chaos', summary: 'The door may be trapped.',
      items: [{ kind: 'observation', text: 'A wire is visible.', importance: 'NORMAL' }],
    }];
    analyze.mockResolvedValue(whiteboard);
    narrate.mockResolvedValue('The door opens carefully.');

    await run();

    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
      turnId: 'turn',
      agents: [expect.objectContaining({ name: 'Chaos', versionId: 'analyst-version' })],
    }));
    expect(narrate).toHaveBeenCalledWith(expect.objectContaining({ whiteboard }));
  });

  it('does not narrate when analysis fails', async () => {
    const { analyze, narrate, context, run } = setup();
    context.projectAgents.push({
      agentId: 'analyst', versionId: 'analyst-version', phase: 'analysis', output: 'envelope',
      version: 1, name: 'Chaos', instructions: 'Find uncertainty.',
    });
    analyze.mockRejectedValue(new AggregateError([new Error('Invalid analysis.')]));

    const result = await run();

    expect(result.status).toBe('failed');
    expect(narrate).not.toHaveBeenCalled();
    expect(context.turns.finish).toHaveBeenCalledWith(
      'turn', 'branch', expect.objectContaining({ status: 'failed' }), expect.any(Date),
    );
  });

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
