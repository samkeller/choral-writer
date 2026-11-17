// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import {
  projectInputSchema, projectAgentsInputSchema, publishAgentVersionSchema,
  type Agent, type PublishAgentVersion, type ChatBranch, type ChatEvent, type ChatHistory, type ProjectAgent,
  type Message, type Project,
} from '@choral-writer/shared';

import { api, ClientApiError } from './api/client.js';
import { App } from './App.js';

const originalAdapter = api.defaults.adapter;
const adapter = vi.fn<AxiosAdapter>();

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  const response = { config, status, data, statusText: String(status), headers: {} };
  if (status >= 400) {
    throw new AxiosError('Request failed', undefined, config, undefined, response);
  }
  return response;
}

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location">{location.pathname}{location.search}</output>
      <button onClick={() => navigate(-1)}>Précédent</button>
    </>
  );
}

function renderApp(path: string) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[path]}>
        <App />
        <LocationProbe />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true, value: vi.fn(),
  });
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

beforeEach(() => {
  adapter.mockReset();
  api.defaults.adapter = adapter;
});

afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
});

describe('routing and authentication', () => {
  it('redirects an anonymous visitor, handles invalid credentials, and returns to the requested page', async () => {
    adapter.mockImplementation(async (config) => {
      if (config.url === '/login') {
        return respond(config, 401, { error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect password.', status: 401, source: 'application' } });
      }
      return respond(config, 401, { error: { code: 'UNAUTHORIZED', message: 'Authentication required.', status: 401, source: 'application' } });
    });

    renderApp('/projects');

    await screen.findByLabelText('Mot de passe');
    expect(screen.getByTestId('location').textContent).toBe('/login');
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByText('Incorrect password.');
    expect(screen.getByLabelText('Mot de passe')).toBeTruthy();

    adapter.mockImplementation(async (config) => {
      return respond(config, 200, config.url === '/projects' ? [] : { authenticated: true });
    });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByRole('heading', { name: 'Projets' });
    expect(screen.getByTestId('location').textContent).toBe('/projects');

    adapter.mockImplementation(async (config) => respond(config, 401, {
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.', status: 401, source: 'application' },
    }));
    await act(async () => {
      await expect(api.get('/restricted')).rejects.toBeInstanceOf(ClientApiError);
    });
    await screen.findByLabelText('Mot de passe');
    expect(screen.getByTestId('location').textContent).toBe('/login');
  });

  it('keeps server failures distinct from anonymous sessions and allows retrying', async () => {
    adapter.mockImplementation(async (config) => respond(config, 500, ''));
    renderApp('/agents');

    await screen.findByText('Connexion au serveur impossible');
    expect(screen.getByTestId('location').textContent).toBe('/agents');
    expect(screen.queryByLabelText('Mot de passe')).toBeNull();

    adapter.mockImplementation(async (config) => respond(config, 200, { authenticated: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await screen.findByRole('heading', { name: 'Agents' });
    expect(screen.getByTestId('location').textContent).toBe('/agents');
  });

  it('supports direct URLs and browser history, and displays logout errors', async () => {
    adapter.mockImplementation(async (config) => respond(config, 200, { authenticated: true }));
    renderApp('/traces');

    await screen.findByRole('heading', { name: 'Traces' });
    fireEvent.click(screen.getAllByRole('link', { name: 'Mémoires' })[0]);
    await screen.findByRole('heading', { name: 'Mémoires' });
    expect(screen.getByTestId('location').textContent).toBe('/memories');
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));
    await screen.findByRole('heading', { name: 'Traces' });
    expect(screen.getByTestId('location').textContent).toBe('/traces');

    adapter.mockImplementation(async (config) => respond(config, 500, {
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'Logout unavailable.', status: 500, source: 'application' },
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await screen.findByText('Logout unavailable.');
    expect(screen.getByTestId('location').textContent).toBe('/traces');

    adapter.mockImplementation(async (config) => respond(config, 200, { authenticated: false }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Se déconnecter' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await screen.findByLabelText('Mot de passe');
    expect(screen.getByTestId('location').textContent).toBe('/login');
  });
});

describe('agent configuration', () => {
  it('publishes a new immutable version from the global library', async () => {
    const project: Project = {
      id: '019ad30c-19b0-7000-8000-000000000101',
      defaultBranchId: null,
      name: 'Mon histoire',
      systemPrompt: 'Tu es le narrateur.',
      createdAt: '2026-11-16T08:00:00.000Z',
      updatedAt: '2026-11-16T08:00:00.000Z',
    };
    let saved: Agent = {
      id: '019ad30c-19b0-7000-8000-000000000102',
      phase: 'restitution',
      output: 'narrative',
      createdAt: project.createdAt,
      versions: [{
        id: '019ad30c-19b0-7000-8000-000000000103', version: 1, name: 'Narrateur',
        instructions: '', createdAt: project.createdAt,
      }],
      projects: [],
    };
    let savedInput: PublishAgentVersion | null = null;
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === '/projects') return respond(config, 200, [project]);
      if (config.url === '/agents' && config.method === 'get') {
        return respond(config, 200, [saved]);
      }
      if (config.url === `/agents/${saved.id}/versions` && config.method === 'post') {
        savedInput = publishAgentVersionSchema.parse(JSON.parse(String(config.data)));
        saved = { ...saved, versions: [{
          ...saved.versions[0]!, id: '019ad30c-19b0-7000-8000-000000000104',
          name: savedInput.name, instructions: savedInput.instructions, version: 2,
        }, ...saved.versions] };
        return respond(config, 200, saved);
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    });

    renderApp('/agents');
    await screen.findByRole('heading', { name: 'Narrateur' });
    fireEvent.click(screen.getByRole('button', { name: /Narrateur.*v1/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle version' }));
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'Raconte avec un ton léger.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publier la version' }));

    await waitFor(() => expect(savedInput?.instructions).toBe('Raconte avec un ton léger.'));
    expect(savedInput).toMatchObject({ expectedVersion: 1 });
    expect(saved.versions[1]?.instructions).toBe('');
  });
});

describe('projects and chat screens', () => {
  const project: Project = {
    id: '019ad30c-19b0-7000-8000-000000000001',
    defaultBranchId: '019ad30c-19b0-7000-8000-000000000005',
    name: 'Mon histoire',
    systemPrompt: 'Tu es le narrateur.',
    createdAt: '2026-11-16T08:00:00.000Z',
    updatedAt: '2026-11-16T08:00:00.000Z',
  };
  const branch: ChatBranch = {
    id: project.defaultBranchId!, projectId: project.id, name: 'Principale',
    sourceBranchId: null, forkTurnId: null, headTurnId: null, createdAt: project.createdAt,
  };

  function existingChat() {
    const user: Message = {
      id: '019ad30c-19b0-7000-8000-000000000002', projectId: project.id,
      role: 'user', content: 'Ouvre la porte.', createdAt: project.createdAt,
    };
    const assistant: Message = {
      ...user, id: '019ad30c-19b0-7000-8000-000000000003',
      role: 'assistant', content: 'Réponse originale.',
    };
    const turnId = '019ad30c-19b0-7000-8000-000000000004';
    const original: ChatHistory = {
      branch: { ...branch, headTurnId: turnId },
      turns: [{
        id: turnId, parentTurnId: null, originBranchId: branch.id,
        retryOfTurnId: null, regeneratedFromTurnId: null, status: 'completed',
        error: null, userMessage: user, assistantMessage: assistant,
      }],
    };
    const histories = new Map([[branch.id, original]]);
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === `/projects/${project.id}`) return respond(config, 200, project);
      if (config.url === `/projects/${project.id}/branches`) {
        return respond(config, 200, [...histories.values()].map((item) => item.branch));
      }
      const selected = [...histories.values()].find((item) =>
        config.url === `/projects/${project.id}/branches/${item.branch.id}/history`);
      if (selected) return respond(config, 200, selected);
      throw new Error(`Unexpected request: ${config.url}`);
    });
    const alternativeId = '019ad30c-19b0-7000-8000-000000000006';
    const newTurnId = '019ad30c-19b0-7000-8000-000000000007';
    function alternative(status: 'completed' | 'failed'): ChatHistory {
      return {
        branch: {
          ...branch, id: alternativeId, headTurnId: newTurnId,
          name: 'Alternative 1', sourceBranchId: branch.id,
        },
        turns: [{
          ...original.turns[0], id: newTurnId, originBranchId: alternativeId,
          regeneratedFromTurnId: turnId, status,
          error: status === 'failed' ? 'La génération de ce tour a échoué.' : null,
          assistantMessage: status === 'failed' ? null : {
            ...assistant, id: '019ad30c-19b0-7000-8000-000000000008', content: 'Réponse alternative.',
          },
        }],
      };
    }
    return { original, histories, alternativeId, newTurnId, alternative, user };
  }

  it('shows pinned agents in project setup and explicitly upgrades only the chosen version', async () => {
    const { original } = existingChat();
    const chatAdapter = adapter.getMockImplementation()!;
    const narrative: Agent = {
      id: '019ad30c-19b0-7000-8000-000000000201', phase: 'restitution', output: 'narrative',
      createdAt: project.createdAt, projects: [{ id: project.id, name: project.name,
        versionId: '019ad30c-19b0-7000-8000-000000000202' }],
      versions: [2, 1].map((version) => ({
        id: `019ad30c-19b0-7000-8000-00000000020${version + 1}`,
        version, name: 'Narrateur', instructions: `Ton v${version}`, createdAt: project.createdAt,
      })),
    };
    const guardian: Agent = {
      id: '019ad30c-19b0-7000-8000-000000000204', phase: 'restitution', output: 'memory_proposals',
      createdAt: project.createdAt, projects: [],
      versions: [{ id: '019ad30c-19b0-7000-8000-000000000205', version: 1,
        name: 'Gardien', instructions: '', createdAt: project.createdAt }],
    };
    const oldVersion = narrative.versions[1]!;
    const memoryVersion = guardian.versions[0]!;
    let assignments: ProjectAgent[] = [
      { agentId: narrative.id, versionId: oldVersion.id, phase: narrative.phase, output: narrative.output,
        name: oldVersion.name, instructions: oldVersion.instructions, version: 1 },
      { agentId: guardian.id, versionId: memoryVersion.id, phase: guardian.phase, output: guardian.output,
        name: memoryVersion.name, instructions: memoryVersion.instructions, version: 1 },
    ];
    let writes = 0;
    adapter.mockImplementation(async (config) => {
      if (config.url === '/agents') return respond(config, 200, [narrative, guardian]);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/history`) {
        return respond(config, 200, { branch: { ...original.branch, headTurnId: null }, turns: [] });
      }
      if (config.url === `/projects/${project.id}/agents`) {
        if (config.method === 'put') {
          writes++;
          const input = projectAgentsInputSchema.parse(JSON.parse(String(config.data)));
          assignments = input.agents.map((selection) => {
            const agent = [narrative, guardian].find((entry) => entry.id === selection.agentId)!;
            const version = agent.versions.find((entry) => entry.id === selection.versionId)!;
            return { ...selection, phase: agent.phase, output: agent.output, version: version.version,
              name: version.name, instructions: version.instructions };
          });
        }
        return respond(config, 200, assignments);
      }
      return chatAdapter(config);
    });

    renderApp(`/projects/${project.id}?setup=agents`);
    const responseSelect = await screen.findByLabelText('Réponse utilisateur · Narrateur', { selector: 'input' });
    await waitFor(() => expect(responseSelect.getAttribute('value')).toBe('Narrateur · v1'));
    expect(writes).toBe(0);
    fireEvent.click(responseSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Narrateur · v2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la configuration' }));
    await screen.findByText('Configuration enregistrée. Elle sera utilisée au prochain tour.');
    expect(writes).toBe(1);
    expect(assignments.find((entry) => entry.output === 'narrative')?.version).toBe(2);
    expect(assignments.find((entry) => entry.output === 'memory_proposals')?.versionId).toBe(memoryVersion.id);
  });

  it('creates, edits, and deletes a project through the forms', async () => {
    let saved: Project | null = null;
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === '/projects' && config.method === 'get') {
        return respond(config, 200, saved ? [saved] : []);
      }
      if (config.method === 'post' || config.method === 'put') {
        saved = { ...project, ...projectInputSchema.parse(JSON.parse(String(config.data))) };
        return respond(config, config.method === 'post' ? 201 : 200, saved);
      }
      if (config.method === 'delete') {
        saved = null;
        return respond(config, 204, undefined);
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    });
    renderApp('/projects');

    await screen.findByText('Aucun projet pour le moment.');
    fireEvent.click(screen.getByRole('button', { name: 'Créer un projet' }));
    fireEvent.change(screen.getByLabelText('Nom du projet', { exact: false }), { target: { value: 'Mon histoire' } });
    fireEvent.change(screen.getByLabelText('Prompt système'), { target: { value: 'Tu es le narrateur.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByRole('heading', { name: 'Mon histoire' });

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Nom du projet', { exact: false }), { target: { value: 'Mon nouveau monde' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByRole('heading', { name: 'Mon nouveau monde' });
    expect(saved).toMatchObject({ name: 'Mon nouveau monde', systemPrompt: 'Tu es le narrateur.' });

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
    await screen.findByText('Aucun projet pour le moment.');
    expect(saved).toBeNull();
  });

  it('renders streamed text before completion and reloads the persisted conversation', async () => {
    let savedHistory: ChatHistory = { branch, turns: [] };
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === `/projects/${project.id}`) return respond(config, 200, project);
      if (config.url === `/projects/${project.id}/branches`) return respond(config, 200, [savedHistory.branch]);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/history`) return respond(config, 200, savedHistory);
      throw new Error(`Unexpected request: ${config.url}`);
    });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const user: Message = {
      id: '019ad30c-19b0-7000-8000-000000000002', projectId: project.id,
      role: 'user', content: 'Ouvre la porte.', createdAt: project.createdAt,
    };
    const assistant: Message = {
      ...user, id: '019ad30c-19b0-7000-8000-000000000003', role: 'assistant', content: 'Bonjour Mara.',
    };
    const turnId = '019ad30c-19b0-7000-8000-000000000004';
    const emit = (event: ChatEvent) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    const view = renderApp(`/projects/${project.id}`);

    await screen.findByRole('heading', { name: project.name });
    fireEvent.change(screen.getByLabelText('Votre message'), { target: { value: user.content } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      emit({ type: 'chat.turn.started', turnId, branchId: branch.id, operation: 'send', message: user });
      emit({ type: 'chat.message.delta', delta: 'Bonjour' });
    });
    await screen.findByText('Bonjour');
    expect(screen.getByLabelText('Votre message').hasAttribute('disabled')).toBe(true);

    await act(async () => {
      savedHistory = {
        branch: { ...branch, headTurnId: turnId },
        turns: [{
          id: turnId, parentTurnId: null, originBranchId: branch.id,
          retryOfTurnId: null, regeneratedFromTurnId: null, status: 'completed',
          error: null, userMessage: user, assistantMessage: assistant,
        }],
      };
      emit({ type: 'chat.message.delta', delta: ' Mara.' });
      emit({ type: 'chat.turn.completed', branchId: branch.id, turnId, message: assistant });
      controller.close();
    });
    await waitFor(() => expect(screen.getByLabelText('Votre message').hasAttribute('disabled')).toBe(false));
    expect(screen.getAllByText('Bonjour Mara.')).toHaveLength(1);
    view.unmount();
    renderApp(`/projects/${project.id}`);
    await screen.findByText('Bonjour Mara.');
    expect(screen.getByText('Ouvre la porte.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the original during regeneration, selects the successful branch and restores it from the URL', async () => {
    const fixture = existingChat();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const emit = (event: ChatEvent) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    const view = renderApp(`/projects/${project.id}`);
    await screen.findByText('Réponse originale.');
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer la réponse' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/projects/${project.id}/branches/${branch.id}/turns/${fixture.original.turns[0].id}/regenerate`,
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      expectedHeadTurnId: fixture.original.turns[0].id,
    });
    await act(async () => {
      emit({
        type: 'chat.turn.started', operation: 'regenerate', branchId: fixture.alternativeId,
        turnId: fixture.newTurnId, message: fixture.user,
      });
      emit({ type: 'chat.message.delta', delta: 'Une autre voie…' });
    });
    await screen.findByText('Une autre voie…');
    expect(screen.getByText('Réponse originale.')).toBeTruthy();
    expect(screen.getAllByText(fixture.user.content)).toHaveLength(1);
    expect(screen.getByLabelText('Branche de conversation', { selector: 'input' }).hasAttribute('disabled')).toBe(true);

    await act(async () => {
      const alternative = fixture.alternative('completed');
      fixture.histories.set(fixture.alternativeId, alternative);
      emit({
        type: 'chat.turn.completed', branchId: fixture.alternativeId, turnId: fixture.newTurnId,
        message: alternative.turns[0].assistantMessage!,
      });
      controller.close();
    });
    await screen.findByText('Réponse alternative.');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain(`branch=${fixture.alternativeId}`));
    expect(screen.queryByText('Réponse originale.')).toBeNull();
    view.unmount();
    renderApp(`/projects/${project.id}?branch=${fixture.alternativeId}`);
    await screen.findByText('Réponse alternative.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Branche de conversation', { selector: 'input' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Principale' }));
    await screen.findByText('Réponse originale.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed alternative accessible and retries without duplicating the user message', async () => {
    const fixture = existingChat();
    const failure = {
      code: 'LLM_ERROR', message: 'Échec simulé.', status: 502, source: 'llm',
    } as const;
    const fetchMock = vi.fn().mockImplementation(async () => {
      fixture.histories.set(fixture.alternativeId, fixture.alternative('failed'));
      return new Response(`data: ${JSON.stringify({
        type: 'chat.turn.failed', branchId: fixture.alternativeId,
        turnId: fixture.newTurnId, error: failure,
      })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp(`/projects/${project.id}`);
    await screen.findByText('Réponse originale.');
    fireEvent.click(screen.getByRole('button', { name: 'Régénérer la réponse' }));
    await screen.findByText('Échec simulé.');
    expect(screen.getByText('Réponse originale.')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Ouvrir l’alternative échouée' }));
    await screen.findByRole('button', { name: 'Réessayer la réponse' });
    expect(screen.getAllByText(fixture.user.content)).toHaveLength(1);
    fetchMock.mockImplementation(async () => {
      const successful = fixture.alternative('completed');
      fixture.histories.set(fixture.alternativeId, successful);
      return new Response(`data: ${JSON.stringify({
        type: 'chat.turn.completed', branchId: fixture.alternativeId,
        turnId: fixture.newTurnId, message: successful.turns[0].assistantMessage,
      })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer la réponse' }));
    await screen.findByText('Réponse alternative.');
    expect(fetchMock.mock.calls[1][0]).toContain(`/turns/${fixture.newTurnId}/retry`);
    expect(screen.getAllByText(fixture.user.content)).toHaveLength(1);
  });
});
