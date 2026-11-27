import type { createCallLLM } from '../llm/call-llm.js';
import { toPublicError } from '../errors/errors.js';
import type { AgentsService } from '../modules/agents/services/agentsService.js';
import type { ChatService } from '../modules/chat/index.js';
import type { MemoriesService } from '../modules/memories/services/memoriesService.js';
import type { ProjectsService } from '../modules/projects/services/projectServices.js';
import type { TraceService } from '../modules/traces/index.js';
import {
  anonymize, combinePasses, deanonymize, judgeMessages, judgeVerdictSchema, swapped,
  type CombinedWinner, type CriterionKey, type JudgedStory, type Letter, type Side, type SideVerdict,
} from './blindJudge.js';
import type { EvaluationConfiguration, ScenarioInput } from './evaluationScenario.js';
import { measureTurn, type TurnMeasure } from './turnMeasures.js';

type CallLLM = ReturnType<typeof createCallLLM>;

export type EvaluationServices = {
  projects: ProjectsService;
  agents: AgentsService;
  memories: MemoriesService;
  chat: ChatService;
  traces: TraceService;
};

export type PlayedTurn = {
  measure: TurnMeasure;
  prose: string | null;
  /** Public error code of a failed turn, never its provider message. */
  errorCode: string | null;
  /** Calls of the turn as the cost estimate reads them. */
  calls: { stage: string; inputTokens: number | null; outputTokens: number | null }[];
};

export type PlayedConfiguration = {
  configuration: EvaluationConfiguration;
  projectId: string;
  /** Agents of the project as they ran, `name vN`. */
  team: string[];
  turns: PlayedTurn[];
};

/** Pins the configuration's team, then the tags each analysis agent reads, by name among the starting tags. */
async function configureTeam(services: EvaluationServices, projectId: string, branchId: string,
  team: NonNullable<EvaluationConfiguration['team']>): Promise<void> {
  await services.agents.configure(projectId, {
    agents: team.map(({ agentId, versionId }) => ({ agentId, versionId })),
  });
  for (const agent of team) {
    if (!agent.reads) continue;
    const view = await services.memories.get(projectId, branchId);
    const tagIds = agent.reads.map((name) => {
      const tag = view.state.tags.find((candidate) => candidate.name === name);
      if (!tag) throw new Error(`Starting tag "${name}" is missing from the evaluation project.`);
      return tag.id;
    });
    await services.memories.mutate(projectId, branchId, {
      expectedHeadTurnId: view.headTurnId, expectedRevisionId: view.revisionId,
      expectedCatalogRevisionId: view.catalogRevisionId,
      change: { op: 'setAgentRead', agentId: agent.agentId, read: { mode: 'selected', tagIds } },
    });
  }
}

/**
 * Creates an isolated project for the configuration and plays every input through the real pipeline,
 * as the user's « Envoyer » does. A failed turn is measured and the story goes on, as in the app.
 */
export async function playConfiguration(
  services: EvaluationServices,
  input: { configuration: EvaluationConfiguration; projectName: string; systemPrompt: string; inputs: readonly ScenarioInput[] },
  onTurn: (turn: PlayedTurn) => void = () => {},
): Promise<PlayedConfiguration> {
  const project = await services.projects.create({ name: input.projectName, systemPrompt: input.systemPrompt });
  const branchId = project.defaultBranchId;
  if (!branchId) throw new Error('A new project has no main branch.');
  if (input.configuration.team) await configureTeam(services, project.id, branchId, input.configuration.team);
  const team = (await services.agents.listForProject(project.id)).map((agent) => `${agent.name} v${agent.version}`);

  const turns: PlayedTurn[] = [];
  let headTurnId: string | null = null;
  for (const [index, scenarioInput] of input.inputs.entries()) {
    const result = await services.chat.run({
      operation: 'send', projectId: project.id, branchId, expectedHeadTurnId: headTurnId, content: scenarioInput.content,
    }, async () => {}, new AbortController().signal);
    headTurnId = result.turnId;
    const summary = await services.traces.summary(project.id, result.turnId);
    const turn: PlayedTurn = {
      measure: measureTurn({ index: index + 1, probe: scenarioInput.probe, status: result.status }, summary),
      prose: result.status === 'completed' ? result.message.content : null,
      errorCode: result.status === 'failed' ? toPublicError(result.error).code : null,
      calls: summary.calls.map(({ stage, inputTokens, outputTokens }) => ({ stage, inputTokens, outputTokens })),
    };
    turns.push(turn);
    onTurn(turn);
  }
  return { configuration: input.configuration, projectId: project.id, team, turns };
}

export type JudgePass = {
  /** Which configuration each letter stood for. */
  key: Record<Letter, Side>;
  verdict: SideVerdict;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type JudgeResult = { passes: JudgePass[]; combined: Record<CriterionKey, CombinedWinner> };

export function judgedStory(played: PlayedConfiguration): JudgedStory {
  return played.turns.map((turn) => turn.prose);
}

/**
 * Judges the two stories twice, in a random order then in the swapped one: a criterion the order
 * decides comes out « incertain ». Like attribution, the judge is a post-hoc analysis tool, hence its
 * stage; the caller's `callLLM` keeps its traces out of the database, so no project pays for it.
 */
export async function judgeStories(
  callLLM: CallLLM, projectId: string, inputs: readonly string[], stories: Record<Side, JudgedStory>,
  random: () => number = Math.random,
): Promise<JudgeResult> {
  const first = anonymize(stories, random);
  const passes: JudgePass[] = [];
  for (const order of [first, swapped(first)]) {
    const result = await callLLM({
      projectId, stage: 'attribution', schema: judgeVerdictSchema,
      messages: judgeMessages(inputs, order.presented),
    });
    if (!result.parsed) throw new Error('Judge verdict was not validated.');
    passes.push({
      key: order.key, verdict: deanonymize(result.parsed, order.key),
      inputTokens: result.inputTokens, outputTokens: result.outputTokens,
    });
  }
  return { passes, combined: combinePasses(passes.map((pass) => pass.verdict)) };
}
