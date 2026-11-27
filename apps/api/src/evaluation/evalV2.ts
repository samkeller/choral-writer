import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { configuredProvider, loadConfig, type AppConfig } from '../config.js';
import { db, pool } from '../db/client.js';
import { localDatabaseRefusal } from '../db/localDatabaseGuard.js';
import { insertLlmCall } from '../db/repositories/llmCallRepository.js';
import { createCallLLM } from '../llm/call-llm.js';
import { createProviderStrategy, type ProviderStrategy } from '../llm/providers/index.js';
import { resolveCost, selectRate } from '../llm/usage/pricingResolver.js';
import { toPriceRate, UsageRepository } from '../llm/usage/usageRepository.js';
import { createUsageService } from '../llm/usage/usageService.js';
import { AgentRepository } from '../modules/agents/repository/agentsRepository.js';
import { AgentsService } from '../modules/agents/services/agentsService.js';
import { createChatBranchService, createChatService } from '../modules/chat/index.js';
import { MemoriesService } from '../modules/memories/services/memoriesService.js';
import { ProjectsService } from '../modules/projects/services/projectServices.js';
import { createTraceService } from '../modules/traces/index.js';
import { estimateCost, estimatedCalls, rateBounds, type EstimateBound, type EstimatedCall } from './costEstimate.js';
import { finishEvaluation } from './evaluationOutput.js';
import { renderEstimate, type EvaluationMode } from './evaluationReport.js';
import {
  judgedStory, judgeStories, playConfiguration, playedPair, type EvaluationServices, type JudgeResult, type PlayedConfiguration,
} from './evaluationRun.js';
import { EVALUATION_CONFIGURATIONS, SCENARIO_INPUTS, SCENARIO_NAME, SCENARIO_SYSTEM_PROMPT } from './evaluationScenario.js';
import { frictionReport, type SourceReader } from './friction.js';
import { createSimulatedClient, SIMULATED_MODEL, simulatedProvider } from './simulatedLlm.js';

/**
 * `pnpm eval:v2` : évaluation de bout en bout de la V2 (#43).
 *
 * - sans option, joue le scénario avec le fournisseur simulé, rapport compris, sans aucun appel réseau ;
 * - `--estimate` estime le coût réel du scénario complet, sans aucun appel au fournisseur ;
 * - `--real` appelle le vrai fournisseur LLM de `.env` : c'est payant, à ne lancer qu'avec l'accord du mainteneur.
 *
 * Les projets d'évaluation sont créés dans la base locale de `.env` (`--allow-remote` pour une autre),
 * gardés après un jeu réel et supprimés après un jeu simulé, même en échec, sauf avec `--keep`.
 */

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OUTPUT_DIR = join(REPO_ROOT, 'eval-output');
/** Prose lengths observed in real stories (#4): the estimate's low and high bounds, and the simulation's typical one. */
const PROSE_WORDS: Record<EstimateBound | 'typical', number> = { low: 700, high: 2_400, typical: 1_200 };
const INPUTS = SCENARIO_INPUTS.map((input) => input.content);

type CallLLM = ReturnType<typeof createCallLLM>;
type Client = Parameters<typeof createCallLLM>[0]['client'];

