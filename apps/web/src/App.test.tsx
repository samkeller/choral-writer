// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import {
  agentInputSchema, projectInputSchema, projectAgentsInputSchema, publishAgentVersionSchema,
  type AgentDto, type PublishAgentVersion, type ChatBranchDto,
  type ChatEventDto, type ChatHistoryDto, type ProjectAgent,
  type MessageDto, type ProjectDto, type TraceCallDetail, type TurnMetrics, type TurnTraceSummary,
  type ProjectAgentsInput,
  memoryMutationSchema, type MemoryView, type MemoryResult,
} from '@choral-writer/shared';


import { api, ClientApiError } from './api/client';
import { ENTRY_CSV_TEMPLATE, TAG_CSV_TEMPLATE } from './api/memories/memoryCsv';
import { App } from './App';
import { cssVariablesResolver, theme } from './theme/theme';

const originalAdapter = api.defaults.adapter;
const adapter = vi.fn<AxiosAdapter>();

// jsdom n'implémente pas encore Blob#text, utilisé pour lire les fichiers importés.
if (typeof Blob.prototype.text !== 'function') {
  Object.defineProperty(Blob.prototype, 'text', {
    configurable: true,
    value(this: Blob) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    },
  });
}

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
    <MantineProvider env="test" forceColorScheme="dark" theme={theme} cssVariablesResolver={cssVariablesResolver}>
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
    await screen.findByRole('heading', { name: 'Projets' }, { timeout: 5000 });
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

  it('treats the removed global traces route as not found and displays logout errors', async () => {
    adapter.mockImplementation(async (config) => respond(config, 200, { authenticated: true }));
    renderApp('/traces');

    await screen.findByRole('heading', { name: 'Page introuvable' });
    expect(screen.queryByRole('link', { name: 'Traces' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Mémoires' })).toBeNull();

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
    const project: ProjectDto = {
      id: '019ad30c-19b0-7000-8000-000000000101',
      defaultBranchId: null,
      name: 'Mon histoire',
      systemPrompt: 'Tu es le narrateur.',
      createdAt: '2026-11-16T08:00:00.000Z',
      updatedAt: '2026-11-16T08:00:00.000Z',
    };
    let saved: AgentDto = {
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
    fireEvent.click(screen.getByRole('button', { name: 'Consulter Narrateur' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvelle version' }));
    fireEvent.change(screen.getByLabelText('Instructions'), {
      target: { value: 'Raconte avec un ton léger.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publier la version' }));

    await waitFor(() => expect(savedInput?.instructions).toBe('Raconte avec un ton léger.'));
    expect(savedInput).toMatchObject({ expectedVersion: 1 });
    expect(saved.versions[1]?.instructions).toBe('');
    await screen.findByText('Raconte avec un ton léger.');
    expect(screen.getByRole('button', { name: 'Réduire Narrateur' }).getAttribute('aria-expanded')).toBe('true');
  });

  const createdAt = '2026-11-16T08:00:00.000Z';
  const narrator: AgentDto = {
    id: '019ad30c-19b0-7000-8000-000000000301', phase: 'restitution', output: 'narrative', createdAt,
    versions: [{
      id: '019ad30c-19b0-7000-8000-000000000302', version: 2, name: 'Narrateur',
      instructions: 'Instructions actuelles.', createdAt,
    }, {
      id: '019ad30c-19b0-7000-8000-000000000303', version: 1, name: 'Ancienne voix',
      instructions: 'Instructions historiques.', createdAt,
    }],
    projects: [{
      id: '019ad30c-19b0-7000-8000-000000000304', name: 'Récit historique',
      versionId: '019ad30c-19b0-7000-8000-000000000303',
    }],
  };
  const observer: AgentDto = {
    ...narrator, id: '019ad30c-19b0-7000-8000-000000000305', phase: 'analysis', output: 'envelope',
    versions: [{ ...narrator.versions[0]!, id: '019ad30c-19b0-7000-8000-000000000306', name: 'Observateur' }],
    projects: [],
  };

  function mockLibrary(agents: AgentDto[]) {
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === '/agents') return respond(config, 200, agents);
      if (config.url === '/projects') return respond(config, 200, []);
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    });
  }

  it('consults historical versions inline and keeps agent sections independent', async () => {
    mockLibrary([narrator, observer]);
    renderApp('/agents');
    const consult = await screen.findByRole('button', { name: 'Consulter Narrateur' });
    expect(consult.getAttribute('aria-expanded')).toBe('false');
    fireEvent.focus(consult);
    await screen.findByRole('tooltip', { name: 'Consulter Narrateur' });
    fireEvent.blur(consult);
    fireEvent.click(consult);

    const details = screen.getByRole('region', { name: 'Narrateur' });
    expect(details.id).toBe(consult.getAttribute('aria-controls'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(details).getByText('Cette version n’est liée à aucun projet.')).toBeTruthy();
    fireEvent.click(within(details).getByLabelText('Version consultée', { selector: 'input' }));
    fireEvent.click(await screen.findByRole('option', { name: /v1 · Ancienne voix/ }));
    expect(within(details).getByText('Instructions historiques.')).toBeTruthy();
    expect(within(details).getByRole('link', { name: 'Configurer Récit historique' }).getAttribute('href'))
      .toContain(`/projects/${narrator.projects[0]!.id}?setup=agents`);

    fireEvent.click(screen.getByRole('button', { name: 'Consulter Observateur' }));
    expect(screen.getByRole('region', { name: 'Narrateur' })).toBeTruthy();
    expect(within(details).getByText('Instructions historiques.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Observateur' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réduire Observateur' }));
    expect(screen.queryByRole('region', { name: 'Observateur' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Consulter Observateur' }).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('region', { name: 'Narrateur' })).toBeTruthy();
  });

  it('combines phase and historical-name filters and offers a reset', async () => {
    mockLibrary([narrator, observer]);
    renderApp('/agents');
    await screen.findByRole('heading', { name: 'Narrateur' });
    fireEvent.change(screen.getByLabelText('Rechercher un agent'), { target: { value: 'ancienne' } });
    expect(screen.getByRole('heading', { name: 'Narrateur' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Observateur' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filtrer par phase' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Analyse' }));
    expect(within(screen.getByRole('button', { name: 'Filtrer par phase' })).getByText('Analyse')).toBeTruthy();
    expect(screen.getByText('Aucun agent ne correspond à cette recherche.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    expect(screen.getByRole('heading', { name: 'Narrateur' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Observateur' })).toBeTruthy();
  });

  it('reveals a newly created agent even when the previous filters would hide it', async () => {
    let agents = [narrator];
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === '/projects') return respond(config, 200, []);
      if (config.url === '/agents' && config.method === 'get') return respond(config, 200, agents);
      if (config.url === '/agents' && config.method === 'post') {
        const input = agentInputSchema.parse(JSON.parse(String(config.data)));
        agents = [...agents, { ...observer, ...input, versions: [{
          ...observer.versions[0]!, name: input.name, instructions: input.instructions,
        }] }];
        return respond(config, 201, agents[1]);
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    });

    renderApp('/agents');
    await screen.findByRole('heading', { name: 'Narrateur' });
    fireEvent.change(screen.getByLabelText('Rechercher un agent'), { target: { value: 'introuvable' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nouvel agent' }));
    fireEvent.change(screen.getByLabelText('Nom', { exact: false, selector: 'input' }), { target: { value: 'Observateur' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’agent' }));
    await screen.findByRole('region', { name: 'Observateur' });
    expect(screen.getByLabelText('Rechercher un agent').getAttribute('value')).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('uses phase tags in output choices and updates the selected agent phase', async () => {
    mockLibrary([]);
    renderApp('/agents');
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvel agent' }));
    const dialog = screen.getByRole('dialog');
    const phase = within(dialog).getByRole('status', { name: 'Phase de l’agent' });
    expect(phase.textContent).toBe('Analyse');
    fireEvent.click(within(dialog).getByLabelText('Contrat de sortie', { selector: 'input' }));
    const narrative = await screen.findByRole('option', { name: /Restitution Réponse utilisateur/ });
    expect(within(narrative).getByText('Restitution')).toBeTruthy();
    fireEvent.click(narrative);
    expect(phase.textContent).toBe('Restitution');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps deletion errors visible and removes the agent only after success', async () => {
    let agents = [narrator];
    let attempts = 0;
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === '/projects') return respond(config, 200, []);
      if (config.url === '/agents') return respond(config, 200, agents);
      if (config.url === `/agents/${narrator.id}` && config.method === 'delete') {
        attempts++;
        if (attempts === 1) return respond(config, 409, {
          error: { code: 'AGENT_IN_USE', message: 'Cet agent est utilisé par un projet.', status: 409, source: 'application' },
        });
        agents = [];
        return respond(config, 204, undefined);
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    });
    renderApp('/agents');
    fireEvent.click(await screen.findByRole('button', { name: 'Consulter Narrateur' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer l’agent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
    await screen.findByText('Cet agent est utilisé par un projet.');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('region', { name: 'Narrateur' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer l’agent' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));
    await screen.findByText('Votre bibliothèque est encore vide.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(attempts).toBe(2);
  });
});

describe('projects and chat screens', () => {
  const project: ProjectDto = {
    id: '019ad30c-19b0-7000-8000-000000000001',
    defaultBranchId: '019ad30c-19b0-7000-8000-000000000005',
    name: 'Mon histoire',
    systemPrompt: 'Tu es le narrateur.',
    createdAt: '2026-11-16T08:00:00.000Z',
    updatedAt: '2026-11-16T08:00:00.000Z',
  };
  const branch: ChatBranchDto = {
    id: project.defaultBranchId!, projectId: project.id, name: 'Principale',
    sourceBranchId: null, forkTurnId: null, headTurnId: null, createdAt: project.createdAt,
  };

  it('saves project settings from the shared toolbar without losing edits across sections or an error', async () => {
    let saved = project;
    let attempts = 0;
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === `/projects/${project.id}`) {
        if (config.method === 'put') {
          attempts++;
          const input = projectInputSchema.parse(JSON.parse(String(config.data)));
          if (attempts === 1) return respond(config, 409, {
            error: { code: 'PROJECT_UPDATE_FAILED', message: 'Enregistrement indisponible.', status: 409, source: 'application' },
          });
          saved = { ...saved, ...input };
        }
        return respond(config, 200, saved);
      }
      if (config.url === '/agents' || config.url === `/projects/${project.id}/agents`) return respond(config, 200, []);
      if (config.url === `/projects/${project.id}/branches`) return respond(config, 200, [branch]);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/history`) return respond(config, 200, { branch, turns: [] });
      if (config.url === `/projects/${project.id}/branches/${branch.id}/memories`) return respond(config, 200, {
        projectId: project.id, branchId: branch.id, headTurnId: null, revisionId: null, catalogRevisionId: null,
        enabled: false, state: { v: 2, tags: [], entries: [] },
      });
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    });
    renderApp(`/projects/${project.id}?tab=config`);
    fireEvent.change(await screen.findByRole('textbox', { name: /Nom du projet/ }), { target: { value: 'Le nouveau monde' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Prompt système' }), { target: { value: 'Instructions corrigées' } });
    const navigation = within(screen.getByRole('navigation', { name: 'Sections de configuration' }));
    fireEvent.click(navigation.getByRole('button', { name: 'Agents' }));
    expect(await screen.findByRole('button', { name: 'Enregistrer l’équipe' })).toBeTruthy();
    fireEvent.click(navigation.getByRole('button', { name: 'Mémoire' }));
    expect(await screen.findByRole('button', { name: 'Proposer la configuration mémoire' })).toBeTruthy();
    fireEvent.click(navigation.getByRole('button', { name: 'Projet' }));
    expect((screen.getByRole('textbox', { name: /Nom du projet/ }) as HTMLInputElement).value).toBe('Le nouveau monde');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Enregistrement indisponible.');
    expect((screen.getByRole('textbox', { name: 'Prompt système' }) as HTMLTextAreaElement).value).toBe('Instructions corrigées');
    expect(saved).toBe(project);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByRole('heading', { name: 'Le nouveau monde' });
    expect(saved).toMatchObject({ name: 'Le nouveau monde', systemPrompt: 'Instructions corrigées' });
    expect(attempts).toBe(2);
    expect(screen.getByTestId('location').textContent).toBe(`/projects/${project.id}?tab=config`);
  });

  it('preserves a memory edit through a conflict and reload, then saves against the current revision', async () => {
    const scopeId = '019ad30c-19b0-7000-8000-000000000020';
    const entryId = '019ad30c-19b0-7000-8000-000000000021';
    const newerRevision = '019ad30c-19b0-7000-8000-000000000022';
    let view: MemoryView = { projectId: project.id, branchId: branch.id, headTurnId: null,
      revisionId: null, catalogRevisionId: null, enabled: false,
      state: { v: 2, tags: [{ id: scopeId, name: 'Faits', description: 'Faits du récit' }],
        entries: [{ id: entryId, tagIds: [scopeId], protected: false, key: 'Max', content: 'Texte initial', archived: false,
          source: 'user', turnId: null, updatedAt: project.createdAt },
        { id: '019ad30c-19b0-7000-8000-000000000023', tagIds: [scopeId], protected: true, key: 'Mara', content: 'Autre souvenir', archived: false,
          source: 'guardian', turnId: null, updatedAt: project.createdAt }] } };
    let first = true;
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === '/projects') return respond(config, 200, [project]);
      if (config.url === `/projects/${project.id}`) return respond(config, 200, project);
      if (config.url === `/projects/${project.id}/agents`) return respond(config, 200, []);
      if (config.url === `/projects/${project.id}/branches`) return respond(config, 200, [branch]);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/history`) return respond(config, 200, { branch, turns: [] });
      if (config.url === '/agents') return respond(config, 200, []);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/memories`) {
        if (config.method === 'post') {
          const input = memoryMutationSchema.parse(JSON.parse(String(config.data)));
          if (first) {
            first = false; view = { ...view, revisionId: newerRevision };
            return respond(config, 409, { error: { code: 'MEMORY_CHANGED', message: 'Mémoire modifiée ailleurs.',
              status: 409, source: 'application' } });
          }
          expect(input.expectedRevisionId).toBe(newerRevision);
          if (input.change.op !== 'saveEntry') throw new Error('Expected entry correction.');
          const entry = input.change.entry;
          view = { ...view, state: { ...view.state, entries: view.state.entries.map((item) => item.id === entryId ? { ...item, ...entry } : item) } };
        }
        return respond(config, 200, view);
      }
      throw new Error(`Unexpected request: ${config.url}`);
    });
    renderApp(`/memories?project=${project.id}&branch=${branch.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Mara.*Autre souvenir/ }));
    const memorySection = within(screen.getByRole('region', { name: 'Mémoire' }));
    expect(memorySection.getAllByRole('toolbar')).toHaveLength(1);
    const toolbar = within(memorySection.getByRole('toolbar', { name: 'Actions Mémoire' }));
    // Les actions unitaires appartiennent au détail de l'entrée sélectionnée, pas à la barre d'outils.
    expect(toolbar.queryByRole('button', { name: 'Modifier Mara' })).toBeNull();
    expect(toolbar.queryByRole('button', { name: 'Archiver Mara' })).toBeNull();
    expect(memorySection.getByRole('button', { name: 'Modifier Mara' })).toBeTruthy();
    expect(memorySection.getByRole('button', { name: 'Archiver Mara' })).toBeTruthy();
    expect(memorySection.queryByRole('button', { name: 'Modifier Max' })).toBeNull();
    fireEvent.click(memorySection.getByRole('button', { name: /Max.*Texte initial/ }));
    expect(memorySection.queryByRole('button', { name: 'Modifier Mara' })).toBeNull();
    fireEvent.click(memorySection.getByRole('button', { name: 'Modifier Max' }));
    expect(screen.getByTestId('location').textContent).toBe(`/projects/${project.id}?tab=config&section=memory&branch=${branch.id}`);
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Texte mémoire' }), { target: { value: 'Correction conservée' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Enregistrer l’entrée' }));
    await dialog.findByText('Mémoire modifiée ailleurs.');
    expect((dialog.getByRole('textbox', { name: 'Texte mémoire' }) as HTMLTextAreaElement).value).toBe('Correction conservée');
    fireEvent.click(dialog.getByRole('button', { name: /Recharger l’état courant/ }));
    await waitFor(() => expect(dialog.queryByText('Mémoire modifiée ailleurs.')).toBeNull());
    fireEvent.click(dialog.getByRole('button', { name: 'Enregistrer l’entrée' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await screen.findAllByText('Correction conservée')).length).toBeGreaterThan(0);
  });

  it('reviews a generated memory proposal before applying edited tags and agent access', async () => {
    const agentId = '019ad30c-19b0-7000-8000-000000000030';
    const versionId = '019ad30c-19b0-7000-8000-000000000031';
    const assignment: ProjectAgent = { agentId, versionId, phase: 'analysis', output: 'envelope',
      name: 'Analyse', instructions: 'Analyse', version: 1 };
    const view: MemoryView = { projectId: project.id, branchId: branch.id, headTurnId: null,
      revisionId: null, catalogRevisionId: null, enabled: true, state: { v: 2, tags: [], entries: [] } };
    let applied: unknown = null;
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === `/projects/${project.id}`) return respond(config, 200, project);
      if (config.url === `/projects/${project.id}/branches`) return respond(config, 200, [branch]);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/history`) return respond(config, 200, { branch, turns: [] });
      if (config.url === '/agents') return respond(config, 200, []);
      if (config.url === `/projects/${project.id}/agents`) return respond(config, 200, [assignment]);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/memories/setup`) {
        expect(JSON.parse(String(config.data))).toEqual({ expectedHeadTurnId: null, expectedRevisionId: null, expectedCatalogRevisionId: null });
        return respond(config, 200, { tags: [{ ref: 'new-facts', name: 'Faits', description: 'Faits du récit' }],
          agents: [{ agentId, versionId, mode: 'selected', tagRefs: [] }] });
      }
      if (config.url === `/projects/${project.id}/branches/${branch.id}/memories`) {
        if (config.method === 'post') applied = memoryMutationSchema.parse(JSON.parse(String(config.data)));
        return respond(config, 200, view);
      }
      throw new Error(`Unexpected request: ${config.url}`);
    });
    renderApp(`/projects/${project.id}?tab=config&section=memory&branch=${branch.id}`);
    expect(await screen.findByRole('navigation', { name: 'Sections de configuration' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Nom du projet/ })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Proposer la configuration mémoire' }));
    fireEvent.change(await screen.findByLabelText(/Nom du tag 1/), { target: { value: 'Univers' } });
    fireEvent.change(screen.getByLabelText(/Description du tag 1/), { target: { value: 'Détails du monde' } });
    const selection = screen.getByLabelText('Mémoire proposée pour Analyse', { selector: 'input' });
    fireEvent.click(selection);
    fireEvent.click(await screen.findByRole('option', { name: 'Toute la mémoire' }));
    fireEvent.click(selection);
    fireEvent.click(await screen.findByRole('option', { name: 'Univers' }));
    expect(applied).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer la proposition' }));
    await waitFor(() => expect(applied).toMatchObject({ change: { op: 'applySetup',
      proposal: { tags: [{ ref: 'new-facts', name: 'Univers', description: 'Détails du monde' }],
        agents: [{ agentId, versionId, mode: 'selected', tagRefs: ['new-facts'] }] } } }));
  });

  it('shows the latest guardian suggestion and only saves it on approval', async () => {
    const turnId = '019ad30c-19b0-7000-8000-000000000040';
    const runId = '019ad30c-19b0-7000-8000-000000000041';
    const headBranch = { ...branch, headTurnId: turnId };
    const view: MemoryView = { projectId: project.id, branchId: branch.id, headTurnId: turnId,
      revisionId: null, catalogRevisionId: null, enabled: true, state: { v: 2, tags: [], entries: [] } };
    const writes: unknown[] = [];
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === `/projects/${project.id}`) return respond(config, 200, project);
      if (config.url === `/projects/${project.id}/branches`) return respond(config, 200, [headBranch]);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/history`) return respond(config, 200, { branch: headBranch, turns: [] });
      if (config.url === '/agents' || config.url === `/projects/${project.id}/agents`) return respond(config, 200, []);
      if (config.url === `/projects/${project.id}/turns/${turnId}/memory`) return respond(config, 200, { input: null,
        runs: [{ id: runId, turnId, branchId: branch.id, createdAt: project.createdAt,
          result: { status: 'success', message: 'Terminé', code: null, changes: [], guardianMs: 1, reducerMs: 1,
            tagSuggestions: [{ name: 'Lieux', description: 'Endroits importants', reason: 'Un lieu récurrent' }] } }] });
      if (config.url === `/projects/${project.id}/branches/${branch.id}/memories`) {
        if (config.method === 'post') writes.push(memoryMutationSchema.parse(JSON.parse(String(config.data))));
        return respond(config, 200, view);
      }
      throw new Error(`Unexpected request: ${config.url}`);
    });
    renderApp(`/projects/${project.id}?tab=config&section=memory`);
    fireEvent.click(await screen.findByRole('button', { name: /Dernier traitement : terminé/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approuver ce tag' }));
    await waitFor(() => expect(writes).toMatchObject([{ change: { op: 'saveTag', tag: { name: 'Lieux', description: 'Endroits importants' } } }]));
    expect(await screen.findByRole('button', { name: 'Tag ajouté' })).toHaveProperty('disabled', true);
    expect(writes).toHaveLength(1);
  });

  function metricsOf(turnId: string, overrides: Partial<TurnMetrics> = {}): TurnMetrics {
    return {
      turnId, durationMs: 2300, cost: { microUsd: 4100, complete: true },
      narratorInputTokens: 900, configurationChanges: null, ...overrides,
    };
  }

  function existingChat() {
    const user: MessageDto = {
      id: '019ad30c-19b0-7000-8000-000000000002', projectId: project.id,
      role: 'user', content: 'Ouvre la porte.', createdAt: project.createdAt,
    };
    const assistant: MessageDto = {
      ...user, id: '019ad30c-19b0-7000-8000-000000000003',
      role: 'assistant', content: 'Réponse originale.',
    };
    const turnId = '019ad30c-19b0-7000-8000-000000000004';
    const original: ChatHistoryDto = {
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
      const measured = [...histories.values()].find((item) =>
        config.url === `/projects/${project.id}/branches/${item.branch.id}/turn-metrics`);
      if (measured) return respond(config, 200, measured.turns.map((turn) => metricsOf(turn.id)));
      throw new Error(`Unexpected request: ${config.url}`);
    });
    const alternativeId = '019ad30c-19b0-7000-8000-000000000006';
    const newTurnId = '019ad30c-19b0-7000-8000-000000000007';
    function alternative(status: 'completed' | 'failed'): ChatHistoryDto {
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

  it.each(['success', 'failed', 'conflict'] as const)(
    'retries only memory inside the story timeline without navigating or changing narration (%s)',
    async (outcome) => {
      const fixture = existingChat();
      const head = fixture.original.turns[0]!;
      const failure: MemoryResult = {
        status: 'failed', message: 'Réponse mémoire vide.', code: 'LLM_EMPTY_RESPONSE',
        changes: [], guardianMs: 10, reducerMs: 0,
      };
      head.memory = failure;
      const view: MemoryView = {
        projectId: project.id, branchId: branch.id, headTurnId: head.id,
        revisionId: '019ad30c-19b0-7000-8000-000000000020',
        catalogRevisionId: '019ad30c-19b0-7000-8000-000000000021',
        enabled: true, state: { v: 2, tags: [], entries: [] },
      };
      const chatAdapter = adapter.getMockImplementation()!;
      let release!: () => void;
      const waiting = new Promise<void>((resolve) => { release = resolve; });
      const retryUrl = `/projects/${project.id}/branches/${branch.id}/turns/${head.id}/memory/retry`;
      adapter.mockImplementation(async (config) => {
        if (config.url === `/projects/${project.id}/branches/${branch.id}/memories`) return respond(config, 200, view);
        if (config.url === retryUrl) {
          expect(JSON.parse(String(config.data))).toEqual({
            expectedHeadTurnId: head.id, expectedRevisionId: view.revisionId,
            expectedCatalogRevisionId: view.catalogRevisionId,
          });
          await waiting;
          if (outcome === 'conflict') return respond(config, 409, { error: {
            code: 'MEMORY_CHANGED', message: 'Mémoire modifiée ailleurs.', status: 409, source: 'application',
          } });
          head.memory = { ...failure, status: outcome, message: outcome === 'success' ? 'Mémoire réparée.' : 'Encore vide.' };
          return respond(config, 200, head.memory);
        }
        return chatAdapter(config);
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      renderApp(`/projects/${project.id}`);
      fireEvent.click(await screen.findByRole('button', { name: 'Relancer le Gardien' }));
      await within(screen.getByRole('log', { name: 'Conversation' })).findByText(/^Mémoire ·/);
      expect(screen.queryByText(/^Analyse ·/)).toBeNull();
      expect(screen.queryByText(/^Narrateur ·/)).toBeNull();
      expect(screen.getByLabelText('Votre message').hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('tab', { name: 'Configuration' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByTestId('location').textContent).toBe(`/projects/${project.id}`);
      await act(async () => { release(); });
      await waitFor(() => expect(screen.queryByText(/^Mémoire ·/)).toBeNull());
      if (outcome !== 'success') {
        await screen.findByText(outcome === 'failed' ? 'Encore vide.' : 'Mémoire modifiée ailleurs.');
        expect(screen.getByRole('button', { name: 'Relancer le Gardien' }).hasAttribute('disabled')).toBe(false);
      } else expect(screen.queryByText('Mémoire à relancer')).toBeNull();
      expect(screen.getAllByText('Réponse originale.')).toHaveLength(1);
      expect(screen.getAllByText(fixture.user.content)).toHaveLength(1);
      expect(screen.getByLabelText('Votre message').hasAttribute('disabled')).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(adapter.mock.calls.filter(([config]) => config.url === retryUrl)).toHaveLength(1);
      expect(screen.getByTestId('location').textContent).toBe(`/projects/${project.id}`);
    },
  );

  it('shows pinned agents in project setup and explicitly upgrades only the chosen version', async () => {
    const { original } = existingChat();
    const chatAdapter = adapter.getMockImplementation()!;
    const narrative: AgentDto = {
      id: '019ad30c-19b0-7000-8000-000000000201', phase: 'restitution', output: 'narrative',
      createdAt: project.createdAt, projects: [{ id: project.id, name: project.name,
        versionId: '019ad30c-19b0-7000-8000-000000000202' }],
      versions: [2, 1].map((version) => ({
        id: `019ad30c-19b0-7000-8000-00000000020${version + 1}`,
        version, name: 'Narrateur', instructions: `Ton v${version}`, createdAt: project.createdAt,
      })),
    };
    const guardian: AgentDto = {
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
      if (config.url === `/projects/${project.id}/branches/${branch.id}/memories`) {
        return respond(config, 200, { projectId: project.id, branchId: branch.id, headTurnId: null,
          revisionId: null, catalogRevisionId: null, enabled: true, state: { v: 2, tags: [], entries: [] } });
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
    expect((await screen.findByRole('button', { name: 'Enregistrer les accès de Narrateur' })).textContent).toBe('Enregistrer les accès');
    const instructions = screen.getByText('Lire les instructions').closest('details');
    expect(instructions?.open).toBe(false);
    fireEvent.click(screen.getByText('Lire les instructions'));
    expect(instructions?.open).toBe(true);
    expect(screen.getByText('Ton v1')).toBeTruthy();
    expect(writes).toBe(0);
    fireEvent.click(responseSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Narrateur · v2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’équipe' }));
    await screen.findByText('Configuration enregistrée. Elle sera utilisée au prochain tour.');
    expect(writes).toBe(1);
    expect(assignments.find((entry) => entry.output === 'narrative')?.version).toBe(2);
    expect(assignments.find((entry) => entry.output === 'memory_proposals')?.versionId).toBe(memoryVersion.id);
    fireEvent.click(screen.getByRole('button', { name: /Gardien.*Actif/ }));
    expect(screen.getByLabelText('Mémoire · Gardien', { selector: 'input' })).toBeTruthy();
    expect(screen.queryByLabelText('Réponse utilisateur · Narrateur', { selector: 'input' })).toBeNull();
  });

  it('opens the configuration of a newly created project, then still edits and deletes it', async () => {
    let saved: ProjectDto | null = null;
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === '/projects' && config.method === 'get') {
        return respond(config, 200, saved ? [saved] : []);
      }
      if (config.url === `/projects/${project.id}` && config.method === 'get') {
        return respond(config, 200, saved ?? project);
      }
      if (config.method === 'post' || config.method === 'put') {
        saved = { ...project, ...projectInputSchema.parse(JSON.parse(String(config.data))) };
        return respond(config, config.method === 'post' ? 201 : 200, saved);
      }
      if (config.url === `/projects/${project.id}/branches`) return respond(config, 200, [branch]);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/history`) {
        return respond(config, 200, { branch, turns: [] });
      }
      if (config.url === '/agents' || config.url === `/projects/${project.id}/agents`) return respond(config, 200, []);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/memories`) return respond(config, 200, {
        projectId: project.id, branchId: branch.id, headTurnId: null, revisionId: null, catalogRevisionId: null,
        enabled: false, state: { v: 2, tags: [], entries: [] },
      });
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
    // Un projet neuf s'ouvre directement sur sa configuration, section Projet.
    expect(await screen.findByRole('navigation', { name: 'Sections de configuration' })).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe(`/projects/${project.id}?tab=config`);
    fireEvent.click(screen.getByRole('button', { name: 'Précédent' }));

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

  it('creates a narrator from project configuration and selects it in the team', async () => {
    const guardian = existingAgent('019ad30c-19b0-7000-8000-000000000301', 'memory_proposals', 'Gardien');
    const narrator = existingAgent('019ad30c-19b0-7000-8000-000000000302', 'narrative', 'Narrateur');
    let library: AgentDto[] = [narrator, guardian];
    let assignments: ProjectAgent[] = [narrator, guardian].map((agent) => assignmentOf(agent));
    let configured: ProjectAgentsInput | null = null;
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === `/projects/${project.id}`) return respond(config, 200, project);
      if (config.url === `/projects/${project.id}/branches`) return respond(config, 200, [branch]);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/history`) {
        return respond(config, 200, { branch, turns: [] });
      }
      if (config.url === `/projects/${project.id}/branches/${branch.id}/memories`) return respond(config, 200, {
        projectId: project.id, branchId: branch.id, headTurnId: null, revisionId: null, catalogRevisionId: null,
        enabled: true, state: { v: 2, tags: [], entries: [] },
      });
      if (config.url === '/agents') {
        if (config.method === 'post') {
          const input = agentInputSchema.parse(JSON.parse(String(config.data)));
          const created = { ...existingAgent('019ad30c-19b0-7000-8000-000000000303', input.output, input.name), versions: [{
            id: '019ad30c-19b0-7000-8000-000000000304', version: 1, name: input.name,
            instructions: input.instructions, createdAt: project.createdAt,
          }] } as AgentDto;
          library = [created, ...library];
          return respond(config, 201, created);
        }
        return respond(config, 200, library);
      }
      if (config.url === `/projects/${project.id}/agents`) {
        if (config.method === 'put') {
          configured = projectAgentsInputSchema.parse(JSON.parse(String(config.data)));
          assignments = configured.agents.map((selection) => assignmentOf(
            library.find((agent) => agent.id === selection.agentId)!, selection.versionId));
        }
        return respond(config, 200, assignments);
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    });

    renderApp(`/projects/${project.id}?tab=config&section=agents`);
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvel agent' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByRole('textbox', { name: 'Nom' }), { target: { value: 'Nouveau narrateur' } });
    fireEvent.change(dialog.getByRole('textbox', { name: 'Instructions' }), { target: { value: 'Sois lyrique.' } });
    fireEvent.click(dialog.getByLabelText('Contrat de sortie', { selector: 'input' }));
    fireEvent.click(await screen.findByRole('option', { name: /Restitution Réponse utilisateur/ }));
    fireEvent.click(dialog.getByRole('button', { name: 'Créer l’agent' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // Le nouvel agent remplace l'ancien narrateur sans quitter la page de configuration.
    const narratorSelect = await screen.findByLabelText('Réponse utilisateur · Narrateur', { selector: 'input' });
    await waitFor(() => expect(narratorSelect.getAttribute('value')).toBe('Nouveau narrateur · v1'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer l’équipe' }));
    await screen.findByText('Configuration enregistrée. Elle sera utilisée au prochain tour.');
    expect(configured).toMatchObject({ agents: [
      { agentId: '019ad30c-19b0-7000-8000-000000000303', versionId: '019ad30c-19b0-7000-8000-000000000304' },
      { agentId: guardian.id, versionId: guardian.versions[0]!.id },
    ] });
  });

  it('replaces the branch memory from the exported CSV files', async () => {
    const tagId = '019ad30c-19b0-7000-8000-000000000401';
    const view: MemoryView = { projectId: project.id, branchId: branch.id, headTurnId: null,
      revisionId: null, catalogRevisionId: null, enabled: true,
      state: { v: 2, tags: [{ id: tagId, name: 'Lieux', description: 'Endroits du récit' }],
        entries: [{ id: '019ad30c-19b0-7000-8000-000000000402', tagIds: [tagId], protected: false,
          key: 'Château', content: 'Bâti sur la falaise.', archived: false, source: 'user', turnId: null,
          updatedAt: project.createdAt }] } };
    let written: unknown = null;
    adapter.mockImplementation(async (config) => {
      if (config.url === '/session') return respond(config, 200, { authenticated: true });
      if (config.url === `/projects/${project.id}`) return respond(config, 200, project);
      if (config.url === `/projects/${project.id}/branches`) return respond(config, 200, [branch]);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/history`) {
        return respond(config, 200, { branch, turns: [] });
      }
      if (config.url === '/agents' || config.url === `/projects/${project.id}/agents`) return respond(config, 200, []);
      if (config.url === `/projects/${project.id}/branches/${branch.id}/memories`) {
        if (config.method === 'post') written = memoryMutationSchema.parse(JSON.parse(String(config.data)));
        return respond(config, 200, view);
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    });
    renderApp(`/projects/${project.id}?tab=config&section=memory`);
    fireEvent.click(await screen.findByRole('button', { name: 'Import / export CSV' }));
    const dialog = await screen.findByRole('dialog');
    // Les formats sont affichés tels quels et copiables d'un clic.
    expect([...dialog.querySelectorAll('pre')].map((node) => node.textContent))
      .toEqual([TAG_CSV_TEMPLATE, ENTRY_CSV_TEMPLATE]);
    expect(within(dialog).getByRole('button', { name: 'Copier le format des tags' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Copier le format des souvenirs' })).toBeTruthy();
    const files = dialog.querySelectorAll('input[type="file"]');
    expect(files).toHaveLength(2);
    fireEvent.change(files[0]!, { target: { files: [new File(
      ['nom;description\r\nVilles;Cités du récit\r\n'], 'tags.csv', { type: 'text/csv' })] } });
    fireEvent.change(files[1]!, { target: { files: [new File(
          ['cle;contenu;tags;protege;archive\r\nPort;Un vieux port.;Villes;oui;non\r\n'],
      'souvenirs.csv', { type: 'text/csv' })] } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remplacer la mémoire' }));
    await waitFor(() => expect(written).toMatchObject({ change: { op: 'replaceMemory', memory: {
      tags: [{ name: 'Villes', description: 'Cités du récit' }],
      entries: [{ key: 'Port', content: 'Un vieux port.', tagNames: ['Villes'], protected: true, archived: false }],
    } } }));
    await screen.findByText('Mémoire remplacée : 1 tag(s) et 1 souvenir(s) importés.');
  });

  /** Construit un agent de bibliothèque minimal pour les tests de configuration. */
  function existingAgent(id: string, output: AgentDto['output'], name: string): AgentDto {
      // La version dérive de l'agent sans collision entre deux identifiants voisins.
      const versionId = `${id.slice(0, -2)}9${id.slice(-1)}`;
    return { id, phase: output === 'envelope' ? 'analysis' : 'restitution', output,
      createdAt: project.createdAt, projects: [],
        versions: [{ id: versionId, version: 1, name, instructions: '', createdAt: project.createdAt }] };
  }

  function assignmentOf(agent: AgentDto, versionId = agent.versions[0]!.id): ProjectAgent {
    const version = agent.versions.find((item) => item.id === versionId)!;
    return { agentId: agent.id, versionId, phase: agent.phase, output: agent.output,
      version: version.version, name: version.name, instructions: version.instructions };
  }

  it('renders streamed text before completion and reloads the persisted conversation', async () => {
    let savedHistory: ChatHistoryDto = { branch, turns: [] };
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
    const user: MessageDto = {
      id: '019ad30c-19b0-7000-8000-000000000002', projectId: project.id,
      role: 'user', content: 'Ouvre la porte.', createdAt: project.createdAt,
    };
    const assistant: MessageDto = {
      ...user, id: '019ad30c-19b0-7000-8000-000000000003', role: 'assistant', content: 'Bonjour Mara.',
    };
    const turnId = '019ad30c-19b0-7000-8000-000000000004';
    const emit = (event: ChatEventDto) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    const view = renderApp(`/projects/${project.id}`);

    await screen.findByRole('heading', { name: project.name });
    fireEvent.change(screen.getByLabelText('Votre message'), { target: { value: user.content } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      emit({ type: 'chat.turn.started', turnId, branchId: branch.id, operation: 'send', message: user });
      emit({ type: 'chat.pipeline.stage', turnId, stage: 'analysis', status: 'started', agentCount: 2 });
      emit({ type: 'chat.pipeline.agent', turnId, agentId: '019ad30c-19b0-7000-8000-000000000009',
        name: 'Chaos', status: 'started' });
      emit({ type: 'chat.pipeline.agent', turnId, agentId: '019ad30c-19b0-7000-8000-000000000010',
        name: 'Cohérence', status: 'started' });
      emit({ type: 'chat.message.delta', delta: 'Bonjour' });
    });
    await screen.findByText('Bonjour');
    await screen.findByText(/^Analyse · 0\/2 agents · \d/);
    // A single line during the turn: no detail per agent.
    expect(screen.queryByText('Chaos')).toBeNull();
    expect(screen.getByLabelText('Votre message').hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('tab', { name: 'Configuration' }).hasAttribute('disabled')).toBe(true);

    await act(async () => {
      emit({ type: 'chat.pipeline.agent', turnId, agentId: '019ad30c-19b0-7000-8000-000000000009',
        name: 'Chaos', status: 'completed', durationMs: 1200 });
      emit({ type: 'chat.pipeline.agent', turnId, agentId: '019ad30c-19b0-7000-8000-000000000010',
        name: 'Cohérence', status: 'completed', durationMs: 1600 });
      emit({ type: 'chat.pipeline.stage', turnId, stage: 'analysis', status: 'completed', elapsedMs: 1250 });
      emit({ type: 'chat.pipeline.stage', turnId, stage: 'narrator', status: 'started' });
    });
    await screen.findByText(/^Narrateur · \d/);
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
      emit({ type: 'chat.pipeline.stage', turnId, stage: 'narrator', status: 'completed', elapsedMs: 2100 });
      emit({ type: 'chat.turn.completed', branchId: branch.id, turnId, message: assistant });
      controller.close();
    });
    await waitFor(() => expect(screen.getByLabelText('Votre message').hasAttribute('disabled')).toBe(false));
    expect(screen.getByRole('tab', { name: 'Configuration' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/^Narrateur · \d/)).toBeNull();
    expect(screen.getAllByText('Bonjour Mara.')).toHaveLength(1);
    view.unmount();
    renderApp(`/projects/${project.id}`);
    await screen.findByText('Bonjour Mara.');
    expect(screen.getByText('Ouvre la porte.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('opens the turn drawer from the line under an answer, on a summary that leads to each detail tab', async () => {
    const fixture = existingChat();
    const turnId = fixture.original.turns[0]!.id;
    const analysisCallId = '019ad30c-19b0-7000-8000-000000000301';
    const narratorCallId = '019ad30c-19b0-7000-8000-000000000302';
    const summary: TurnTraceSummary = {
      turnId,
      analysis: [{
        agentId: '019ad30c-19b0-7000-8000-000000000303',
        agentVersionId: '019ad30c-19b0-7000-8000-000000000304',
        name: 'Chaos',
        status: 'success',
        durationMs: 800,
        attempts: 1,
        envelope: {
          v: 1, agent: 'Chaos', summary: 'Une clé manque.',
          items: [{ kind: 'recommendation', text: 'Chercher la clé.', importance: 'HIGH' }],
        },
      }],
      direction: {
        agentId: '019ad30c-19b0-7000-8000-000000000305', agentVersionId: '019ad30c-19b0-7000-8000-000000000306',
        name: 'Directeur', status: 'error', durationMs: 300, attempts: 2, direction: null,
        cost: { microUsd: 120, complete: true },
      },
      developments: null,
      narrator: { status: 'success', durationMs: 1500, prose: 'La porte résiste.' },
      calls: [
        {
          id: analysisCallId, turnId, stage: 'analysis',
          agentId: '019ad30c-19b0-7000-8000-000000000303',
          agentVersionId: '019ad30c-19b0-7000-8000-000000000304',
          agentName: 'Chaos', agentVersion: 1, model: 'test-model', status: 'success',
          inputTokens: 812, outputTokens: 240, durationMs: 800,
          createdAt: project.createdAt, error: null, costMicroUsd: 210, costBasis: 'priced',
        },
        {
          id: narratorCallId, turnId, stage: 'narrator',
          agentId: null, agentVersionId: null, agentName: 'Narrateur', agentVersion: 1,
          model: 'test-model', status: 'success', inputTokens: 900, outputTokens: 100,
          durationMs: 1500, createdAt: project.createdAt, error: null,
          costMicroUsd: 195, costBasis: 'priced',
        },
      ],
      timeline: [
        { stage: 'analysis', durationMs: 800, agentCount: 1 },
        { stage: 'narrator', durationMs: 1500, agentCount: 1 },
      ],
      durationMs: 2300,
      cost: { microUsd: 405, complete: true },
      configuration: {
        systemPrompt: 'Prompt figé du tour.',
        agents: [{
          agentId: '019ad30c-19b0-7000-8000-000000000303', versionId: '019ad30c-19b0-7000-8000-000000000304',
          version: 1, name: 'Chaos', phase: 'analysis', output: 'envelope', memoryRead: { mode: 'all', tagIds: [] },
        }],
      },
    };
    const callDetail: TraceCallDetail = {
      ...summary.calls[0]!,
      request: {
        memory: {
          tags: [{ id: '019ad30c-19b0-7000-8000-000000000311', name: 'Lieux', description: 'Endroits reçus' }],
          entries: [{ id: '019ad30c-19b0-7000-8000-000000000312', key: 'Porte',
            content: 'Une **porte** ancienne.', tagIds: ['019ad30c-19b0-7000-8000-000000000311'] }],
        },
        messages: [
          {
            role: 'system',
            content: `## Instructions système\n\n${'Règle longue pour contrôler la sortie du modèle et éviter les contradictions. '.repeat(190)}`,
          },
          { role: 'user', content: 'Question précédente du joueur.' },
          { role: 'assistant', content: 'Réponse précédente du narrateur.' },
          { role: 'user', content: 'Autre question du joueur.' },
          { role: 'assistant', content: 'Autre réponse du narrateur.' },
          { role: 'user', content: 'Dernière question du joueur.' },
          { role: 'assistant', content: 'Dernière réponse du narrateur.' },
          { role: 'user', content: 'Prompt exact du narrateur.' },
        ],
      },
      response: JSON.stringify(summary.analysis[0]!.envelope),
    };
    const chatAdapter = adapter.getMockImplementation()!;
    adapter.mockImplementation(async (config) => {
      if (config.url === `/projects/${project.id}/turns/${turnId}/traces`) {
        return respond(config, 200, summary);
      }
      if (config.url === `/projects/${project.id}/turns/${turnId}/traces/${analysisCallId}`) {
        return respond(config, 200, callDetail);
      }
      return chatAdapter(config);
    });

    renderApp(`/projects/${project.id}`);
    await screen.findByText('Réponse originale.');
    fireEvent.click(await screen.findByRole('button', { name: 'Tour 1 : 2,3 s · 0,0041 $' }));
    const drawer = within(await screen.findByRole('dialog'));
    await drawer.findByRole('heading', { name: 'Tour 1 / 1' });
    expect(drawer.getByRole('button', { name: 'Tour précédent' }).hasAttribute('disabled')).toBe(true);
    expect(drawer.getByRole('button', { name: 'Tour suivant' }).hasAttribute('disabled')).toBe(true);
    expect(drawer.getByRole('tab', { name: 'Synthèse' }).getAttribute('aria-selected')).toBe('true');
    expect(drawer.queryByRole('tab', { name: 'Analyse' })).toBeNull();
    expect(await drawer.findByRole('button', { name: /^Coût : 0,0004 \$/ })).toBeTruthy();
    expect(drawer.getByRole('button', { name: /^Durée : 2,3 s, Narrateur : 1,5 s/ })).toBeTruthy();
    expect(drawer.getByRole('button', { name: /^Entrée du Narrateur : 900 tokens, premier tour/ })).toBeTruthy();
    expect(drawer.getByText('Rien à signaler pour ce tour.')).toBeTruthy();
    const direction = within(drawer.getByRole('region', { name: 'Direction · Directeur' }));
    expect(direction.getByText('Direction indisponible : le Narrateur a reçu le whiteboard complet.')).toBeTruthy();

    fireEvent.click(drawer.getByRole('button', { name: 'Coût et durée par appel →' }));
    expect(drawer.getByRole('tab', { name: 'Coût et durée' }).getAttribute('aria-selected')).toBe('true');
    expect(drawer.getByRole('cell', { name: 'Chaos' })).toBeTruthy();
    expect(drawer.getByText('Analyse 0,0002 $')).toBeTruthy();

    fireEvent.click(drawer.getByRole('tab', { name: 'Configuration' }));
    await drawer.findByText('Prompt figé du tour.');
    expect(drawer.getByText('Premier tour du récit : rien à comparer.')).toBeTruthy();
    expect(drawer.getByText('Enveloppe whiteboard · Toute la mémoire')).toBeTruthy();

    fireEvent.click(drawer.getByRole('tab', { name: 'Récit' }));
    expect(drawer.getByText('Récit · 1 tour(s)')).toBeTruthy();

    fireEvent.click(drawer.getByRole('tab', { name: 'Appels bruts' }));
    fireEvent.click(await drawer.findByRole('button', { name: /Chaos · Analyse/ }));
    await drawer.findByRole('button', { name: 'Retour aux appels' });
    await screen.findByText('Une clé manque.');
    fireEvent.click(screen.getByText('Mémoire reçue · 1 entrée(s)'));
    expect(screen.getAllByText('Endroits reçus', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText('porte', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Réponse' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }));
    await screen.findByText('Prompt exact du narrateur.', { selector: 'p' });
    const systemPrompt = screen.getByText('system').closest('details');
    expect(systemPrompt?.open).toBe(false);
    if (!systemPrompt) throw new Error('Expected the system prompt disclosure.');
    const systemPromptSummary = systemPrompt.querySelector('summary');
    if (!systemPromptSummary) throw new Error('Expected a system prompt summary.');
    fireEvent.click(systemPromptSummary);
    expect(systemPrompt.open).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Réponse' }));
    await screen.findByText('Une clé manque.');
    fireEvent.click(screen.getByRole('radio', { name: 'JSON' }));
    await screen.findByText(/"agent": "Chaos"/);
    expect(adapter).toHaveBeenCalledWith(expect.objectContaining({
      url: `/projects/${project.id}/turns/${turnId}/traces/${analysisCallId}`,
    }));
  });

  it('keeps the original during regeneration, selects the successful branch and restores it from the URL', async () => {
    const fixture = existingChat();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const emit = (event: ChatEventDto) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
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
    expect(screen.getByRole('button', { name: 'Branche de conversation' }).hasAttribute('disabled')).toBe(true);

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

    fireEvent.click(screen.getByRole('button', { name: 'Branche de conversation' }));
        fireEvent.click(await screen.findByRole('menuitem', { name: 'Principale' }));
    await screen.findByText('Réponse originale.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replays the last turn with a replacement configuration and a new agent version, leaving the project unchanged', async () => {
    const fixture = existingChat();
    const chatAdapter = adapter.getMockImplementation()!;
    let narrative: AgentDto = {
      id: '019ad30c-19b0-7000-8000-000000000401', phase: 'restitution', output: 'narrative',
      createdAt: project.createdAt, projects: [],
      versions: [2, 1].map((version) => ({
        id: `019ad30c-19b0-7000-8000-00000000040${version + 1}`,
        version, name: 'Narrateur', instructions: `Ton v${version}`, createdAt: project.createdAt,
      })),
    };
    const guardian = existingAgent('019ad30c-19b0-7000-8000-000000000404', 'memory_proposals', 'Gardien');
    const observer = existingAgent('019ad30c-19b0-7000-8000-000000000405', 'envelope', 'Observateur');
    const director: AgentDto = {
      id: '019ad30c-19b0-7000-8000-000000000408', phase: 'direction', output: 'direction',
      createdAt: project.createdAt, projects: [],
      versions: [2, 1].map((version) => ({
        id: `019ad30c-19b0-7000-8000-00000000041${version}`,
        version, name: 'Directeur', instructions: `Oriente v${version}`, createdAt: project.createdAt,
      })),
    };
    const assignments = [assignmentOf(narrative, narrative.versions[1]!.id), assignmentOf(guardian), assignmentOf(observer)];
    let published: PublishAgentVersion | null = null;
    const projectWrites: string[] = [];
    adapter.mockImplementation(async (config) => {
      if (config.method !== 'get' && config.url?.startsWith(`/projects/${project.id}`)) projectWrites.push(config.url);
      if (config.url === '/agents') return respond(config, 200, [narrative, guardian, observer, director]);
      if (config.url === `/projects/${project.id}/agents`) return respond(config, 200, assignments);
      if (config.url === `/agents/${narrative.id}/versions` && config.method === 'post') {
        published = publishAgentVersionSchema.parse(JSON.parse(String(config.data)));
        narrative = { ...narrative, versions: [{
          id: '019ad30c-19b0-7000-8000-000000000406', version: 3, name: published.name,
          instructions: published.instructions, createdAt: project.createdAt,
        }, ...narrative.versions] };
        return respond(config, 200, narrative);
      }
      if (config.url === `/agents/${observer.id}/versions` && config.method === 'post') {
        return respond(config, 200, { ...observer, versions: [{ ...observer.versions[0]!,
          id: '019ad30c-19b0-7000-8000-000000000407', version: 2 }, ...observer.versions] });
      }
      return chatAdapter(config);
    });
    const fetchMock = vi.fn().mockImplementation(async () => {
      const alternative = fixture.alternative('completed');
      fixture.histories.set(fixture.alternativeId, alternative);
      return new Response(`data: ${JSON.stringify({
        type: 'chat.turn.completed', branchId: fixture.alternativeId,
        turnId: fixture.newTurnId, message: alternative.turns[0].assistantMessage,
      })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp(`/projects/${project.id}`);
    await screen.findByText('Réponse originale.');
    fireEvent.click(screen.getByRole('button', { name: 'Rejouer le dernier tour avec…' }));
    const dialog = within(await screen.findByRole('dialog'));
    const narratorSelect = await dialog.findByLabelText('Narrateur', { selector: 'input' });
    expect(narratorSelect.getAttribute('value')).toBe('Narrateur · v1');
    expect((dialog.getByRole('textbox', { name: 'Prompt du projet' }) as HTMLTextAreaElement).value).toBe(project.systemPrompt);
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Observateur' }));
    // Publier une version d'un agent retiré ne le remet pas dans l'équipe.
    fireEvent.click(dialog.getByRole('button', { name: 'Nouvelle version de Observateur' }));
    fireEvent.click(await dialog.findByRole('button', { name: 'Publier la version' }));
    await waitFor(() => expect(dialog.getByRole('checkbox', { name: 'Observateur' })).toHaveProperty('checked', false));
    expect(dialog.getByRole('textbox', { name: 'Version de Observateur' })).toHaveProperty('disabled', true);

    // La nouvelle version part des instructions de la version retenue pour le tour, pas de la dernière.
    fireEvent.click(dialog.getByRole('button', { name: 'Nouvelle version de Narrateur' }));
    const instructions = await dialog.findByRole('textbox', { name: 'Instructions' });
    expect((instructions as HTMLTextAreaElement).value).toBe('Ton v1');
    fireEvent.change(instructions, { target: { value: 'Ton variante.' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Publier la version' }));
    await waitFor(() => expect(dialog.getByLabelText('Narrateur', { selector: 'input' }).getAttribute('value'))
      .toBe('Narrateur · v3'));
    expect(published).toMatchObject({ instructions: 'Ton variante.', expectedVersion: 2 });

    // Le Directeur, absent du projet, s'active puis change de version comme un agent d'analyse.
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Directeur' }));
    fireEvent.click(dialog.getByRole('textbox', { name: 'Version de Directeur' }));
    fireEvent.click(await screen.findByRole('option', { name: 'v1 · Directeur' }));

    fireEvent.change(dialog.getByRole('textbox', { name: 'Prompt du projet' }), { target: { value: 'Prompt variante.' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Rejouer' }));
    await screen.findByText('Réponse alternative.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/projects/${project.id}/branches/${branch.id}/turns/${fixture.original.turns[0].id}/regenerate`,
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      expectedHeadTurnId: fixture.original.turns[0].id,
      configuration: {
        systemPrompt: 'Prompt variante.',
        agents: [
          { agentId: narrative.id, versionId: '019ad30c-19b0-7000-8000-000000000406' },
          { agentId: guardian.id, versionId: guardian.versions[0]!.id },
          { agentId: director.id, versionId: director.versions[1]!.id },
        ],
      },
    });
    await waitFor(() => expect(screen.getByTestId('location').textContent).toContain(`branch=${fixture.alternativeId}`));
    expect(projectWrites).toEqual([]);
  });

  it('retries a failed turn in place with a corrected configuration, starting from the recorded one', async () => {
    const fixture = existingChat();
    const head = fixture.original.turns[0]!;
    Object.assign(head, { status: 'failed', error: 'Échec simulé.', assistantMessage: null });
    const chatAdapter = adapter.getMockImplementation()!;
    const narrative: AgentDto = {
      id: '019ad30c-19b0-7000-8000-000000000501', phase: 'restitution', output: 'narrative',
      createdAt: project.createdAt, projects: [],
      versions: [2, 1].map((version) => ({
        id: `019ad30c-19b0-7000-8000-00000000050${version + 1}`,
        version, name: 'Narrateur', instructions: `Ton v${version}`, createdAt: project.createdAt,
      })),
    };
    const guardian = existingAgent('019ad30c-19b0-7000-8000-000000000504', 'memory_proposals', 'Gardien');
    const director: AgentDto = { ...guardian, id: '019ad30c-19b0-7000-8000-000000000505', phase: 'direction',
      output: 'direction', versions: [{ ...guardian.versions[0]!, id: '019ad30c-19b0-7000-8000-000000000509', name: 'Directeur' }] };
    const recorded = [assignmentOf(narrative, narrative.versions[1]!.id), assignmentOf(guardian), assignmentOf(director)];
    const summary: TurnTraceSummary = {
      turnId: head.id, analysis: [], direction: null, developments: null, narrator: null, calls: [], timeline: [], durationMs: 0,
      cost: { microUsd: 0, complete: true },
      configuration: {
        systemPrompt: 'Prompt enregistré.',
        agents: recorded.map(({ instructions: _instructions, ...agent }) => ({ ...agent, memoryRead: null })),
      },
    };
    adapter.mockImplementation(async (config) => {
      if (config.url === '/agents') return respond(config, 200, [narrative, guardian, director]);
      if (config.url === `/projects/${project.id}/turns/${head.id}/traces`) return respond(config, 200, summary);
      if (config.url === `/projects/${project.id}/agents`) throw new Error('The recorded configuration is the start.');
      return chatAdapter(config);
    });
    const fetchMock = vi.fn().mockImplementation(async () => {
      const retried = { ...head, id: fixture.newTurnId, retryOfTurnId: head.id, status: 'completed' as const, error: null,
        assistantMessage: { ...fixture.user, id: '019ad30c-19b0-7000-8000-000000000508', role: 'assistant' as const,
          content: 'Réponse corrigée.' } };
      fixture.histories.set(branch.id, { branch: { ...fixture.original.branch, headTurnId: retried.id }, turns: [retried] });
      return new Response(`data: ${JSON.stringify({
        type: 'chat.turn.completed', branchId: branch.id, turnId: retried.id, message: retried.assistantMessage,
      })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderApp(`/projects/${project.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Rejouer le dernier tour avec…' }));
    const dialog = within(await screen.findByRole('dialog'));
    const narratorSelect = await dialog.findByLabelText('Narrateur', { selector: 'input' });
    expect(narratorSelect.getAttribute('value')).toBe('Narrateur · v1');
    expect((dialog.getByRole('textbox', { name: 'Prompt du projet' }) as HTMLTextAreaElement).value).toBe('Prompt enregistré.');
    fireEvent.click(narratorSelect);
    fireEvent.click(await screen.findByRole('option', { name: 'Narrateur · v2' }));
    const directorCheckbox = dialog.getByRole('checkbox', { name: 'Directeur' });
    expect(directorCheckbox).toHaveProperty('checked', true);
    fireEvent.click(directorCheckbox);
    fireEvent.click(dialog.getByRole('button', { name: 'Rejouer' }));

    await screen.findByText('Réponse corrigée.');
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/projects/${project.id}/branches/${branch.id}/turns/${head.id}/retry`);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      expectedHeadTurnId: head.id,
      configuration: {
        systemPrompt: 'Prompt enregistré.',
        agents: [
          { agentId: narrative.id, versionId: narrative.versions[0]!.id },
          { agentId: guardian.id, versionId: guardian.versions[0]!.id },
        ],
      },
    });
    expect(screen.getByTestId('location').textContent).toBe(`/projects/${project.id}`);
  });

      it('switches branches from the header control and marks the current one', async () => {
        const fixture = existingChat();
        fixture.histories.set(fixture.alternativeId, fixture.alternative('completed'));
        const view = renderApp(`/projects/${project.id}`);
        await screen.findByText('Réponse originale.');

        fireEvent.click(screen.getByRole('button', { name: 'Branche de conversation' }));
        const menu = await screen.findByRole('menu');
        expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent))
          .toEqual(['Principale', 'Alternative 1']);
        // La branche courante est signalée, l'autre reste sélectionnable.
        expect(within(menu).getByRole('menuitem', { name: 'Principale' }).getAttribute('aria-current')).toBe('true');

        fireEvent.click(within(menu).getByRole('menuitem', { name: 'Alternative 1' }));
        await screen.findByText('Réponse alternative.');
        await waitFor(() => expect(screen.getByTestId('location').textContent).toContain(`branch=${fixture.alternativeId}`));
        // Le nom de la branche courante reste visible dans l'en-tête.
        expect(screen.getByRole('button', { name: 'Branche de conversation' }).textContent).toContain('Alternative 1');
        view.unmount();
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
