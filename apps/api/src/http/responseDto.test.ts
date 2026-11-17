import { afterEach, describe, expect, it } from 'vitest';
import {
  agentSchema, chatEventDtoSchema, chatHistorySchema, messageDtoSchema, projectSchema,
  type Agent, type ChatBranch, type ChatTurn, type Project,
} from '@choral-writer/shared';

import { buildApp } from '../app.js';
import { toMessageDto } from '../modules/chat/mappers/messageDto.js';
import { toChatBranchDto } from '../modules/chat/mappers/branchDto.js';
import { toProjectDto } from '../modules/projects/mappers/projectDto.js';
import { toAgentDto } from '../modules/agents/mappers/agentDto.js';
import { toChatEventDto } from '../modules/chat/mappers/eventDto.js';
import { toChatHistoryDto } from '../modules/chat/mappers/historyDto.js';
import { registerProjectRoutes } from '../modules/projects/routes/projectRoutes.js';
import { registerAgentRoutes } from '../modules/agents/routes/agentRoutes.js';
import { registerChatRoutes } from '../modules/chat/routes/chatRoutes.js';
import { ChatController } from '../modules/chat/controllers/chatController.js';
import { parseResponseDto } from './responseDto.js';

const message = {
  id: '019ad30c-19b0-7000-8000-000000000001',
  projectId: '019ad30c-19b0-7000-8000-000000000002',
  role: 'user' as const,
  content: 'Bonjour',
  createdAt: '2026-11-17T10:00:00.000Z',
};

