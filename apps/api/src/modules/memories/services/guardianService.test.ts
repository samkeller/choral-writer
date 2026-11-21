import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletion } from 'openai/resources/chat/completions';
import { emptyMemoryState, type ProjectAgent } from '@choral-writer/shared';
import { createCallLLM, type CallLLMInput, type LlmCallTrace } from '../../../llm/call-llm.js';
import { testProvider } from '../../../tests/support/callLLM.js';
import { GuardianService, type GuardianInput } from './guardianService.js';

const guardian: ProjectAgent = {
  agentId: '019ad30c-19b0-7000-8000-000000000001',
  versionId: '019ad30c-19b0-7000-8000-000000000002',
  phase: 'restitution', output: 'memory_proposals', version: 1, name: 'Gardien',
  instructions: 'Maintain useful memories.', memoryRead: { mode: 'all', tagIds: [] },
};

function setup(responses: string[]) {
  const create = vi.fn(async (): Promise<ChatCompletion> => {
    const content = responses.shift();
    if (content === undefined) throw new Error('Unexpected provider request.');
    return {
      id: 'test', object: 'chat.completion', model: 'test', created: 0,
      choices: [{ index: 0, finish_reason: 'stop', logprobs: null,
        message: { role: 'assistant', content, refusal: null } }],
    };
  });
  const insert = vi.fn<(trace: LlmCallTrace) => Promise<void>>().mockResolvedValue(undefined);
  const callLLM = createCallLLM({
    client: { chat: { completions: { create } } }, model: 'test',
    traces: { insert }, provider: testProvider,
  });
  const requests: CallLLMInput[] = [];
  const service = new GuardianService((input) => {
    requests.push(input);
    return callLLM(input);
  });
  const input: GuardianInput = {
    projectId: 'project',
    turnId: 'turn', executionId: 'run', agent: guardian, agents: [guardian],
    state: emptyMemoryState(), systemPrompt: 'Continue the story in prose.',
    prose: 'The door creaks.', signal: new AbortController().signal,
  };
  return { service, input, create, requests, insert };
}

describe('Guardian JSON task', () => {
  it.each([' \n '.repeat(100), '{"v":2,"proposals":[],"prose":"Continued story"}'])(
    'corrects an empty or narrative response once without replaying the story conversation',
    async (invalid) => {
      const { service, input, requests, insert } = setup([invalid, '{"v":2,"proposals":[],"tagSuggestions":[]}']);
      expect(await service.generate(input)).toEqual({ v: 2, proposals: [], tagSuggestions: [] });
      const first = requests[0]!;
      expect(first.messages).toHaveLength(2);
      expect(first.messages[0]!.content).not.toContain('Continue the story in prose.');
      expect(first.messages[1]!.content).toContain('"projectContext":"Continue the story in prose."');
      expect(first.messages[1]!.content).toContain('"prose":"The door creaks."');
      expect(first.messages[1]!.content).toContain('Return JSON only');
      expect(requests[1]!.messages.at(-1)?.content).toContain('previous attempt');
      expect(insert.mock.calls.map(([trace]) => trace.status)).toEqual(['error', 'success']);
      expect(insert.mock.calls[0]![0].response).toBe(invalid);
    },
  );

  it('surfaces repeated whitespace output rather than treating it as an empty proposal list', async () => {
    const { service, input, create, insert } = setup([' \n ', '\n\n']);
    await expect(service.generate(input)).rejects.toMatchObject({ code: 'LLM_EMPTY_RESPONSE' });
    expect(create).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls.map(([trace]) => trace.status)).toEqual(['error', 'error']);
  });
});