function evaluationLlm(config: AppConfig, mode: EvaluationMode, client: Client) {
  const real = mode === 'réel';
  const model = real ? config.llmModel : SIMULATED_MODEL;
  const provider: ProviderStrategy = real
    ? createProviderStrategy(configuredProvider(config), { apiKey: config.llmApiKey, baseUrl: config.llmBaseUrl })
    : simulatedProvider;
  const apiKey = real ? config.llmApiKey : undefined;
  return {
    model, provider,
    pipeline: createCallLLM({ client, traces: { insert: insertLlmCall }, model, provider, apiKey, usage: createUsageService(db) }),
    // The judge's calls belong to no project: their traces stay in memory and the script prices them.
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

/**
 * Plays every configuration and hands the played ones to `work`. Unless `keep`, the projects are removed
 * afterwards, also when playing or `work` failed, so that no simulated project is left behind.
 */
async function withPlayedScenario<T>(
  services: EvaluationServices, runLabel: string, keep: boolean, work: (played: PlayedConfiguration[]) => Promise<T>,
): Promise<T> {
  const played: PlayedConfiguration[] = [];
  try {
    for (const configuration of EVALUATION_CONFIGURATIONS) {
      const key = configuration.key.toUpperCase();
      played.push(await playConfiguration(services, {
        configuration, projectName: `Évaluation V2 · ${key} · ${runLabel}`, systemPrompt: SCENARIO_SYSTEM_PROMPT, inputs: SCENARIO_INPUTS,
      }, ({ measure }) => console.log(`${key} tour ${measure.index}/${SCENARIO_INPUTS.length} : ${measure.status === 'completed' ? 'ok' : 'échec'}, `
        + `${(measure.costMicroUsd / 1_000_000).toFixed(4)} $, ${(measure.durationMs / 1_000).toFixed(1)} s, ${measure.calls} appels`)));
    }
    return await work(played);
  } finally {
    if (keep) console.log(played.map((item) => `Projet ${item.configuration.key.toUpperCase()} : /projects/${item.projectId}`).join('\n'));
    else {
      // Removes what the database holds even when playing stopped half-way.
      const ids = (await services.projects.list()).filter((project) => project.name.startsWith('Évaluation V2 · ') && project.name.endsWith(`· ${runLabel}`)).map((project) => project.id);
      for (const id of ids) await services.projects.remove(id);
      console.log(`${ids.length} projets d’évaluation supprimés (--keep pour les garder).`);
    }
  }
}

const readCurrent: SourceReader = (file) => {
  try {
    return readFileSync(join(REPO_ROOT, file), 'utf8');
  } catch {
    return null;
  }
};

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

/** V1 is `main`, fetched first so that both versions are measured by the same evidence on an up-to-date reference. */
function v1Reader(): { read: SourceReader; reference: string | null } {
  try {
    git('fetch', '--quiet', 'origin', 'main');
  } catch {
    console.warn('git fetch origin main a échoué : la friction V1 est lue sur la copie locale de origin/main.');
  }
  let reference: string | null = null;
  try {
    reference = git('rev-parse', '--short', 'origin/main').trim();
  } catch {
    console.warn('origin/main est introuvable : la friction V1 sera « illisible ».');
  }
  const read: SourceReader = (file) => {
    try {
      return git('show', `origin/main:${file}`);
    } catch {
      return null;
    }
  };
  return { read, reference };
}

function runStamp(at: Date): string {
  return at.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/** Current rate of each price window of the model, as `llm_price` publishes it. */
async function currentRates(provider: string, model: string, at: Date) {
  const rows = await new UsageRepository(db).ratesFor(provider, model);
  return [...new Set(rows.map((row) => row.priceWindow))].flatMap((window) => {
    const rate = selectRate(rows.filter((row) => row.priceWindow === window), at, toPriceRate);
    return rate ? [{ window, rate }] : [];
  });
}

/** The judge's cost at the rate of the current window, as the usage ledger would price it; null when unpriced. */
async function judgeCostMicroUsd(provider: ProviderStrategy, model: string, judge: JudgeResult): Promise<number | null> {
  const at = new Date();
  const window = provider.priceWindow(at);
  const rate = (await currentRates(provider.name, model, at)).find((item) => item.window === window || item.window === 'all')?.rate ?? null;
  const costs = judge.passes.map((pass) => resolveCost({
    inputTokens: pass.inputTokens, outputTokens: pass.outputTokens, cachedInputTokens: null, providerCostUsd: null, rate,
  }).costMicroUsd);
  return costs.every((cost): cost is number => cost !== null) ? costs.reduce((sum, cost) => sum + cost, 0) : null;
}

async function evaluate(config: AppConfig, mode: EvaluationMode, keep: boolean): Promise<void> {
  const runAt = new Date();
  const client: Client = mode === 'réel'
    ? (await import('../llm/client.js')).openai
    : createSimulatedClient({ proseWords: PROSE_WORDS.typical });
  const llm = evaluationLlm(config, mode, client);
  const services = evaluationServices(llm.pipeline);
  const v1 = v1Reader();
  console.log(`Évaluation ${mode} du scénario « ${SCENARIO_NAME} » (${SCENARIO_INPUTS.length} tours), modèle ${llm.model}.`);
  await withPlayedScenario(services, runStamp(runAt), keep || mode === 'réel', async (played) => {
    const pair = playedPair(played);
    const directory = join(OUTPUT_DIR, `${mode === 'réel' ? 'reel' : 'simule'}-${runStamp(runAt)}`);
    console.log('Mesures écrites ; jugement en aveugle (deux passes)…');
    const result = await finishEvaluation(directory, {
      mode, model: llm.model, runAt, configurations: played, friction: frictionReport(readCurrent, v1.read, v1.reference),
    }, INPUTS,
    () => judgeStories(llm.judge, pair.v2.projectId, INPUTS, { v1: judgedStory(pair.v1), v2: judgedStory(pair.v2) }),
    (judge) => judgeCostMicroUsd(llm.provider, llm.model, judge));
    console.log(`Jugement : ${result.judge.status}.`);
    console.log(`Rapport local (avec la prose) : ${join(directory, 'rapport.md')}`);
    console.log(`Synthèse publiable (sans prose) : ${join(directory, 'synthese.md')}`);
  });
}

async function estimate(config: AppConfig): Promise<void> {
  const provider = configuredProvider(config);
  const rates = await currentRates(provider, config.llmModel, new Date());
  const bounds = rateBounds(rates.map(({ rate }) => rate));
  if (!bounds) throw new Error(`No price in llm_price for ${provider} / ${config.llmModel}: the estimate cannot be priced.`);
  const calls: Record<EstimateBound, EstimatedCall[]> = { low: [], high: [] };
  for (const bound of ['low', 'high'] as const) {
    console.log(`Jeu simulé, prose de ${PROSE_WORDS[bound]} mots…`);
    const services = evaluationServices(evaluationLlm(config, 'simulé', createSimulatedClient({ proseWords: PROSE_WORDS[bound] })).pipeline);
    calls[bound] = await withPlayedScenario(services, `estimation ${bound} ${runStamp(new Date())}`, false,
      async (played) => estimatedCalls(played, INPUTS, bound));
  }
  const markdown = renderEstimate(estimateCost(calls, bounds), config.llmModel, rates, SCENARIO_INPUTS.length);
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
