import { useState, type FormEvent } from 'react';
import type { Branch, Project, Turn } from '../../types.js';

type Props = {
  project: Project;
  turns: Turn[];
  branches: Branch[];
  busy: boolean;
  blocked: boolean;
  streamed: string;
  status: string;
  warnings: string[];
  debug: unknown;
  runAction: (action: () => Promise<void>) => void;
  onActivateBranch: (branchId: string) => Promise<void>;
  onSubmitTurn: (input: string, direction: string) => Promise<void>;
  onDebug: (turnId: string) => Promise<void>;
  onRetryGuardian: (turnId: string) => Promise<void>;
  onResume: (turnId: string) => Promise<void>;
  onRewind: (turnId: string) => Promise<void>;
  onCloseDebug: () => void;
  onBack: () => void;
};

export function StoryView({
  project,
  turns,
  branches,
  busy,
  blocked,
  streamed,
  status,
  warnings,
  debug,
  runAction,
  onActivateBranch,
  onSubmitTurn,
  onDebug,
  onRetryGuardian,
  onResume,
  onRewind,
  onCloseDebug,
  onBack,
}: Props) {
  const [input, setInput] = useState('');
  const [direction, setDirection] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    runAction(async () => {
      await onSubmitTurn(input, direction);
      setInput('');
      setDirection('');
    });
  }

  return (
    <>
      <div className="toolbar">
        <button className="secondary" onClick={onBack}>
          ← Histoires
        </button>
        <h2>{project.name}</h2>
      </div>
      <label>
        Branche
        <select
          value={project.activeBranchId}
          disabled={busy}
          onChange={(event) => runAction(() => onActivateBranch(event.target.value))}
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.parentBranchId ? `Branche après événement ${branch.forkEventSeq}` : 'Branche initiale'}{' '}
              — {branch.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {turns.length === 0 && (
        <p className="muted">Aucun tour sur cette branche. Commencez le récit ci-dessous.</p>
      )}
      {turns.map((turn) => (
        <article className="panel" key={turn.id}>
          <p className="muted">
            Tour {turn.seq} · {turn.status}
          </p>
          <p>
            <strong>Direction :</strong> {turn.userInput}
          </p>
          {turn.prose && <div className="prose">{turn.prose}</div>}
          {turn.error && <p className="error">{turn.error}</p>}
          <div className="actions">
            <button className="secondary" onClick={() => runAction(() => onDebug(turn.id))}>
              Debug
            </button>
            {turn.status === 'narrated' && (
              <button disabled={busy} onClick={() => runAction(() => onRetryGuardian(turn.id))}>
                Relancer le gardien
              </button>
            )}
            {['pending', 'interpreting', 'analyzing', 'narrating', 'guarding'].includes(turn.status) && (
              <button disabled={busy} onClick={() => runAction(() => onResume(turn.id))}>
                Reprendre le tour interrompu
              </button>
            )}
            {turn.status === 'committed' && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('Créer une nouvelle branche à partir de ce tour ?')) {
                    runAction(() => onRewind(turn.id));
                  }
                }}
              >
                Revenir ici
              </button>
            )}
          </div>
        </article>
      ))}
      {streamed && (
        <article className="panel prose" aria-live="polite">
          {streamed}
        </article>
      )}
      {warnings.map((warning, index) => (
        <p role="status" key={`${warning}-${index}`}>
          {warning}
        </p>
      ))}
      {status && busy && <p aria-live="polite">{status}</p>}
      <form onSubmit={submit} className="panel">
        <label>
          Action
          <textarea rows={4} value={input} onChange={(event) => setInput(event.target.value)} required />
        </label>
        <label>
          Direction méta (facultative)
          <input value={direction} onChange={(event) => setDirection(event.target.value)} />
        </label>
        <button disabled={busy || blocked || !project.worldInitialized}>Continuer le récit</button>
        {!project.worldInitialized && (
          <p>Initialisez le monde dans l’onglet Mémoire avant le premier tour.</p>
        )}
        {blocked && <p>Un tour est en cours ou attend la relance du gardien.</p>}
      </form>
      {debug !== null && (
        <section className="panel">
          <div className="toolbar">
            <h3>Debug du tour</h3>
            <button className="secondary" onClick={onCloseDebug}>
              Fermer
            </button>
          </div>
          <pre>{JSON.stringify(debug, null, 2)}</pre>
        </section>
      )}
    </>
  );
}
