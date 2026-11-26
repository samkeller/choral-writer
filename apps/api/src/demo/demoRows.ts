import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { v7 as uuidv7 } from 'uuid';
import {
  analysisEnvelopeSchema, memoryProposalsSchema,
  type AnalysisEnvelope, type LlmStage, type MemoryContext, type MemoryProposal, type MemoryResult, type MemoryState,
  type ProjectAgent, type TurnDirection,
} from '@choral-writer/shared';

import type {
  chatBranches, chatMessages, chatTurns, llmCall, llmUsage, memoryBanks, memoryRuns, memorySettings, projectAgents, projects,
} from '../db/schema.js';
import { resolveCost, type PriceRate } from '../llm/usage/pricingResolver.js';
import { memoryContext, formatMemoryContext, reduceProposals } from '../modules/memories/services/memoryState.js';
import {
  directorOutputContract, forbiddenNudgeTypes, identifyWhiteboard, isDirectorAgent, resolveDirection,
} from '../modules/chat/services/directorService.js';
import { narratorSystemPrompt } from '../modules/chat/services/narratorPrompt.js';
import { turnConfiguration } from '../modules/chat/services/turnConfiguration.js';
import { formatItem } from '../modules/chat/services/whiteboardFormat.js';
import { demoTags, type DemoProject, type DemoTag, type DemoTeamMember, type DemoTurn } from './demoScenario.js';

/** The built-in Narrator and Guardian, in their latest versions, completing every demo team. */
export type RestitutionAgents = { narrator: ProjectAgent; guardian: ProjectAgent };

export type DemoProjectRows = {
  /** Inserted without its default branch, which references a branch inserted after it. */
  project: typeof projects.$inferInsert;
  /** Inserted without fork and head, which reference turns inserted after them. */
  branches: (typeof chatBranches.$inferInsert)[];
  messages: (typeof chatMessages.$inferInsert)[];
  turns: (typeof chatTurns.$inferInsert)[];
  projectAgents: (typeof projectAgents.$inferInsert)[];
  memorySettings: typeof memorySettings.$inferInsert;
  memoryBanks: (typeof memoryBanks.$inferInsert)[];
  memoryRuns: (typeof memoryRuns.$inferInsert)[];
  llmCalls: (typeof llmCall.$inferInsert)[];
  llmUsages: (typeof llmUsage.$inferInsert)[];
};

const MODEL = 'deepseek-flash';
/** Off-peak deepseek-flash price inserted by migration 0009. */
const PRICE: PriceRate = {
  id: '019aee10-0000-7000-8000-000000000001', inputPerMillion: 0.15, outputPerMillion: 0.6, cacheReadPerMillion: 0.003,
};
const TURN_INTERVAL_MS = 6 * 60_000;
/** Simulated latency: a fixed share plus a share per generated token. */
const LATENCY: Record<LlmStage, { baseMs: number; perTokenMs: number }> = {
  analysis: { baseMs: 900, perTokenMs: 14 },
  direction: { baseMs: 1_100, perTokenMs: 12 },
  narrator: { baseMs: 1_500, perTokenMs: 22 },
  guardian: { baseMs: 1_000, perTokenMs: 10 },
  memory_setup: { baseMs: 1_000, perTokenMs: 10 },
};
const REDUCER_MS = 4;

type Exchange = { user: string; assistant: string | null };

/** What a later turn needs from its parent. */
type PlayedTurn = {
  id: string;
  startedAt: Date;
  userMessageId: string;
  userContent: string;
  memoryAfter: MemoryState;
  direction: TurnDirection | null;
  /** The path up to and including this turn, as the next turn's history. */
  history: Exchange[];
};

type CallInput = {
  turnId: string;
  stage: LlmStage;
  agent: ProjectAgent;
  messages: ChatCompletionMessageParam[];
  memory: MemoryContext;
  response: string | null;
  error?: string;
  startedAt: number;
  stageExecutionId?: string;
  /** Turns before cost tracking have no usage row. */
  priced: boolean;
};

/**
 * Turns a demo description into rows that follow the real schemas, without any LLM call.
 * Pipeline outputs go through the same validation and reduction as a real turn (analysis envelope,
 * Director contract, Guardian proposals), so an inconsistent description fails here, not in the UI.
 * Request prompts are abbreviated: they carry the context of each stage, not its full output contract.
 */
