// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { projectInputSchema, type ChatEvent, type Message, type Project } from '@choral-writer/shared';

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
      <output data-testid="location">{location.pathname}</output>
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

describe('projects and chat screens', () => {
  const project: Project = {
    id: '019ad30c-19b0-7000-8000-000000000001',
    name: 'Mon histoire',
    systemPrompt: 'Tu es le narrateur.',
    createdAt: '2026-11-16T08:00:00.000Z',
    updatedAt: '2026-11-16T08:00:00.000Z',
  };

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

    await screen.findByText('Aucun projet pour le moment. Créez votre premier chatbot.');
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau projet' }));
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
    await screen.findByText('Aucun projet pour le moment. Créez votre premier chatbot.');
    expect(saved).toBeNull();
  });

  it('renders streamed text before completion and reloads the persisted conversation', async () => {
    let savedMessages: Message[] = [];
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === `/projects/${project.id}`) return respond(config, 200, project);
      if (config.url === `/projects/${project.id}/messages`) return respond(config, 200, savedMessages);
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
      emit({ type: 'chat.turn.started', turnId, message: user });
      emit({ type: 'chat.message.delta', delta: 'Bonjour' });
    });
    await screen.findByText('Bonjour');
    expect(screen.getByLabelText('Votre message').hasAttribute('disabled')).toBe(true);

    await act(async () => {
      savedMessages = [user, assistant];
      emit({ type: 'chat.message.delta', delta: ' Mara.' });
      emit({ type: 'chat.turn.completed', turnId, message: assistant });
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
});
