import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Project = { id: string; name: string; activeBranchId: string; worldInitialized: boolean; settings: unknown };
type Turn = { id: string; seq: number; userInput: string; prose: string | null; status: string; error: string | null };
type Branch = { id: string; parentBranchId: string | null; forkEventSeq: number };
type Agent = { id: string; key: string; name: string; kind: string; systemPrompt: string; model: string;
  params: unknown; contextSpec: unknown; schedule: unknown; required: boolean; enabled: boolean };
type Memory = { state: { entities: unknown[]; facts: unknown[]; knowledge: unknown[] }; summaries: unknown[] };
type BudgetReservation = { id: string; turnId: string | null; amount: string; settled: boolean; settledAmount: string | null };

async function api<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur réseau' }));
    throw new Error(error.error || `Erreur HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
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
  const [input, setInput] = useState('');
  const [direction, setDirection] = useState('');
  const [streamed, setStreamed] = useState('');
  const [status, setStatus] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'story' | 'memory' | 'agents'>('story');
  const [debug, setDebug] = useState<unknown>(null);
  const [editor, setEditor] = useState('');
  const [editId, setEditId] = useState('');
  const [seed, setSeed] = useState('');
  const [correction, setCorrection] = useState('{\n  "proposals": []\n}');

  async function loadProjects() {
    const list = await api<Project[]>('/api/projects');
    setProjects(list);
    setAuthenticated(true);
  }
  useEffect(() => { void loadProjects().catch(() => setAuthenticated(false)); }, []);

  async function refresh(id: string) {
    const [current, history, state, configured, available, reserved] = await Promise.all([
      api<Project>(`/api/projects/${id}`), api<Turn[]>(`/api/projects/${id}/turns`),
      api<Memory>(`/api/projects/${id}/memory`), api<Agent[]>(`/api/projects/${id}/agents`),
      api<Branch[]>(`/api/projects/${id}/branches`),
      api<BudgetReservation[]>(`/api/projects/${id}/budget-reservations`)
    ]);
    setProject(current); setTurns(history); setMemory(state); setAgents(configured); setBranches(available); setReservations(reserved);
  }
  async function act(action: () => Promise<void>) {
    setError(''); setBusy(true);
    try { await action(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Erreur inconnue'); }
    finally { setBusy(false); }
  }
  function login(event: FormEvent) {
    event.preventDefault();
    void act(async () => { await api('/api/login', 'POST', { password }); setPassword(''); await loadProjects(); });
  }
  function create(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      const created = await api<Project>('/api/projects', 'POST', {
        name, worldMd: world, settings: JSON.parse(projectSettings), ...(agentsYaml.trim() ? { agentsYaml } : {})
      });
      setName(''); setWorld(''); setAgentsYaml(''); await loadProjects(); await refresh(created.id);
      setTab(created.worldInitialized ? 'story' : 'memory');
    });
  }
  function submitTurn(event: FormEvent) {
    event.preventDefault();
    if (!project) return;
    void act(async () => {
      setStreamed(''); setStatus('Démarrage'); setWarnings([]);
      const response = await fetch(`/api/projects/${project.id}/turns`, { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userInput: input, metaDirection: direction }) });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Impossible de lancer le tour');
      }
      if (!response.body) throw new Error('Flux indisponible');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let committed = false;
      let streamError = '';
      for (;;) {
        const part = await reader.read();
        buffer += decoder.decode(part.value, { stream: !part.done });
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const eventName = frame.match(/^event: (.+)$/m)?.[1];
          const data = frame.match(/^data: (.+)$/m)?.[1];
          if (!data) continue;
          const payload = JSON.parse(data) as { text?: string; status?: string; message?: string };
          if (eventName === 'prose') setStreamed(previous => previous + (payload.text ?? ''));
          if (eventName === 'status') setStatus(payload.status ?? '');
          if (eventName === 'warning' && payload.message) setWarnings(previous => [...previous, payload.message!]);
          if (eventName === 'committed') committed = true;
          if (eventName === 'error') streamError = payload.message ?? 'Tour échoué';
        }
        if (part.done) break;
      }
      await refresh(project.id);
      setStreamed('');
      if (streamError) throw new Error(streamError);
      if (!committed) throw new Error('Flux interrompu : vérifiez l’état du tour dans le récit.');
      setInput(''); setDirection(''); setStatus('');
    });
  }

  const blocked = turns.some(turn => !['committed', 'failed'].includes(turn.status));
  return <main>
    <header><h1>Choral Writer</h1>{authenticated && <button className="secondary" onClick={() => void act(async () => {
      await api('/api/logout', 'POST'); setAuthenticated(false); setProject(null); setProjects([]);
    })}>Déconnexion</button>}</header>
    {error && <p role="alert" className="error">{error}</p>}
    {!authenticated ? <form onSubmit={login} className="panel">
      <label htmlFor="password">Mot de passe</label>
      <input id="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required />
      <button disabled={busy}>Connexion</button>
    </form> : !project ? <>
      <h2>Histoires</h2>
      {projects.map(item => <button className="project" key={item.id} onClick={() => void act(() => refresh(item.id))}>{item.name}</button>)}
      <form onSubmit={create} className="panel">
        <h2>Créer une histoire</h2>
        <label>Nom<input value={name} onChange={event => setName(event.target.value)} required /></label>
        <label>Monde (Markdown)<textarea rows={9} value={world} onChange={event => setWorld(event.target.value)} placeholder="# Pitch&#10;# Style&#10;# Personnages" /></label>
        <label>Agents (YAML facultatif)<textarea rows={4} value={agentsYaml} onChange={event => setAgentsYaml(event.target.value)} /></label>
        <label>Budget (JSON facultatif)<textarea className="code" rows={4} value={projectSettings} onChange={event => setProjectSettings(event.target.value)} /></label>
        <button disabled={busy}>Créer</button>
      </form>
    </> : <>
      <div className="toolbar"><button className="secondary" onClick={() => { setProject(null); setDebug(null); }}>← Histoires</button><h2>{project.name}</h2></div>
      <nav aria-label="Sections">
        {(['story', 'memory', 'agents'] as const).map(item => <button key={item} className={tab === item ? 'selected' : 'secondary'} onClick={() => setTab(item)}>
          {item === 'story' ? 'Récit' : item === 'memory' ? 'Mémoire' : 'Agents'}
        </button>)}
      </nav>
      {tab === 'story' && <>
        <label>Branche
          <select value={project.activeBranchId} disabled={busy} onChange={event => void act(async () => {
            await api(`/api/projects/${project.id}/branches/${event.target.value}/activate`, 'POST'); await refresh(project.id);
          })}>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.parentBranchId ? `Branche après événement ${branch.forkEventSeq}` : 'Branche initiale'} — {branch.id.slice(0, 8)}</option>)}</select>
        </label>
        {turns.map(turn => <article className="panel" key={turn.id}>
          <p className="muted">Tour {turn.seq} · {turn.status}</p>
          <p><strong>Direction :</strong> {turn.userInput}</p>
          {turn.prose && <div className="prose">{turn.prose}</div>}
          {turn.error && <p className="error">{turn.error}</p>}
          <div className="actions">
            <button className="secondary" onClick={() => void act(async () => setDebug(await api(`/api/turns/${turn.id}/debug`)))}>Debug</button>
            {turn.status === 'narrated' && <button disabled={busy} onClick={() => void act(async () => {
              await api(`/api/turns/${turn.id}/retry-guardian`, 'POST'); await refresh(project.id);
            })}>Relancer le gardien</button>}
            {['pending', 'interpreting', 'analyzing', 'narrating', 'guarding'].includes(turn.status) &&
              <button disabled={busy} onClick={() => void act(async () => {
                const result = await api<{ messages: { event: string; value: { message?: string } }[] }>(`/api/turns/${turn.id}/resume`, 'POST');
                await refresh(project.id);
                const failure = result.messages.find(message => message.event === 'error');
                if (failure) throw new Error(failure.value.message ?? 'Reprise impossible');
              })}>Reprendre le tour interrompu</button>}
            {turn.status === 'committed' && <button className="secondary" disabled={busy} onClick={() => void act(async () => {
              if (!window.confirm('Créer une nouvelle branche à partir de ce tour ?')) return;
              await api(`/api/projects/${project.id}/rewind`, 'POST', { turnId: turn.id }); await refresh(project.id);
            })}>Revenir ici</button>}
          </div>
        </article>)}
        {streamed && <article className="panel prose" aria-live="polite">{streamed}</article>}
        {warnings.map((warning, index) => <p role="status" key={index}>{warning}</p>)}
        {status && busy && <p aria-live="polite">{status}</p>}
        <form onSubmit={submitTurn} className="panel">
          <label>Action<textarea rows={4} value={input} onChange={event => setInput(event.target.value)} required /></label>
          <label>Direction méta (facultative)<input value={direction} onChange={event => setDirection(event.target.value)} /></label>
          <button disabled={busy || blocked || !project.worldInitialized}>Continuer le récit</button>
          {!project.worldInitialized && <p>Initialisez le monde dans l’onglet Mémoire avant le premier tour.</p>}
          {blocked && <p>Un tour est en cours ou attend la relance du gardien.</p>}
        </form>
        {debug !== null && <section className="panel"><div className="toolbar"><h3>Debug du tour</h3><button className="secondary" onClick={() => setDebug(null)}>Fermer</button></div><pre>{JSON.stringify(debug, null, 2)}</pre></section>}
      </>}
      {tab === 'memory' && <section className="panel">
        {!project.worldInitialized && <><h3>Initialiser le monde</h3>
        <button disabled={busy} onClick={() => void act(async () => {
          const result = await api<{ proposals: unknown[] }>(`/api/projects/${project.id}/seed/preview`, 'POST');
          setSeed(JSON.stringify(result, null, 2));
        })}>Proposer la mémoire initiale</button>
        {seed && <><label>Propositions à relire et corriger<textarea className="code" rows={12} value={seed} onChange={event => setSeed(event.target.value)} /></label>
          <button disabled={busy} onClick={() => void act(async () => {
            const result = await api<{ initialized: boolean; results: unknown[] }>(`/api/projects/${project.id}/seed/apply`, 'POST', JSON.parse(seed));
            setDebug(result);
            if (result.initialized) setSeed('');
            else setSeed(JSON.stringify({ proposals: result.results.filter(item => (item as { status: string }).status === 'rejected').map(item => (item as { payload: unknown }).payload) }, null, 2));
            await refresh(project.id);
          })}>Valider les propositions</button></>}</>}
        <h3>État de la mémoire</h3>
        <pre>{JSON.stringify(memory?.state, null, 2)}</pre>
        <h3>Résumés</h3><pre>{JSON.stringify(memory?.summaries, null, 2)}</pre>
        <h3>Correction manuelle</h3>
        <p>Pour modifier un fait HIGH, ajoutez l’identifiant du tour justificatif dans <code>turnId</code> et l’index de l’événement dans <code>resolution_event</code>.</p>
        <label>Propositions JSON<textarea className="code" rows={9} value={correction} onChange={event => setCorrection(event.target.value)} /></label>
        <button disabled={busy} onClick={() => void act(async () => {
          const result = await api(`/api/projects/${project.id}/debug/proposals`, 'POST', JSON.parse(correction));
          setDebug(result); await refresh(project.id);
        })}>Appliquer</button>
        {debug !== null && <pre>{JSON.stringify(debug, null, 2)}</pre>}
      </section>}
      {tab === 'agents' && <section className="panel"><h3>Agents configurés</h3>
        <button className="secondary" onClick={() => { setEditId('settings'); setEditor(JSON.stringify(project.settings, null, 2)); }}>Budget du projet</button>
        {reservations.length > 0 && <><h3>Réservations de budget</h3>
          <p>Après une interruption, vérifiez le coût auprès du fournisseur avant de le renseigner. Une réservation non rapprochée reste comptabilisée.</p>
          {reservations.map(reservation => <div key={reservation.id}>
            <p>Réservation {reservation.id.slice(0, 8)} · estimation {reservation.amount} USD
              {reservation.turnId && ` · tour ${reservation.turnId.slice(0, 8)}`}
              {reservation.settled && ` · coût confirmé ${reservation.settledAmount} USD`}</p>
            {!reservation.settled && <form onSubmit={event => {
              event.preventDefault();
              const costUsd = Number(new FormData(event.currentTarget).get('costUsd'));
              void act(async () => {
                if (!window.confirm('Confirmer le coût vérifié auprès du fournisseur ?')) return;
                await api(`/api/projects/${project.id}/budget-reservations/${reservation.id}/settle`, 'POST', { costUsd });
                await refresh(project.id);
              });
            }}>
              <label>Coût confirmé (USD)<input name="costUsd" type="number" min="0" step="any" required /></label>
              <button disabled={busy}>Rapprocher</button>
            </form>}
          </div>)}</>}
        <button className="secondary" onClick={() => {
          setEditId('new'); setEditor(JSON.stringify({
            key: 'analyse', name: 'Analyse', kind: 'analysis', model: agents[0]?.model ?? '',
            system_prompt: 'Analyse la situation.', params: {}, context: {}, schedule: { mode: 'always' },
            required: false, enabled: true
          }, null, 2));
        }}>Ajouter un agent d’analyse</button>
        {agents.map(agent => <button className="project" key={agent.id} onClick={() => {
          setEditId(agent.id); setEditor(JSON.stringify({ key: agent.key, name: agent.name, kind: agent.kind,
            system_prompt: agent.systemPrompt, model: agent.model, params: agent.params, context: agent.contextSpec,
            schedule: agent.schedule, required: agent.required, enabled: agent.enabled }, null, 2));
        }}>{agent.name} · {agent.kind}</button>)}
        {editId && <><label>Configuration JSON<textarea className="code" rows={18} value={editor} onChange={event => setEditor(event.target.value)} /></label>
          <button disabled={busy} onClick={() => void act(async () => {
            await api(editId === 'settings' ? `/api/projects/${project.id}/settings` :
              editId === 'new' ? `/api/projects/${project.id}/agents` : `/api/agents/${editId}`,
            editId === 'new' ? 'POST' : 'PUT', JSON.parse(editor)); setEditId(''); await refresh(project.id);
          })}>Enregistrer</button></>}
      </section>}
    </>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
