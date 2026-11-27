import { JUDGE_CRITERIA, type CombinedWinner } from './blindJudge.js';
import type { CostEstimate } from './costEstimate.js';
import type { JudgeOutcome, JudgeResult, PlayedConfiguration } from './evaluationRun.js';
import type { FrictionReport, PathReport } from './friction.js';
import { aggregateMeasures, type DirectionOutcome } from './turnMeasures.js';

/**
 * Rendu des résultats. La synthèse est publiable sur le ticket : elle ne contient que des nombres et des
 * verdicts, jamais de prose, de saisie, de justification du juge ni de nom de projet. Le rapport complet,
 * avec la prose, reste sur le poste (`eval-output/`, non versionné).
 */

export type EvaluationMode = 'simulé' | 'réel';

export type EvaluationResult = {
  mode: EvaluationMode;
  model: string;
  runAt: Date;
  configurations: readonly PlayedConfiguration[];
  judge: JudgeOutcome;
  friction: FrictionReport;
};

/** Said in the synthesis: the verdicts compare whole experiences, not one factor. */
export const CONFOUNDED_FACTORS = 'Facteurs confondus : la V2 change à la fois l’analyse, la direction, la mémoire et les prompts de '
  + 'restitution (Narrateur scénique, Gardien des Intentions). L’évaluation compare deux expériences complètes ; '
  + 'elle n’isole l’effet d’aucun facteur.';

const usd = (microUsd: number) => `${(microUsd / 1_000_000).toFixed(4)} $`;
const seconds = (ms: number) => `${(ms / 1_000).toFixed(1)} s`;
const percent = (share: number | null) => share === null ? '—' : `${Math.round(share * 100)} %`;
const DIRECTION_LABELS: Record<DirectionOutcome, string> = { absente: '—', reussie: 'oui', repli: 'repli' };
const WINNER_LABELS: Record<CombinedWinner, string> = { v1: 'type V1', v2: 'V2', egalite: 'égalité', incertain: 'incertain (passes en désaccord)' };

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)]
    .join('\n');
}

function judgeCost(judge: JudgeOutcome): string {
  if (judge.status !== 'fait') return '—';
  return judge.costMicroUsd === null ? 'non tarifé' : usd(judge.costMicroUsd);
}

function measuresSection(configurations: readonly PlayedConfiguration[], judge: JudgeOutcome): string {
  const aggregates = configurations.map((played) => ({ played, measures: aggregateMeasures(played.turns.map((turn) => turn.measure)) }));
  const scenarioCost = aggregates.reduce((sum, { measures }) => sum + measures.totalCostMicroUsd, 0);
  const judgeMicroUsd = judge.status === 'fait' ? judge.costMicroUsd : null;
  const complete = aggregates.every(({ measures }) => measures.costComplete) && judgeMicroUsd !== null;
  const totalCost = `Coût total de l’évaluation, juge compris : ${usd(scenarioCost + (judgeMicroUsd ?? 0))}`
    + `${complete ? '' : ' (incomplet : un appel au moins n’est pas tarifé)'} ; juge seul : ${judgeCost(judge)}.`;
  const summary = table(['Mesure', ...aggregates.map(({ played }) => played.configuration.key.toUpperCase())], [
    ['Tours en échec', ...aggregates.map(({ measures }) => `${measures.failedTurns} / ${measures.turns} (${percent(measures.failureRate)})`)],
    ['Coût total', ...aggregates.map(({ measures }) => `${usd(measures.totalCostMicroUsd)}${measures.costComplete ? '' : ' (incomplet)'}`)],
    ['Coût moyen par tour', ...aggregates.map(({ measures }) => usd(measures.meanCostMicroUsd))],
    ['Durée moyenne / max par tour', ...aggregates.map(({ measures }) => `${seconds(measures.meanDurationMs)} / ${seconds(measures.maxDurationMs)}`)],
    ['Appels LLM (dont en échec)', ...aggregates.map(({ measures }) => `${measures.calls} (${measures.failedCalls})`)],
    ['Replis du Directeur', ...aggregates.map(({ measures }) => measures.directedTurns ? `${measures.directorFallbacks} / ${measures.directedTurns}` : '—')],
    ['Développements scène / hors champ', ...aggregates.map(({ measures }) => `${measures.sceneDevelopments} / ${measures.offscreenDevelopments}`)],
    ['Part de l’historique, premier → dernier tour', ...aggregates.map(({ measures }) => `${percent(measures.firstHistoryShare)} → ${percent(measures.lastHistoryShare)}`)],
    ['Prose moyenne (mots)', ...aggregates.map(({ measures }) => String(Math.round(measures.meanProseWords)))],
  ]);
  const perTurn = configurations.map((played) => [
    `### ${played.configuration.key.toUpperCase()} tour par tour`,
    table(['Tour', 'Sollicite', 'Statut', 'Coût', 'Durée', 'Appels', 'Direction', 'Dév. scène / hors champ', 'Historique', 'Mots'],
      played.turns.map(({ measure }) => [
        String(measure.index), measure.probe, measure.status === 'completed' ? 'ok' : 'échec', usd(measure.costMicroUsd),
        seconds(measure.durationMs), `${measure.calls}${measure.failedCalls ? ` (${measure.failedCalls} en échec)` : ''}`,
        DIRECTION_LABELS[measure.direction], `${measure.sceneDevelopments} / ${measure.offscreenDevelopments}`,
        percent(measure.historyShare), String(measure.proseWords),
      ])),
  ].join('\n\n'));
  return ['## Mesures', summary, totalCost, ...perTurn].join('\n\n');
}