export function buildDemoProjectRows(
  project: DemoProject, restitution: RestitutionAgents, startedAt: Date, id: () => string = uuidv7,
): DemoProjectRows {
  const tagIds = new Map((Object.keys(demoTags) as DemoTag[]).map((tag) => [tag, id()]));
  const tagId = (tag: DemoTag) => {
    const value = tagIds.get(tag);
    if (!value) throw new Error(`Unknown demo tag ${tag}.`);
    return value;
  };
  const initialMemory: MemoryState = {
    v: 2,
    tags: (Object.keys(demoTags) as DemoTag[]).map((tag) => ({ id: tagId(tag), ...demoTags[tag] })),
    entries: project.memory.map((entry) => ({
      id: id(), key: entry.key, content: entry.content, tagIds: entry.tags.map(tagId),
      protected: entry.protected ?? false, archived: false, source: 'user', turnId: null,
      updatedAt: startedAt.toISOString(),
    })),
  };
  const team = (members: readonly DemoTeamMember[]): ProjectAgent[] => [
    ...members.map((member) => toProjectAgent(member, tagId)), restitution.narrator, restitution.guardian,
  ];

  const rows: DemoProjectRows = {
    project: { id: project.id, name: project.name, systemPrompt: project.systemPrompt, createdAt: startedAt },
    branches: [], messages: [], turns: [],
    projectAgents: team(project.team).map(({ agentId, versionId, phase, output, memoryRead }) => ({
      projectId: project.id, agentId, versionId, phase, output, memoryRead,
    })),
    memorySettings: { projectId: project.id, revisionId: id(), enabled: true, catalog: { v: 2, tags: initialMemory.tags } },
    memoryBanks: [], memoryRuns: [], llmCalls: [], llmUsages: [],
  };

  const branchIds = { main: id(), alternative: id() };
  const played = new Map<string, PlayedTurn>();
  let clock = startedAt.getTime() + 60_000;

  const call = (input: CallInput): number => {
    const callId = id();
    const inputTokens = estimateTokens(JSON.stringify(input.messages));
    const outputTokens = input.response === null ? null : estimateTokens(input.response);
    const latency = LATENCY[input.stage];
    const durationMs = latency.baseMs + latency.perTokenMs * (outputTokens ?? 200);
    const createdAt = new Date(input.startedAt + durationMs);
    const status = input.error ? 'error' as const : 'success' as const;
    const measured = status === 'success' ? { inputTokens, outputTokens } : { inputTokens: null, outputTokens: null };
    rows.llmCalls.push({
      id: callId, projectId: project.id, turnId: input.turnId,
      agentId: input.agent.agentId, agentVersionId: input.agent.versionId, stageExecutionId: input.stageExecutionId ?? null,
      stage: input.stage, model: MODEL, request: { messages: input.messages, memory: input.memory },
      response: input.response, ...measured, durationMs, status, error: input.error ?? null, createdAt,
    });
    if (input.priced) {
      const cost = resolveCost({ ...measured, cachedInputTokens: null, providerCostUsd: null, rate: PRICE });
      rows.llmUsages.push({
        id: id(), callId, projectId: project.id, turnId: input.turnId, stage: input.stage,
        stageExecutionId: input.stageExecutionId ?? null,
        agentId: input.agent.agentId, agentVersionId: input.agent.versionId, provider: 'deepseek', model: MODEL,
        ...measured, cachedInputTokens: null, durationMs, status,
        pricingId: cost.pricingId, costBasis: cost.basis, costMicroUsd: cost.costMicroUsd, createdAt,
      });
    }
    return createdAt.getTime();
  };

  for (const turn of project.turns) {
    const parent = turn.parent === null ? null : playedTurn(played, turn.parent);
    const turnId = id();
    const branchId = branchIds[turn.branch];
    const startedAtMs = clock;
    const before = parent?.memoryAfter ?? initialMemory;
    const history = parent?.history ?? [];
    const agents = team(turn.team);
    const priced = !turn.legacy;

    const user = userMessage(turn, played, id);
    if (user.created) {
      rows.messages.push({ id: user.id, projectId: project.id, role: 'user', content: user.content, createdAt: new Date(startedAtMs) });
    }
    const dialogue = (system: string) => conversation(system, history, user.content);

    let analysisEnd = startedAtMs;
    const whiteboard: AnalysisEnvelope[] = [];
    for (const analysis of turn.analysis) {
      const agent = agents.find((candidate) => candidate.agentId === analysis.agent.id && candidate.phase === 'analysis');
      if (!agent) throw new Error(`Demo turn ${turn.ref} analyses with an agent outside its team.`);
      const envelope = analysisEnvelopeSchema.parse({ v: 1, agent: agent.name, summary: analysis.summary, items: analysis.items });
      whiteboard.push(envelope);
      const memory = memoryContext(before, agent);
      const messages = dialogue([project.systemPrompt, agent.instructions, formatMemoryContext(memory)].filter(Boolean).join('\n\n'));
      let at = startedAtMs;
      for (let attempt = 0; attempt < (analysis.invalidAttempts ?? 0); attempt++) {
        at = call({
          turnId, stage: 'analysis', agent, messages, memory, priced, startedAt: at,
          response: `Voici mon analyse : ${analysis.summary}`,
          error: 'Le fournisseur LLM a renvoyé une réponse au format invalide.',
        });
      }
      at = call({ turnId, stage: 'analysis', agent, messages, memory, priced, startedAt: at, response: JSON.stringify(envelope) });
      analysisEnd = Math.max(analysisEnd, at);
    }

    let direction: TurnDirection | null = null;
    let directionEnd = analysisEnd;
    const director = agents.find(isDirectorAgent);
    if (Boolean(director) !== Boolean(turn.direction)) {
      throw new Error(`Demo turn ${turn.ref} must have a direction exactly when its team has a Director.`);
    }
    if (director && turn.direction) {
      const identified = identifyWhiteboard(whiteboard);
      const items = identified.flatMap((entry) => entry.items);
      const output = directorOutputContract(items.map((item) => item.id), forbiddenNudgeTypes([parent?.direction ?? null]))
        .parse({ v: 1, ...turn.direction });
      direction = resolveDirection(output, items);
      directionEnd = call({
        turnId, stage: 'direction', agent: director, priced, startedAt: analysisEnd,
        memory: { tags: [], entries: [] }, response: JSON.stringify(output),
        messages: dialogue([
          project.systemPrompt, director.instructions,
          ...items.map((item) => `- [${item.id}] ${item.agent} — ${formatItem(item.item)}`),
        ].join('\n\n')),
      });
    }

    const narratorMemory = memoryContext(before, restitution.narrator);
    const narratorMessages = dialogue(narratorSystemPrompt(
      [project.systemPrompt, restitution.narrator.instructions].filter(Boolean).join('\n\n'),
      whiteboard, narratorMemory, direction,
    ));
    let end: number;
    let memoryAfter = before;
    let memoryResult: MemoryResult | null = null;
    let assistant: { id: string; content: string } | null = null;
    if (turn.outcome.status === 'failed') {
      end = call({
        turnId, stage: 'narrator', agent: restitution.narrator, priced, startedAt: directionEnd,
        memory: narratorMemory, messages: narratorMessages, response: null, error: turn.outcome.error,
      });
    } else {
      end = call({
        turnId, stage: 'narrator', agent: restitution.narrator, priced, startedAt: directionEnd,
        memory: narratorMemory, messages: narratorMessages, response: turn.outcome.prose,
      });
      assistant = { id: id(), content: turn.outcome.prose };
      if (!turn.legacy) {
        const runId = id();
        const proposals = memoryProposalsSchema.parse({
          v: 2, tagSuggestions: [],
          proposals: turn.outcome.memory.map((change) => toProposal(change, before, tagId)),
        });
        const guardianStart = end;
        end = call({
          turnId, stage: 'guardian', agent: restitution.guardian, priced, startedAt: guardianStart, stageExecutionId: runId,
          memory: memoryContext(before, restitution.guardian), response: JSON.stringify(proposals),
          messages: [
            { role: 'system', content: restitution.guardian.instructions },
            { role: 'user', content: JSON.stringify({ projectContext: project.systemPrompt, prose: turn.outcome.prose }) },
          ],
        });
        const reduced = reduceProposals(
          before, proposals.proposals, restitution.guardian, turnId, id, new Date(end).toISOString(),
        );
        memoryAfter = reduced.state;
        memoryResult = {
          status: 'success', code: null,
          message: reduced.changes.length
            ? `${reduced.changes.length} changement(s) mémoire appliqué(s).` : 'Aucun changement mémoire nécessaire.',
          changes: reduced.changes, tagSuggestions: [], guardianMs: end - guardianStart, reducerMs: REDUCER_MS,
        };
        end += REDUCER_MS;
        rows.memoryRuns.push({
          id: runId, projectId: project.id, branchId, turnId, result: memoryResult, createdAt: new Date(end),
        });
      }
    }
    const completedAt = new Date(end + 20);
    if (assistant) {
      rows.messages.push({ id: assistant.id, projectId: project.id, role: 'assistant', content: assistant.content, createdAt: completedAt });
    }
    rows.turns.push({
      id: turnId, projectId: project.id, originBranchId: branchId, parentTurnId: parent?.id ?? null,
      retryOfTurnId: null,
      regeneratedFromTurnId: turn.regeneratedFrom ? playedTurn(played, turn.regeneratedFrom).id : null,
      userMessageId: user.id, assistantMessageId: assistant?.id ?? null,
      status: turn.outcome.status, error: turn.outcome.status === 'failed' ? turn.outcome.error : null,
      memorySnapshot: turn.legacy ? null : before, memoryResult,
      configuration: turn.legacy ? null : turnConfiguration(project.systemPrompt, agents),
      direction, createdAt: new Date(startedAtMs), completedAt,
    });
    played.set(turn.ref, {
      id: turnId, startedAt: new Date(startedAtMs), userMessageId: user.id, userContent: user.content, memoryAfter, direction,
      history: [...history, { user: user.content, assistant: assistant?.content ?? null }],
    });
    clock = completedAt.getTime() + TURN_INTERVAL_MS;
  }

  for (const name of ['main', 'alternative'] as const) {
    const turns = project.turns.filter((turn) => turn.branch === name);
    const first = turns[0];
    const head = turns.at(-1);
    if (!first || !head) continue;
    const headTurn = playedTurn(played, head.ref);
    const forkTurnId = name === 'main' || first.parent === null ? null : playedTurn(played, first.parent).id;
    rows.branches.push({
      id: branchIds[name], projectId: project.id,
      name: name === 'main' ? 'Principale' : 'Alternative 1',
      sourceBranchId: name === 'main' ? null : branchIds.main,
      forkTurnId, headTurnId: headTurn.id,
      createdAt: name === 'main' ? startedAt : playedTurn(played, first.ref).startedAt,
    });
    rows.memoryBanks.push({
      branchId: branchIds[name], projectId: project.id, revisionId: id(),
      entries: { v: 2, entries: headTurn.memoryAfter.entries },
    });
  }
  rows.project.defaultBranchId = branchIds.main;
  rows.project.updatedAt = new Date(clock - TURN_INTERVAL_MS);
  return rows;
}

