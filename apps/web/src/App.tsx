import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, streamTurn } from './api.js';
import { AgentsView } from './features/agents/AgentsView.js';
import { MemoryView } from './features/memory/MemoryView.js';
import { StoryView } from './features/story/StoryView.js';
import type { Agent, Branch, BudgetReservation, Memory, Project, Turn } from './types.js';

type Tab = 'story' | 'memory' | 'agents';

export function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [password, setPassword] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [reservations, setReservations] = useState<BudgetReservation[]>([]);
  const [name, setName] = useState('');
  const [world, setWorld] = useState('');
  const [agentsYaml, setAgentsYaml] = useState('');
  const [projectSettings, setProjectSettings] = useState('{}');
  const [streamed, setStreamed] = useState('');
  const [status, setStatus] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('story');
  const [debug, setDebug] = useState<unknown>(null);
  const [editor, setEditor] = useState('');
  const [editId, setEditId] = useState('');
  const [seed, setSeed] = useState('');
  const [correction, setCorrection] = useState('{\n  "proposals": []\n}');

  useEffect(() => {
    let active = true;
    void api<Project[]>('/api/projects')
      .then((list) => {
        if (!active) return;
        setProjects(list);
        setAuthenticated(true);
      })
      .catch((failure: unknown) => {
        if (!active) return;
        if (!(failure instanceof ApiError && failure.status === 401)) {
          setError(failure instanceof Error ? failure.message : 'Erreur réseau');
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadProjects() {
    const list = await api<Project[]>('/api/projects');
    setProjects(list);
    setAuthenticated(true);
  }

  async function refresh(id: string) {
    const [current, history, state, configured, available, reserved] = await Promise.all([
      api<Project>(`/api/projects/${id}`),
      api<Turn[]>(`/api/projects/${id}/turns`),
      api<Memory>(`/api/projects/${id}/memory`),
      api<Agent[]>(`/api/projects/${id}/agents`),
      api<Branch[]>(`/api/projects/${id}/branches`),
      api<BudgetReservation[]>(`/api/projects/${id}/budget-reservations`),
    ]);
    setProject(current);
    setTurns(history);
    setMemory(state);
    setAgents(configured);
    setBranches(available);
    setReservations(reserved);
  }

  async function runAction(action: () => Promise<void>) {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        setAuthenticated(false);
        setProject(null);
        setError('Session expirée. Reconnectez-vous.');
      } else {
        setError(failure instanceof Error ? failure.message : 'Erreur inconnue');
      }
    } finally {
      setBusy(false);
    }
  }

  function login(event: FormEvent) {
    event.preventDefault();
    void runAction(async () => {
      await api('/api/login', 'POST', { password });
      setPassword('');
      await loadProjects();
    });
  }

  function createProject(event: FormEvent) {
    event.preventDefault();
    void runAction(async () => {
      const created = await api<Project>('/api/projects', 'POST', {
        name,
        worldMd: world,
        settings: JSON.parse(projectSettings),
        ...(agentsYaml.trim() ? { agentsYaml } : {}),
      });
      setName('');
      setWorld('');
      setAgentsYaml('');
      await loadProjects();
      await refresh(created.id);
      setTab(created.worldInitialized ? 'story' : 'memory');
    });
  }

  async function submitTurn(userInput: string, metaDirection: string) {
    if (!project) return;
    setStreamed('');
    setStatus('Démarrage');
    setWarnings([]);
    let committed = false;
    let streamError = '';
    await streamTurn(
      `/api/projects/${project.id}/turns`,
      { userInput, metaDirection },
      ({ event, payload }) => {
        if (event === 'prose') setStreamed((previous) => previous + (payload.text ?? ''));
        if (event === 'status') setStatus(payload.status ?? '');
        if (event === 'warning' && payload.message)
          setWarnings((previous) => [...previous, payload.message!]);
        if (event === 'committed') committed = true;
        if (event === 'error') streamError = payload.message ?? 'Tour échoué';
      },
    );
    await refresh(project.id);
    setStreamed('');
    if (streamError) throw new Error(streamError);
    if (!committed) throw new Error('Flux interrompu : vérifiez l’état du tour dans le récit.');
    setStatus('');
  }

  async function previewSeed() {
    if (!project) return;
    const result = await api<{ proposals: unknown[] }>(`/api/projects/${project.id}/seed/preview`, 'POST');
    setSeed(JSON.stringify(result, null, 2));
  }

  async function applySeed() {
    if (!project) return;
    const result = await api<{
      initialized: boolean;
      results: { status: string; payload: unknown }[];
    }>(`/api/projects/${project.id}/seed/apply`, 'POST', JSON.parse(seed));
    setDebug(result);
    if (result.initialized) {
      setSeed('');
    } else {
      setSeed(
        JSON.stringify(
          {
            proposals: result.results
              .filter((item) => item.status === 'rejected')
              .map((item) => item.payload),
          },
          null,
          2,
        ),
      );
    }
    await refresh(project.id);
  }

  async function applyCorrection() {
    if (!project) return;
    setDebug(await api(`/api/projects/${project.id}/debug/proposals`, 'POST', JSON.parse(correction)));
    await refresh(project.id);
  }

  async function saveAgent() {
    if (!project) return;
    const url =
      editId === 'settings'
        ? `/api/projects/${project.id}/settings`
        : editId === 'new'
          ? `/api/projects/${project.id}/agents`
          : `/api/agents/${editId}`;
    await api(url, editId === 'new' ? 'POST' : 'PUT', JSON.parse(editor));
    setEditId('');
    await refresh(project.id);
  }

  async function settleReservation(reservationId: string, costUsd: number) {
    if (!project) return;
    await api(`/api/projects/${project.id}/budget-reservations/${reservationId}/settle`, 'POST', { costUsd });
    await refresh(project.id);
  }

  const blocked = turns.some((turn) => !['committed', 'failed'].includes(turn.status));

  return (
    <main>
      <header>
        <h1>Choral Writer</h1>
        {authenticated && (
          <button
            className="secondary"
            onClick={() =>
              void runAction(async () => {
                await api('/api/logout', 'POST');
                setAuthenticated(false);
                setProject(null);
                setProjects([]);
              })
            }
          >
            Déconnexion
          </button>
        )}
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {checkingSession ? (
        <p role="status">Vérification de la session…</p>
      ) : !authenticated ? (
        <form onSubmit={login} className="panel">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button disabled={busy}>Connexion</button>
        </form>
      ) : !project ? (
        <>
          <h2>Histoires</h2>
          {projects.length === 0 ? (
            <p className="muted">Aucune histoire pour le moment. Créez-en une ci-dessous.</p>
          ) : (
            projects.map((item) => (
              <button
                className="project"
                key={item.id}
                onClick={() => void runAction(() => refresh(item.id))}
              >
                {item.name}
              </button>
            ))
          )}
          <form onSubmit={createProject} className="panel">
            <h2>Créer une histoire</h2>
            <label>
              Nom
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Monde (Markdown)
              <textarea
                rows={9}
                value={world}
                onChange={(event) => setWorld(event.target.value)}
                placeholder={'# Pitch\n# Style\n# Personnages'}
              />
            </label>
            <label>
              Agents (YAML facultatif)
              <textarea rows={4} value={agentsYaml} onChange={(event) => setAgentsYaml(event.target.value)} />
            </label>
            <label>
              Budget (JSON facultatif)
              <textarea
                className="code"
                rows={4}
                value={projectSettings}
                onChange={(event) => setProjectSettings(event.target.value)}
              />
            </label>
            <button disabled={busy}>Créer</button>
          </form>
        </>
      ) : (
        <>
          <nav aria-label="Sections">
            {(['story', 'memory', 'agents'] as const).map((item) => (
              <button
                key={item}
                className={tab === item ? 'selected' : 'secondary'}
                aria-pressed={tab === item}
                onClick={() => setTab(item)}
              >
                {item === 'story' ? 'Récit' : item === 'memory' ? 'Mémoire' : 'Agents'}
              </button>
            ))}
          </nav>
          {tab === 'story' && (
            <StoryView
              project={project}
              turns={turns}
              branches={branches}
              busy={busy}
              blocked={blocked}
              streamed={streamed}
              status={status}
              warnings={warnings}
              debug={debug}
              runAction={(action) => void runAction(action)}
              onActivateBranch={async (branchId) => {
                await api(`/api/projects/${project.id}/branches/${branchId}/activate`, 'POST');
                await refresh(project.id);
              }}
              onSubmitTurn={submitTurn}
              onDebug={async (turnId) => setDebug(await api(`/api/turns/${turnId}/debug`))}
              onRetryGuardian={async (turnId) => {
                await api(`/api/turns/${turnId}/retry-guardian`, 'POST');
                await refresh(project.id);
              }}
              onResume={async (turnId) => {
                const result = await api<{
                  messages: { event: string; value: { message?: string } }[];
                }>(`/api/turns/${turnId}/resume`, 'POST');
                await refresh(project.id);
                const failure = result.messages.find((message) => message.event === 'error');
                if (failure) throw new Error(failure.value.message ?? 'Reprise impossible');
              }}
              onRewind={async (turnId) => {
                await api(`/api/projects/${project.id}/rewind`, 'POST', { turnId });
                await refresh(project.id);
              }}
              onCloseDebug={() => setDebug(null)}
              onBack={() => {
                setProject(null);
                setDebug(null);
              }}
            />
          )}
          {tab === 'memory' && (
            <MemoryView
              project={project}
              memory={memory}
              busy={busy}
              debug={debug}
              seed={seed}
              correction={correction}
              setSeed={setSeed}
              setCorrection={setCorrection}
              runAction={(action) => void runAction(action)}
              onSeedPreview={previewSeed}
              onSeedApply={applySeed}
              onApplyCorrection={applyCorrection}
            />
          )}
          {tab === 'agents' && (
            <AgentsView
              project={project}
              agents={agents}
              reservations={reservations}
              busy={busy}
              editor={editor}
              editId={editId}
              setEditor={setEditor}
              setEditId={setEditId}
              runAction={(action) => void runAction(action)}
              onSave={saveAgent}
              onSettle={settleReservation}
            />
          )}
        </>
      )}
    </main>
  );
}
