import type { Memory, Project } from '../../types.js';

type Props = {
  project: Project;
  memory: Memory | null;
  busy: boolean;
  debug: unknown;
  seed: string;
  correction: string;
  setSeed: (value: string) => void;
  setCorrection: (value: string) => void;
  runAction: (action: () => Promise<void>) => void;
  onSeedPreview: () => Promise<void>;
  onSeedApply: () => Promise<void>;
  onApplyCorrection: () => Promise<void>;
};

export function MemoryView({
  project,
  memory,
  busy,
  debug,
  seed,
  correction,
  setSeed,
  setCorrection,
  runAction,
  onSeedPreview,
  onSeedApply,
  onApplyCorrection,
}: Props) {
  return (
    <section className="panel">
      {!project.worldInitialized && (
        <>
          <h3>Initialiser le monde</h3>
          <button disabled={busy} onClick={() => runAction(onSeedPreview)}>
            Proposer la mémoire initiale
          </button>
          {seed && (
            <>
              <label>
                Propositions à relire et corriger
                <textarea
                  className="code"
                  rows={12}
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
              </label>
              <button disabled={busy} onClick={() => runAction(onSeedApply)}>
                Valider les propositions
              </button>
            </>
          )}
        </>
      )}
      <h3>État de la mémoire</h3>
      {!memory ||
      (memory.state.entities.length === 0 &&
        memory.state.facts.length === 0 &&
        memory.state.knowledge.length === 0) ? (
        <p className="muted">Aucune mémoire structurée pour le moment.</p>
      ) : (
        <>
          <h4>Entités ({memory.state.entities.length})</h4>
          {memory.state.entities.length === 0 ? (
            <p className="muted">Aucune entité.</p>
          ) : (
            <ul>
              {memory.state.entities.map((entity) => (
                <li key={entity.key}>
                  {entity.name} <span className="muted">({entity.kind})</span>
                </li>
              ))}
            </ul>
          )}
          <h4>Faits ({memory.state.facts.length})</h4>
          {memory.state.facts.length === 0 ? (
            <p className="muted">Aucun fait.</p>
          ) : (
            <ul>
              {memory.state.facts.map((fact) => (
                <li key={fact.ref}>
                  <strong>{fact.ref}</strong> · {fact.text}{' '}
                  <span className="muted">
                    ({fact.importance}, {fact.public ? 'public' : 'privé'}, {fact.status})
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h4>Connaissances ({memory.state.knowledge.length})</h4>
          {memory.state.knowledge.length === 0 ? (
            <p className="muted">Aucune connaissance spécifique.</p>
          ) : (
            <ul>
              {memory.state.knowledge.map((item, index) => (
                <li key={`${item.character}-${item.fact_ref ?? item.content}-${index}`}>
                  {item.character} · {item.content ?? item.fact_ref} · {item.status}
                  {item.is_false ? ' · croyance fausse' : ''}
                  {item.ended ? ' · terminée' : ''}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <h3>Résumés</h3>
      {!memory || memory.summaries.length === 0 ? (
        <p className="muted">Aucun résumé généré pour le moment.</p>
      ) : (
        memory.summaries.map((summary) => (
          <details key={summary.id}>
            <summary>
              Niveau {summary.level} · tours {summary.fromTurn}–{summary.toTurn}
            </summary>
            <p className="prose">{summary.text}</p>
          </details>
        ))
      )}
      <h3>Correction manuelle</h3>
      <p>
        Pour modifier un fait HIGH, ajoutez l’identifiant du tour justificatif dans <code>turnId</code> et
        l’index de l’événement dans <code>resolution_event</code>.
      </p>
      <label>
        Propositions JSON
        <textarea
          className="code"
          rows={9}
          value={correction}
          onChange={(event) => setCorrection(event.target.value)}
        />
      </label>
      <button disabled={busy} onClick={() => runAction(onApplyCorrection)}>
        Appliquer
      </button>
      {debug !== null && <pre>{JSON.stringify(debug, null, 2)}</pre>}
    </section>
  );
}
