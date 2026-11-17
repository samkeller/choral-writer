import { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, ClientApiError, getErrorMessage, sessionEvents } from './client';
import { createProject, getProject, listProjects, updateProject } from './projects/projectsApi';
import { createAgent, listAgents, publishAgentVersion } from './agents/agentsApi';
import { getBranches, getChatHistory, getChatTurn } from './chat/chatApi';
import { getSession, login, logout } from './auth/authApi';

const timestamp = '2026-11-17T10:00:00.000Z';
const id = '019ad30c-19b0-7000-8000-000000000001';
const project = { id, name: 'Projet', systemPrompt: '', defaultBranchId: null, createdAt: timestamp, updatedAt: timestamp };
const agent = {
  id, phase: 'restitution' as const, output: 'narrative' as const, createdAt: timestamp, projects: [],
  versions: [{ id, version: 1, name: 'Narrateur', instructions: '', createdAt: timestamp }],
};
const branch = {
  id, projectId: id, name: 'Principale', sourceBranchId: null, forkTurnId: null, headTurnId: null, createdAt: timestamp,
};
const message = { id, projectId: id, role: 'user', content: 'Bonjour', createdAt: timestamp };
const turn = {
  id, parentTurnId: null, originBranchId: id, retryOfTurnId: null, regeneratedFromTurnId: null,
  status: 'completed', error: null, userMessage: message, assistantMessage: { ...message, role: 'assistant' },
};

function respondWith(data: unknown) {
  api.defaults.adapter = async (config) => ({
    config, status: 200, statusText: 'OK', headers: {}, data,
  });
}

const originalAdapter = api.defaults.adapter;
afterEach(() => { api.defaults.adapter = originalAdapter; });

describe('parsed REST responses', () => {
  it('provides Date values for project queries and mutations', async () => {
    respondWith(project);
    const input = { name: project.name, systemPrompt: project.systemPrompt };
    for (const parsed of [await getProject(id), await createProject(input), await updateProject(id, input)]) {
      expect(parsed.createdAt).toEqual(new Date(timestamp));
      expect(parsed.updatedAt.getTime()).toBe(Date.parse(timestamp));
    }
    respondWith([project]);
    expect((await listProjects())[0].updatedAt).toEqual(new Date(timestamp));
  });

  it('parses nested agent version dates on queries, creation and publication', async () => {
    respondWith(agent);
    const input = { phase: agent.phase, output: agent.output, name: 'Narrateur', instructions: '' };
    for (const parsed of [
      await createAgent(input),
      await publishAgentVersion(id, { name: input.name, instructions: input.instructions, expectedVersion: 1 }),
    ]) {
      expect(parsed.createdAt).toEqual(new Date(timestamp));
      expect(parsed.versions[0].createdAt.getTime()).toBe(Date.parse(timestamp));
    }
    respondWith([agent]);
    expect((await listAgents())[0].versions[0].createdAt).toEqual(new Date(timestamp));
  });

  it('parses dates throughout branch, history and individual turn responses', async () => {
    respondWith([branch]);
    expect((await getBranches(id))[0].createdAt).toEqual(new Date(timestamp));
    respondWith({ branch, turns: [turn, { ...turn, assistantMessage: null }] });
    const history = await getChatHistory(id, id);
    expect(history.branch.createdAt).toEqual(new Date(timestamp));
    expect(history.turns[0].userMessage.createdAt).toEqual(new Date(timestamp));
    expect(history.turns[0].assistantMessage?.createdAt.getTime()).toBe(Date.parse(timestamp));
    expect(history.turns[1].assistantMessage).toBeNull();
    respondWith(turn);
    expect((await getChatTurn(id, id)).userMessage.createdAt).toEqual(new Date(timestamp));
  });

  it.each([null, 1794909600000, 'not-a-date', '2026-02-30T10:00:00.000Z'])(
    'rejects malformed or non-ISO dates instead of coercing %s',
    async (createdAt) => {
      respondWith({ ...project, createdAt });
      await expect(getProject(id)).rejects.toThrow();
      respondWith([{ ...agent, versions: [{ ...agent.versions[0], createdAt }] }]);
      await expect(listAgents()).rejects.toThrow();
      respondWith({ branch, turns: [{ ...turn, userMessage: { ...message, createdAt } }] });
      await expect(getChatHistory(id, id)).rejects.toThrow();
    },
  );

  it('validates logout responses as well as login and session responses', async () => {
    respondWith({ authenticated: true });
    expect(await login({ password: 'test' })).toEqual({ authenticated: true });
    expect(await getSession()).toEqual({ authenticated: true });
    await expect(logout()).rejects.toThrow();
    respondWith({ authenticated: false });
    expect(await logout()).toEqual({ authenticated: false });
    await expect(getSession()).rejects.toThrow();
  });
});

describe('REST public errors', () => {
  it('preserves the typed public contract and renders a provider request reference generically', async () => {
    const adapter: AxiosAdapter = async (config) => {
      throw new AxiosError('Request failed', undefined, config, undefined, {
        config, status: 402, statusText: '', headers: {},
        data: {
          error: {
            code: 'LLM_INSUFFICIENT_BALANCE', message: 'Insufficient Balance',
            status: 402, source: 'llm', requestId: 'provider-request',
          },
        },
      });
    };
    api.defaults.adapter = adapter;

    await expect(api.get('/any-feature')).rejects.toMatchObject({
      message: 'Insufficient Balance',
      details: { status: 402, source: 'llm', code: 'LLM_INSUFFICIENT_BALANCE', requestId: 'provider-request' },
    });
    const error = new ClientApiError({
      status: 402, source: 'llm', code: 'LLM_INSUFFICIENT_BALANCE',
      message: 'Insufficient Balance', requestId: 'provider-request',
    });
    expect(getErrorMessage(error)).toBe('Insufficient Balance (référence : provider-request)');
  });

  it.each(['application', 'llm'])('only expires the application session for its own 401 (%s)', async (source) => {
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Request failed', undefined, config, undefined, {
        config, status: 401, statusText: '', headers: {},
        data: { error: { code: 'AUTH_ERROR', message: 'Authentication failed', status: 401, source } },
      });
    };
    const expired = vi.fn();
    sessionEvents.addEventListener('unauthorized', expired);
    try {
      await expect(api.get('/any-feature')).rejects.toBeInstanceOf(ClientApiError);
      expect(expired).toHaveBeenCalledTimes(source === 'application' ? 1 : 0);
    } finally {
      sessionEvents.removeEventListener('unauthorized', expired);
    }
  });
});
