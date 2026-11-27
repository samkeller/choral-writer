import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { configuredProvider, loadConfig, type AppConfig } from '../config.js';
import { db, pool } from '../db/client.js';
import { localDatabaseRefusal } from '../db/localDatabaseGuard.js';
import { insertLlmCall } from '../db/repositories/llmCallRepository.js';
import { createCallLLM } from '../llm/call-llm.js';
import { estimateTokens } from '../llm/contextComposition.js';
import { createProviderStrategy } from '../llm/providers/index.js';
import { selectRate } from '../llm/usage/pricingResolver.js';
import { toPriceRate, UsageRepository } from '../llm/usage/usageRepository.js';
import { createUsageService } from '../llm/usage/usageService.js';
import { AgentRepository } from '../modules/agents/repository/agentsRepository.js';
import { AgentsService } from '../modules/agents/services/agentsService.js';
import { createChatBranchService, createChatService } from '../modules/chat/index.js';
import { MemoriesService } from '../modules/memories/services/memoriesService.js';
import { ProjectsService } from '../modules/projects/services/projectServices.js';
import { createTraceService } from '../modules/traces/index.js';
import { judgeMessages } from './blindJudge.js';
import {
  estimateCost, outputTokensFor, rateBounds, type CostEstimate, type EstimateBound, type EstimatedCall, type EstimatedStage,
} from './costEstimate.js';
import { renderFullReport, renderPublicSynthesis, type EvaluationResult } from './evaluationReport.js';
import {
  judgedStory, judgeStories, playConfiguration, type EvaluationServices, type PlayedConfiguration,
} from './evaluationRun.js';
import { EVALUATION_CONFIGURATIONS, SCENARIO_INPUTS, SCENARIO_NAME, SCENARIO_SYSTEM_PROMPT } from './evaluationScenario.js';
import { frictionReport, type SourceReader } from './friction.js';
import { createSimulatedClient, SIMULATED_MODEL, simulatedProvider } from './simulatedLlm.js';
import { aggregateMeasures } from './turnMeasures.js';

/**
 * `pnpm eval:v2` : évaluation de bout en bout de la V2 (#43).
 *
 * - sans option, joue le scénario avec le fournisseur simulé, rapport compris, sans aucun appel réseau ;
 * - `--estimate` estime le coût réel du scénario complet, sans aucun appel au fournisseur ;
 * - `--real` appelle le vrai fournisseur LLM de `.env` : c'est payant, à ne lancer qu'avec l'accord du mainteneur.
 *
 * Les projets d'évaluation sont créés dans la base locale de `.env` (`--allow-remote` pour une autre),
 * gardés après un jeu réel et supprimés après un jeu simulé, sauf avec `--keep`.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OUTPUT_DIR = join(REPO_ROOT, 'eval-output');
/** Prose lengths observed in real stories (#4): the estimate's low and high bounds, and the simulation's typical one. */
const PROSE_WORDS: Record<EstimateBound | 'typical', number> = { low: 700, high: 2_400, typical: 1_200 };
const INPUTS = SCENARIO_INPUTS.map((input) => input.content);

type Mode = 'simulé' | 'réel';
type CallLLM = ReturnType<typeof createCallLLM>;

function evaluationLlm(config: AppConfig, mode: Mode, client: Parameters<typeof createCallLLM>[0]['client']) {
  const real = mode === 'réel';
  const model = real ? config.llmModel : SIMULATED_MODEL;
  const provider = real
    ? createProviderStrategy(configuredProvider(config), { apiKey: config.llmApiKey, baseUrl: config.llmBaseUrl })
    : simulatedProvider;
  const apiKey = real ? config.llmApiKey : undefined;
  return {
    model,
    pipeline: createCallLLM({ client, traces: { insert: insertLlmCall }, model, provider, apiKey, usage: createUsageService(db) }),
    // The judge's calls belong to no project: their traces stay in memory and their cost is reported by the script.
    judge: createCallLLM({ client, traces: { insert: async () => {} }, model, provider, apiKey }),
  };
}

function evaluationServices(callLLM: CallLLM): EvaluationServices {
  const projects = new ProjectsService(db, createChatBranchService);
  const memories = new MemoriesService(db, projects, callLLM);
  return {
    projects,
    agents: new AgentsService(db, projects),
    memories,
    chat: createChatService(db, projects, callLLM, memories),
    traces: createTraceService(db),
  };
}

