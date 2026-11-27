import { JUDGE_CRITERIA, type CombinedWinner } from './blindJudge.js';
import type { JudgeResult, PlayedConfiguration } from './evaluationRun.js';
import type { FrictionReport, PathReport } from './friction.js';
import { aggregateMeasures, type DirectionOutcome } from './turnMeasures.js';

/**
 * Rendu des résultats. La synthèse est publiable sur le ticket : elle ne contient que des nombres et des
 * verdicts, jamais de prose, de saisie, de justification du juge ni de nom de projet. Le rapport complet,
 * avec la prose, reste sur le poste (`eval-output/`, non versionné).
 */

export type EvaluationResult = {
  mode: 'simulé' | 'réel';
  model: string;
  runAt: Date;
  configurations: readonly PlayedConfiguration[];
  judge: JudgeResult | null;
  friction: FrictionReport;
};

const usd = (microUsd: number) => `${(microUsd / 1_000_000).toFixed(4)} $`;
const seconds = (ms: number) => `${(ms / 1_000).toFixed(1)} s`;
const percent = (share: number | null) => share === null ? '—' : `${Math.round(share * 100)} %`;
const DIRECTION_LABELS: Record<DirectionOutcome, string> = { absente: '—', reussie: 'oui', repli: 'repli' };
const WINNER_LABELS: Record<CombinedWinner, string> = { v1: 'type V1', v2: 'V2', egalite: 'égalité', incertain: 'incertain (l’ordre a décidé)' };

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)]
    .join('\n');
}

function measuresSection(configurations: readonly PlayedConfiguration[]): string {
  const aggregates = configurations.map((played) => ({ played, measures: aggregateMeasures(played.turns.map((turn) => turn.measure)) }));
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
  return ['## Mesures', summary, ...perTurn].join('\n\n');
}

function judgeSection(judge: JudgeResult | null): string {
  if (!judge) return '## Jugement en aveugle\n\nNon lancé.';
  const passLabel = (index: number) => `Passe ${index + 1} (A = ${judge.passes[index]?.key.A.toUpperCase()})`;
  return ['## Jugement en aveugle', table(
    ['Critère', ...judge.passes.map((_, index) => passLabel(index)), 'Verdict'],
    JUDGE_CRITERIA.map(({ key, label }) => [
      label, ...judge.passes.map((pass) => WINNER_LABELS[pass.verdict[key].winner]), WINNER_LABELS[judge.combined[key]],
    ]),
  ), 'Un critère n’est tranché que si les deux passes, dans deux ordres opposés, désignent la même version.'].join('\n\n');
}

function pathLine(path: PathReport): string {
  return `${path.actions} actions${path.unconfirmed.length ? ` (à revérifier : ${path.unconfirmed.join(' ; ')})` : ''}`;
}

const holds = (value: boolean | null) => value === null ? 'illisible' : value ? 'oui' : 'non';

function frictionSection(friction: FrictionReport, configurations: readonly PlayedConfiguration[]): string {
  const v1 = configurations.find((played) => played.configuration.team === null);
  const firstTurn = v1?.turns[0];
  return ['## Friction', table(['Parcours', 'V2 (cette branche)', 'V1 (main)'], [
    [friction.firstTurn.v2.label, pathLine(friction.firstTurn.v2), pathLine(friction.firstTurn.v1)],
    [friction.v2Team.label, pathLine(friction.v2Team), 'sans objet'],
    ...friction.checks.v2.map((check, index) => [check.label, holds(check.holds), holds(friction.checks.v1[index]?.holds ?? null)]),
    ...(firstTurn ? [['Premier tour joué sans rien configurer (observé)', firstTurn.measure.status === 'completed' ? 'oui' : 'non', '—']] : []),
  ])].join('\n\n');
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
    measuresSection(result.configurations),
    judgeSection(result.judge),
    frictionSection(result.friction, result.configurations),
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

function justificationSection(judge: JudgeResult | null): string {
  if (!judge) return '';
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
