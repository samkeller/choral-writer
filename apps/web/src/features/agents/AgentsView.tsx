import type { Agent, BudgetReservation, Project } from '../../types.js';

type Props = {
  project: Project;
  agents: Agent[];
  reservations: BudgetReservation[];
  busy: boolean;
  editor: string;
  editId: string;
  setEditor: (value: string) => void;
  setEditId: (value: string) => void;
  runAction: (action: () => Promise<void>) => void;
  onSave: () => Promise<void>;
  onSettle: (reservationId: string, costUsd: number) => Promise<void>;
};

export function AgentsView({
  project,
  agents,
  reservations,
  busy,
  editor,
  editId,
  setEditor,
  setEditId,
  runAction,
  onSave,
  onSettle,
}: Props) {
  return (
    <section className="panel">
      <h3>Agents configurés</h3>
      <button
        className="secondary"
        onClick={() => {
          setEditId('settings');
          setEditor(JSON.stringify(project.settings, null, 2));
        }}
      >
        Budget du projet
      </button>
      {reservations.length > 0 && (
        <>
          <h3>Réservations de budget</h3>
          <p>
            Après une interruption, vérifiez le coût auprès du fournisseur avant de le renseigner. Une
            réservation non rapprochée reste comptabilisée.
          </p>
          {reservations.map((reservation) => (
            <div className="reservation" key={reservation.id}>
              <p>
                Réservation {reservation.id.slice(0, 8)} · estimation {reservation.amount} USD
                {reservation.turnId && ` · tour ${reservation.turnId.slice(0, 8)}`}
                {reservation.settled && ` · coût confirmé ${reservation.settledAmount} USD`}
              </p>
              {!reservation.settled && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const costUsd = Number(new FormData(form).get('costUsd'));
                    runAction(async () => {
                      if (!window.confirm('Confirmer le coût vérifié auprès du fournisseur ?')) return;
                      await onSettle(reservation.id, costUsd);
                    });
                  }}
                >
                  <label>
                    Coût confirmé (USD)
                    <input name="costUsd" type="number" min="0" step="any" required />
                  </label>
                  <button disabled={busy}>Rapprocher</button>
                </form>
              )}
            </div>
          ))}
        </>
      )}
      <button
        className="secondary"
        onClick={() => {
          setEditId('new');
          setEditor(
            JSON.stringify(
              {
                key: 'analyse',
                name: 'Analyse',
                kind: 'analysis',
                model: agents[0]?.model ?? '',
                system_prompt: 'Analyse la situation.',
                params: {},
                context: {},
                schedule: { mode: 'always' },
                required: false,
                enabled: true,
              },
              null,
              2,
            ),
          );
        }}
      >
        Ajouter un agent d’analyse
      </button>
      {agents.length === 0 && <p className="muted">Aucun agent configuré.</p>}
      {agents.map((agent) => (
        <button
          className="project"
          key={agent.id}
          onClick={() => {
            setEditId(agent.id);
            setEditor(
              JSON.stringify(
                {
                  key: agent.key,
                  name: agent.name,
                  kind: agent.kind,
                  system_prompt: agent.systemPrompt,
                  model: agent.model,
                  params: agent.params,
                  context: agent.contextSpec,
                  schedule: agent.schedule,
                  required: agent.required,
                  enabled: agent.enabled,
                },
                null,
                2,
              ),
            );
          }}
        >
          {agent.name} · {agent.kind}
        </button>
      ))}
      {editId && (
        <>
          <label>
            Configuration JSON
            <textarea
              className="code"
              rows={18}
              value={editor}
              onChange={(event) => setEditor(event.target.value)}
            />
          </label>
          <button disabled={busy} onClick={() => runAction(onSave)}>
            Enregistrer
          </button>
          <button className="secondary" disabled={busy} onClick={() => setEditId('')}>
            Annuler
          </button>
        </>
      )}
    </section>
  );
}