async function playScenario(services: EvaluationServices, runLabel: string): Promise<PlayedConfiguration[]> {
  const played: PlayedConfiguration[] = [];
  for (const configuration of EVALUATION_CONFIGURATIONS) {
    const key = configuration.key.toUpperCase();
    played.push(await playConfiguration(services, {
      configuration, projectName: `Évaluation V2 · ${key} · ${runLabel}`, systemPrompt: SCENARIO_SYSTEM_PROMPT, inputs: SCENARIO_INPUTS,
    }, ({ measure }) => console.log(`${key} tour ${measure.index}/${SCENARIO_INPUTS.length} : ${measure.status === 'completed' ? 'ok' : 'échec'}, `
      + `${(measure.costMicroUsd / 1_000_000).toFixed(4)} $, ${(measure.durationMs / 1_000).toFixed(1)} s, ${measure.calls} appels`)));
  }
  return played;
}

async function removeProjects(services: EvaluationServices, played: readonly PlayedConfiguration[]): Promise<void> {
  for (const { projectId } of played) await services.projects.remove(projectId);
}

const readCurrent: SourceReader = (file) => {
  try {
    return readFileSync(join(REPO_ROOT, file), 'utf8');
  } catch {
    return null;
  }
};

/** V1 is `main`: read through git so both versions are measured by the same evidence. */
const readV1: SourceReader = (file) => {
  try {
    return execFileSync('git', ['show', `origin/main:${file}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

function runStamp(at: Date): string {
  return at.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

async function evaluate(config: AppConfig, mode: Mode, keep: boolean): Promise<void> {
  const runAt = new Date();
  const client = mode === 'réel'
    ? (await import('../llm/client.js')).openai
    : createSimulatedClient({ proseWords: PROSE_WORDS.typical });
  const llm = evaluationLlm(config, mode, client);
  const services = evaluationServices(llm.pipeline);
  console.log(`Évaluation ${mode} du scénario « ${SCENARIO_NAME} » (${SCENARIO_INPUTS.length} tours), modèle ${llm.model}.`);
  const played = await playScenario(services, runStamp(runAt));
  const [v1, v2] = ['v1', 'v2'].map((key) => played.find((item) => item.configuration.key === key));
  if (!v1 || !v2) throw new Error('Both configurations must have been played.');
  console.log('Jugement en aveugle (deux passes)…');
  const judge = await judgeStories(llm.judge, v2.projectId, INPUTS, { v1: judgedStory(v1), v2: judgedStory(v2) });
  const result: EvaluationResult = { mode, model: llm.model, runAt, configurations: played, judge, friction: frictionReport(readCurrent, readV1) };

  const directory = join(OUTPUT_DIR, `${mode === 'réel' ? 'reel' : 'simule'}-${runStamp(runAt)}`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'rapport.md'), renderFullReport(result, INPUTS));
  writeFileSync(join(directory, 'synthese.md'), renderPublicSynthesis(result));
  writeFileSync(join(directory, 'mesures.json'), `${JSON.stringify({
    mode, model: llm.model, runAt,
    configurations: played.map(({ configuration, team, turns }) => ({
      key: configuration.key, team, aggregate: aggregateMeasures(turns.map((turn) => turn.measure)), turns: turns.map((turn) => turn.measure),
    })),
    judge: { combined: judge.combined, passes: judge.passes.map(({ key, inputTokens, outputTokens }) => ({ key, inputTokens, outputTokens })) },
    friction: result.friction,
  }, null, 2)}\n`);
  console.log(`Rapport local (avec la prose) : ${join(directory, 'rapport.md')}`);
  console.log(`Synthèse publiable (sans prose) : ${join(directory, 'synthese.md')}`);

  if (mode === 'simulé' && !keep) {
    await removeProjects(services, played);
    console.log('Projets simulés supprimés (--keep pour les garder).');
  } else {
    console.log(played.map((item) => `Projet ${item.configuration.key.toUpperCase()} : /projects/${item.projectId}`).join('\n'));
  }
}

/** Calls of a simulated play as the estimate prices them, the judge's two passes included. */
function estimatedCalls(played: readonly PlayedConfiguration[], bound: EstimateBound): EstimatedCall[] {
  const calls = played.flatMap(({ configuration, turns }) => turns.flatMap((turn) => turn.calls.map((call): EstimatedCall => {
    if (!['analysis', 'direction', 'narrator', 'guardian'].includes(call.stage)) {
      throw new Error(`Unexpected stage "${call.stage}" in the estimate.`);
    }
    const stage = call.stage as EstimatedStage;
    return {
      configuration: configuration.key, stage, inputTokens: call.inputTokens ?? 0,
      outputTokens: outputTokensFor(stage, call.outputTokens ?? 0, bound),
    };
  })));
  const [v1, v2] = ['v1', 'v2'].map((key) => played.find((item) => item.configuration.key === key));
  if (!v1 || !v2) throw new Error('Both configurations must have been played.');
  const judgeInput = judgeMessages(INPUTS, { A: judgedStory(v1), B: judgedStory(v2) })
    .reduce((sum, message) => sum + estimateTokens(String(message.content)), 0);
  const judgeCall: EstimatedCall = { configuration: 'juge', stage: 'judge', inputTokens: judgeInput, outputTokens: outputTokensFor('judge', 0, bound) };
  return [...calls, judgeCall, judgeCall];
}

async function currentRates(provider: string, model: string, at: Date) {
  const rows = await new UsageRepository(db).ratesFor(provider, model);
  const windows = [...new Set(rows.map((row) => row.priceWindow))];
  return windows.flatMap((window) => {
    const rate = selectRate(rows.filter((row) => row.priceWindow === window), at, toPriceRate);
    return rate ? [{ window, rate }] : [];
  });
}

function renderEstimate(
  estimate: CostEstimate, model: string, rates: { window: string; rate: { inputPerMillion: number; outputPerMillion: number } }[],
): string {
  const turns = SCENARIO_INPUTS.length;
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
  const table = [
    ['Poste', 'Appels', 'Tokens d’entrée', 'Tokens de sortie', 'Coût'],
    ['---', '---', '---', '---', '---'],
    ...Object.entries(estimate.byConfiguration).map(([key, bounds]) =>
      row(key === 'juge' ? 'Juge (2 passes)' : key.toUpperCase(), bounds, key !== 'juge')),
    row('**Total**', estimate.total, false),
  ].map((cells) => `| ${cells.join(' | ')} |`).join('\n');
  return [
    '# Estimation du coût réel de l’évaluation V2',
    `Modèle visé (\`LLM_MODEL\`) : ${model}. Tarifs \`llm_price\` en $ par million de tokens, entrée / sortie : ${
      rates.map(({ window, rate }) => `${window} ${rate.inputPerMillion} / ${rate.outputPerMillion}`).join(' ; ')}.`,
    `Scénario : ${turns} tours par configuration, puis deux passes du juge.`,
    table,
    'Basse : prose de 700 mots par tour, tarif le moins cher, aucune relance. Haute : prose de 2 400 mots, tarif le plus cher, '
    + '25 % de relances des appels structurés. Entrées mesurées sur les prompts réels du pipeline joué en simulé ; '
    + 'sorties structurées de taille typique ; remise du cache ignorée.',
  ].join('\n\n') + '\n';
}

async function estimate(config: AppConfig): Promise<void> {
  const provider = configuredProvider(config);
  const rates = await currentRates(provider, config.llmModel, new Date());
  const bounds = rateBounds(rates.map(({ rate }) => rate));
  if (!bounds) throw new Error(`No price in llm_price for ${provider} / ${config.llmModel}: the estimate cannot be priced.`);
  const calls: Partial<Record<EstimateBound, EstimatedCall[]>> = {};
  for (const bound of ['low', 'high'] as const) {
    console.log(`Jeu simulé, prose de ${PROSE_WORDS[bound]} mots…`);
    const services = evaluationServices(evaluationLlm(config, 'simulé', createSimulatedClient({ proseWords: PROSE_WORDS[bound] })).pipeline);
    const played = await playScenario(services, `estimation ${bound}`);
    calls[bound] = estimatedCalls(played, bound);
    await removeProjects(services, played);
  }
  const markdown = renderEstimate(estimateCost({ low: calls.low ?? [], high: calls.high ?? [] }, bounds), config.llmModel, rates);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = join(OUTPUT_DIR, `estimation-${runStamp(new Date())}.md`);
  writeFileSync(file, markdown);
  console.log(`\n${markdown}\nEstimation écrite dans ${file}`);
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const known = new Set(['--real', '--estimate', '--keep', '--allow-remote']);
  const unknown = [...args].filter((arg) => !known.has(arg));
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.join(', ')}. Expected: ${[...known].join(', ')}.`);
  if (args.has('--real') && args.has('--estimate')) throw new Error('--real and --estimate are exclusive.');
  const config = loadConfig();
  const refusal = localDatabaseRefusal(config, { allowRemote: args.has('--allow-remote') }, 'Evaluation projects');
  if (refusal) throw new Error(refusal);
  await new AgentRepository(db).ensureLibrary();
  if (args.has('--estimate')) return estimate(config);
  return evaluate(config, args.has('--real') ? 'réel' : 'simulé', args.has('--keep'));
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