function judgeSection(outcome: JudgeOutcome): string {
  if (outcome.status === 'en-attente') return '## Jugement en aveugle\n\nEn attente : les mesures sont écrites avant le jugement.';
  if (outcome.status === 'echec') {
    return `## Jugement en aveugle\n\nÉchec après une relance (${outcome.reason}) : les mesures et les récits restent valables.`;
  }
  const judge = outcome.result;
  const passLabel = (index: number) => `Passe ${index + 1} (A = ${judge.passes[index]?.key.A.toUpperCase()})`;
  return ['## Jugement en aveugle', table(
    ['Critère', ...judge.passes.map((_, index) => passLabel(index)), 'Verdict'],
    JUDGE_CRITERIA.map(({ key, label }) => [
      label, ...judge.passes.map((pass) => WINNER_LABELS[pass.verdict[key].winner]), WINNER_LABELS[judge.combined[key]],
    ]),
  ), 'Un critère n’est tranché que si les deux passes, dans deux ordres opposés, désignent la même version.', CONFOUNDED_FACTORS]
    .join('\n\n');
}

function pathLine(path: PathReport): string {
  return `${path.actions} actions${path.unconfirmed.length ? ` (à revérifier : ${path.unconfirmed.join(' ; ')})` : ''}`;
}

const holds = (value: boolean | null) => value === null ? 'illisible' : value ? 'oui' : 'non';

function frictionSection(friction: FrictionReport): string {
  const { paths, checks } = friction;
  return ['## Friction', table(['Configuration', 'Parcours', 'Actions'], [
    [`V1 (main${friction.v1Reference ? ` ${friction.v1Reference}` : ''})`, paths.v1.label, pathLine(paths.v1)],
    ['Nouveau projet V2, sans rien configurer', paths.newProject.label, pathLine(paths.newProject)],
    ['V2 évaluée', paths.v2.label, pathLine(paths.v2)],
  ]), table(['Propriété', 'V2 (cette branche)', 'V1 (main)'],
    checks.v2.map((check, index) => [check.label, holds(check.holds), holds(checks.v1[index]?.holds ?? null)]))].join('\n\n');
}

function header(result: EvaluationResult, title: string): string {
  return [
    `# ${title}`,
    `Mode : ${result.mode} · modèle : ${result.model} · ${result.runAt.toISOString()}`,
    table(['Configuration', 'Équipe'], result.configurations.map((played) => [
      played.configuration.label, played.team.join(', '),
    ])),
  ].join('\n\n');
}

export function renderPublicSynthesis(result: EvaluationResult): string {
  return [
    header(result, 'Évaluation V2 de bout en bout : synthèse'),
    measuresSection(result.configurations, result.judge),
    judgeSection(result.judge),
    frictionSection(result.friction),
  ].join('\n\n') + '\n';
}