function toProjectAgent(member: DemoTeamMember, tagId: (tag: DemoTag) => string): ProjectAgent {
  const version = member.agent.versions[member.version - 1];
  if (!version) throw new Error(`Demo agent ${member.agent.id} has no version ${member.version}.`);
  return {
    agentId: member.agent.id, versionId: version.id, phase: member.agent.phase, output: member.agent.output,
    version: member.version, name: version.name, instructions: version.instructions,
    memoryRead: member.agent.output === 'direction'
      ? { mode: 'none', tagIds: [] }
      : { mode: 'selected', tagIds: (member.reads ?? []).map(tagId) },
  };
}

function playedTurn(played: ReadonlyMap<string, PlayedTurn>, ref: string): PlayedTurn {
  const turn = played.get(ref);
  if (!turn) throw new Error(`Demo turn ${ref} is referenced before it is played.`);
  return turn;
}

function userMessage(turn: DemoTurn, played: ReadonlyMap<string, PlayedTurn>, id: () => string) {
  if (turn.regeneratedFrom) {
    const source = playedTurn(played, turn.regeneratedFrom);
    return { id: source.userMessageId, content: source.userContent, created: false };
  }
  if (!turn.input) throw new Error(`Demo turn ${turn.ref} needs an input.`);
  return { id: id(), content: turn.input, created: true };
}