describe('response DTO boundary', () => {
  const apps: ReturnType<typeof buildApp>[] = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

  it('only serializes declared fields, including inside streamed event DTOs', () => {
    const row = { ...message, createdAt: new Date(message.createdAt), internalField: 'private' };
    expect(toMessageDto(row)).toEqual(message);
    const event = {
      type: 'chat.turn.started' as const,
      turnId: message.id,
      branchId: message.projectId,
      operation: 'send' as const,
      message: row,
    };
    expect(parseResponseDto(chatEventDtoSchema, toChatEventDto(event))).toEqual({
      type: 'chat.turn.started',
      turnId: message.id,
      branchId: message.projectId,
      operation: 'send',
      message,
    });
  });

  it('reports an invalid server response as a masked 500, not a client validation error', async () => {
    const app = buildApp({
      appPassword: 'test',
      cookieSecret: 'test-signing-secret-with-thirty-two-characters',
      nodeEnv: 'test',
    });
    apps.push(app);
    app.get('/test-invalid-dto', () =>
      parseResponseDto(messageDtoSchema, { ...message, createdAt: 'invalid-server-date' }));

    const response = await app.inject('/test-invalid-dto');
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_SERVER_ERROR' } });
    expect(response.body).not.toContain('invalid-server-date');
  });

  it('projects rows into public project, branch and nested agent DTOs without leaking extra fields', () => {
    const at = new Date(message.createdAt);
    const project = {
      id: message.projectId, name: 'Projet', systemPrompt: '', defaultBranchId: null,
      createdAt: at, updatedAt: at, internalField: 'private',
    };
    expect(toProjectDto(project)).toEqual({
      id: project.id, name: 'Projet', systemPrompt: '', defaultBranchId: null,
      createdAt: message.createdAt, updatedAt: message.createdAt,
    });

    const branch = {
      id: message.id, projectId: project.id, name: 'Principale',
      sourceBranchId: null, forkTurnId: null, headTurnId: null, createdAt: at, internalField: 'private',
    };
    expect(toChatBranchDto(branch)).toEqual({
      id: branch.id, projectId: project.id, name: 'Principale', sourceBranchId: null,
      forkTurnId: null, headTurnId: null, createdAt: message.createdAt,
    });

    const agent = {
      id: message.id, phase: 'restitution' as const, output: 'narrative' as const,
      createdAt: at, internalField: 'private',
    };
    const version = {
      id: message.id, agentId: agent.id, version: 1, name: 'Narrateur',
      instructions: '', createdAt: at, internalField: 'private',
    };
    const usage = { id: project.id, name: project.name, versionId: version.id, agentId: agent.id, internalField: 'private' };
    expect(toAgentDto({ ...agent, versions: [version], projects: [usage] })).toEqual({
      id: agent.id, phase: 'restitution', output: 'narrative', createdAt: message.createdAt,
      versions: [{
        id: version.id, version: 1, name: 'Narrateur', instructions: '', createdAt: message.createdAt,
      }],
      projects: [{ id: project.id, name: project.name, versionId: version.id }],
    });
  });

  it('serializes nested history without mutating internal dates or exposing stored turn errors', () => {
    const at = new Date(message.createdAt);
    const history = {
      branch: {
        id: message.id, projectId: message.projectId, name: 'Principale',
        sourceBranchId: null, forkTurnId: null, headTurnId: message.id, createdAt: at,
      },
      turns: [{
        id: message.id, parentTurnId: null, originBranchId: message.id,
        retryOfTurnId: null, regeneratedFromTurnId: null,
        status: 'failed' as const, error: 'private-provider-diagnostic',
        userMessage: { ...message, createdAt: at }, assistantMessage: null,
      }],
    };
    const dto = toChatHistoryDto(history);
    expect(dto.branch.createdAt).toBe(message.createdAt);
    expect(dto.turns[0].userMessage.createdAt).toBe(message.createdAt);
    expect(dto.turns[0].assistantMessage).toBeNull();
    expect(JSON.stringify(dto)).not.toContain('private-provider-diagnostic');
    expect(dto.turns[0].error).toBe('La génération de ce tour a échoué.');
    expect(chatHistorySchema.parse(dto).turns[0].userMessage.createdAt).toEqual(at);
    expect(history.branch.createdAt).toBe(at);
    expect(history.turns[0].userMessage.createdAt).toBe(at);
    expect(history.turns[0].error).toBe('private-provider-diagnostic');
  });

  it('maps service models at REST and SSE boundaries, preserving dates and masking stored errors', async () => {
    const at = new Date(message.createdAt);
    const project: Project = {
      id: message.projectId, name: 'Projet', systemPrompt: '', defaultBranchId: message.id,
      createdAt: at, updatedAt: at,
    };
    const branch: ChatBranch = {
      id: message.id, projectId: project.id, name: 'Principale',
      sourceBranchId: null, forkTurnId: null, headTurnId: null, createdAt: at,
    };
    const userMessage = { ...message, createdAt: at };
    const turn: ChatTurn = {
      id: message.id, parentTurnId: null, originBranchId: branch.id,
      retryOfTurnId: null, regeneratedFromTurnId: null, status: 'failed',
      error: 'private-provider-diagnostic', userMessage, assistantMessage: null,
    };
    const agent: Agent = {
      id: message.id, phase: 'restitution', output: 'narrative', createdAt: at, projects: [],
      versions: [{ id: message.id, version: 1, name: 'Narrateur', instructions: '', createdAt: at }],
    };
    const app = buildApp({
      appPassword: 'test',
      cookieSecret: 'test-signing-secret-with-thirty-two-characters',
      nodeEnv: 'test',
    });
    apps.push(app);
    registerProjectRoutes(app, {
      list: async () => [project],
      get: async () => project,
      create: async () => project,
      update: async () => project,
      remove: async () => {},
    });
    registerAgentRoutes(app, {
      list: async () => [agent],
      create: async () => agent,
      publish: async () => agent,
      remove: async () => {},
      listForProject: async () => [],
      configure: async () => [],
    });
    registerChatRoutes(app, new ChatController({
      branches: async () => [branch],
      history: async () => ({ branch, turns: [turn] }),
      turn: async () => turn,
      run: async (_command, emit) => {
        await emit({
          type: 'chat.turn.started', branchId: branch.id,
          turnId: turn.id, operation: 'send', message: userMessage,
        });
        return { status: 'completed', branchId: branch.id, turnId: turn.id, message: userMessage };
      },
    }));
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'test' } });
    const headers = { cookie: login.cookies.map(({ name, value }) => `${name}=${value}`).join('; ') };
    const projectResponse = await app.inject({ url: `/api/projects/${project.id}`, headers });
    expect(projectResponse.statusCode).toBe(200);
    expect(projectResponse.json().createdAt).toBe(message.createdAt);
    expect(projectSchema.parse(projectResponse.json()).createdAt).toEqual(at);
    const agentResponse = await app.inject({ url: '/api/agents', headers });
    expect(agentResponse.statusCode).toBe(200);
    expect(agentSchema.array().parse(agentResponse.json())[0].versions[0].createdAt).toEqual(at);
    const historyResponse = await app.inject({
      url: `/api/projects/${project.id}/branches/${branch.id}/history`, headers,
    });
    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.body).not.toContain('private-provider-diagnostic');
    expect(chatHistorySchema.parse(historyResponse.json()).turns[0].userMessage.createdAt).toEqual(at);
    const streamResponse = await app.inject({
      method: 'POST', url: `/api/projects/${project.id}/branches/${branch.id}/turns`,
      headers, payload: { expectedHeadTurnId: null, content: 'Bonjour' },
    });
    expect(streamResponse.statusCode).toBe(200);
    const events = streamResponse.body.split('\n').filter((line) => line.startsWith('data: '))
      .map((line) => chatEventDtoSchema.parse(JSON.parse(line.slice(6))));
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'chat.turn.started', message: { createdAt: message.createdAt } });
    expect(events[1]).toMatchObject({ type: 'chat.turn.completed', message: { createdAt: message.createdAt } });
    expect(project.createdAt).toBe(at);
    expect(agent.versions[0].createdAt).toBe(at);
    expect(userMessage.createdAt).toBe(at);
    expect(turn.error).toBe('private-provider-diagnostic');
  });
});