function proseSection(configurations: readonly PlayedConfiguration[], inputs: readonly string[]): string {
  return ['## Récits', ...inputs.map((input, index) => [
    `### Tour ${index + 1}`, `> ${input}`,
    ...configurations.map((played) => {
      const turn = played.turns[index];
      return `#### ${played.configuration.key.toUpperCase()}\n\n${turn?.prose ?? `(échec : ${turn?.errorCode ?? 'tour non joué'})`}`;
    }),
  ].join('\n\n'))].join('\n\n');
}

function justificationSection(outcome: JudgeOutcome): string {
  if (outcome.status !== 'fait') return '';
  const judge: JudgeResult = outcome.result;
  return ['## Justifications du juge', ...judge.passes.map((pass, index) => [
    `### Passe ${index + 1} (A = ${pass.key.A.toUpperCase()}, B = ${pass.key.B.toUpperCase()})`,
    ...JUDGE_CRITERIA.map(({ key, label }) => `- **${label}** : ${WINNER_LABELS[pass.verdict[key].winner]}. ${pass.verdict[key].why}`),
  ].join('\n'))].join('\n\n');
}

/** The local report: the synthesis plus projects, prose and the judge's reasons. Never versioned. */
export function renderFullReport(result: EvaluationResult, inputs: readonly string[]): string {
  const projects = result.configurations.map((played) => `- ${played.configuration.key.toUpperCase()} : /projects/${played.projectId}`);
  return [
    renderPublicSynthesis(result).trimEnd(),
    ['## Projets d’évaluation', ...projects].join('\n'),
    justificationSection(result.judge),
    proseSection(result.configurations, inputs),
  ].filter(Boolean).join('\n\n') + '\n';
}

/** The estimate of a real run, publishable: numbers only. */
export function renderEstimate(
  estimate: CostEstimate, model: string, rates: readonly { window: string; rate: { inputPerMillion: number; outputPerMillion: number } }[],
  turns: number,
): string {
  const range = (low: number, high: number, format: (value: number) => string) => `${format(low)} à ${format(high)}`;
  const count = (value: number) => Math.round(value).toLocaleString('fr-FR');
  const row = (label: string, bounds: CostEstimate['total'], perTurn: boolean) => [
    label,
    `${range(bounds.low.calls, bounds.high.calls, count)}${perTurn
      ? ` (${range(bounds.low.calls / turns, bounds.high.calls / turns, (value) => value.toFixed(1))} par tour)` : ''}`,
    range(bounds.low.inputTokens, bounds.high.inputTokens, count),
    range(bounds.low.outputTokens, bounds.high.outputTokens, count),
    range(bounds.low.usd, bounds.high.usd, (value) => `${value.toFixed(4)} $`),
  ];
  return [
    '# Estimation du coût réel de l’évaluation V2',
    `Modèle visé (\`LLM_MODEL\`) : ${model}. Tarifs \`llm_price\` en $ par million de tokens, entrée / sortie : ${
      rates.map(({ window, rate }) => `${window} ${rate.inputPerMillion} / ${rate.outputPerMillion}`).join(' ; ')}.`,
    `Scénario : ${turns} tours par configuration, puis deux passes du juge.`,
    table(['Poste', 'Appels', 'Tokens d’entrée', 'Tokens de sortie', 'Coût'], [
      ...Object.entries(estimate.byConfiguration).map(([key, bounds]) =>
        row(key === 'juge' ? 'Juge (2 passes)' : key.toUpperCase(), bounds, key !== 'juge')),
      row('**Total**', estimate.total, false),
    ]),
    'Basse : prose de 700 mots par tour, tarif le moins cher, aucune relance. Haute : prose de 2 400 mots, tarif le plus cher, '
    + '25 % de relances des appels structurés, juge compris. Entrées mesurées sur les prompts réels du pipeline joué en simulé, '
    + 'à 4 caractères par token, ce qui sous-estime un peu le français ; sorties structurées de taille typique ; '
    + 'remise du cache ignorée.',
  ].join('\n\n') + '\n';
}