/** Same shape as the pipeline's conversation: system prompt, the path's exchanges, then the new input. */
function conversation(system: string, history: readonly Exchange[], input: string): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: system },
    ...history.flatMap((exchange): ChatCompletionMessageParam[] => [
      { role: 'user', content: exchange.user },
      ...(exchange.assistant === null ? [] : [{ role: 'assistant' as const, content: exchange.assistant }]),
    ]),
    { role: 'user', content: input },
  ];
}

function toProposal(
  change: Extract<DemoTurn['outcome'], { status: 'completed' }>['memory'][number],
  state: MemoryState, tagId: (tag: DemoTag) => string,
): MemoryProposal {
  if (change.op === 'create') {
    return { op: 'create', key: change.key, content: change.content, tagIds: change.tags.map(tagId), reason: change.reason };
  }
  const entry = state.entries.find((candidate) => candidate.key === change.key && !candidate.archived);
  if (!entry) throw new Error(`Demo memory entry ${change.key} does not exist at this turn.`);
  return change.op === 'edit'
    ? { op: 'edit', entryId: entry.id, content: change.content, reason: change.reason }
    : { op: 'archive', entryId: entry.id, reason: change.reason };
}

/** Rough count, about four characters per token: plausible orders of magnitude, not a tokenizer. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
