import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { v7 as uuidv7 } from 'uuid';
import {
  analysisEnvelopeSchema, defaultMemoryRead, memoryProposalsSchema,
  type AnalysisEnvelope, type ChatTurn, type LlmStage, type MemoryContext,
  type MemoryProposal, type MemoryResult, type MemoryState, type Message, type ProjectAgent, type TurnDirection,
} from '@choral-writer/shared';

import type {
  chatBranches, chatMessages, chatTurns, llmCall, llmUsage, memoryBanks, memoryRuns, memorySettings, projectAgents, projects,
} from '../db/schema.js';
import { joinSections } from '../llm/contextComposition.js';
import { resolveCost, type PriceRate } from '../llm/usage/pricingResolver.js';
import { memoryContext, formatMemoryContext, reduceProposals } from '../modules/memories/services/memoryState.js';
import { appliedMemoryMessage } from '../modules/memories/services/memoriesService.js';
import { startingTags } from '../modules/memories/services/startingTags.js';
import { conversationMessages } from '../modules/chat/services/conversationMessages.js';
import {
  directorOutputContract, forbiddenNudgeTypes, identifyWhiteboard, isDirectorAgent, resolveDirection,
} from '../modules/chat/services/directorService.js';
import { narratorSystemSections } from '../modules/chat/services/narratorPrompt.js';
import { turnConfiguration } from '../modules/chat/services/turnConfiguration.js';
import { turnDevelopments } from '../modules/chat/services/turnDevelopments.js';
import { formatItem } from '../modules/chat/services/whiteboardFormat.js';
import { demoTagNames, type DemoProject, type DemoTag, type DemoTeamMember, type DemoTurn } from './demoScenario.js';

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

export type DemoRowsOptions = {
  startedAt: Date;
  /** The price the calls are costed with; null leaves them unpriced, like an unknown model. */
  rate: PriceRate | null;
  id?: () => string;
};

/** Model and price window the demo calls are recorded under. */
export const DEMO_MODEL = { provider: 'deepseek', model: 'deepseek-flash', priceWindow: 'off_peak' } as const;

const TURN_INTERVAL_MS = 6 * 60_000;
/** Simulated latency: a fixed share plus a share per generated token. */
const LATENCY: Record<LlmStage, { baseMs: number; perTokenMs: number }> = {
  analysis: { baseMs: 900, perTokenMs: 14 },
  direction: { baseMs: 1_100, perTokenMs: 12 },
  narrator: { baseMs: 1_500, perTokenMs: 22 },
  guardian: { baseMs: 1_000, perTokenMs: 10 },
  memory_setup: { baseMs: 1_000, perTokenMs: 10 },
  attribution: { baseMs: 800, perTokenMs: 8 },
};
const REDUCER_MS = 4;
const INVALID_RESPONSE = 'Le fournisseur LLM a renvoyé une réponse au format invalide.';

/** What later turns need from a played one. */
type PlayedTurn = {
  turn: ChatTurn;
  startedAt: Date;
  memoryAfter: MemoryState;
  direction: TurnDirection | null;
  /** The path up to and including this turn, root first. */
  path: ChatTurn[];
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
 * Pipeline outputs go through the same code as a real turn (analysis envelope, Director contract and
 * resolution, developments, Guardian proposals and reduction, configuration, cost), so an inconsistent
 * description fails here, not in the UI. Request prompts of analysis, Director and Guardian are abbreviated:
 * they carry the context of each stage, not its full output contract. Tokens and durations are estimated.
 */
export function buildDemoProjectRows(project: DemoProject, options: DemoRowsOptions): DemoProjectRows {
  const { startedAt, rate, id = uuidv7 } = options;
  const tags = startingTags(id);
  const tagId = (tag: DemoTag) => {
    const value = tags.find((candidate) => candidate.name === demoTagNames[tag])?.id;
    if (!value) throw new Error(`Demo tag ${tag} is not a starting tag.`);
    return value;
  };
  const initialMemory: MemoryState = {
    v: 2,
    tags,
    entries: project.memory.map((entry) => ({
      id: id(), key: entry.key, content: entry.content, tagIds: entry.tags.map(tagId),
      protected: entry.protected ?? false, archived: false, source: 'user', turnId: null,
      updatedAt: startedAt.toISOString(),
    })),
  };
  const team = (members: readonly DemoTeamMember[]) => {
    const agents = members.map((member) => toProjectAgent(member, tagId));
    const narrator = agents.find((agent) => agent.output === 'narrative');
    const guardian = agents.find((agent) => agent.output === 'memory_proposals');
    if (!narrator || !guardian) throw new Error('A demo team needs a Narrator and a Guardian.');
    return { agents, narrator, guardian, director: agents.find(isDirectorAgent) };
  };

  const rows: DemoProjectRows = {
    project: { id: project.id, name: project.name, systemPrompt: project.systemPrompt, createdAt: startedAt },
    branches: [], messages: [], turns: [],
    projectAgents: team(project.team).agents.map(({ agentId, versionId, phase, output, memoryRead }) => ({
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
    const latency = LATENCY[input.stage];
    const outputTokens = input.response === null ? null : estimateTokens(input.response);
    const durationMs = latency.baseMs + latency.perTokenMs * (outputTokens ?? 200);
    const createdAt = new Date(input.startedAt + durationMs);
    const status = input.error ? 'error' as const : 'success' as const;
    // A provider answer, even an invalid one, is measured; a failed connection is not.
    const measured = outputTokens === null
      ? { inputTokens: null, outputTokens: null }
      : { inputTokens: estimateTokens(JSON.stringify(input.messages)), outputTokens };
    rows.llmCalls.push({
      id: callId, projectId: project.id, turnId: input.turnId,
      agentId: input.agent.agentId, agentVersionId: input.agent.versionId, stageExecutionId: input.stageExecutionId ?? null,
      stage: input.stage, model: DEMO_MODEL.model, request: { messages: input.messages, memory: input.memory },
      response: input.response, ...measured, durationMs, status, error: input.error ?? null, createdAt,
    });
    if (input.priced) {
      const cost = resolveCost({ ...measured, cachedInputTokens: null, providerCostUsd: null, rate });
      rows.llmUsages.push({
        id: id(), callId, projectId: project.id, turnId: input.turnId, stage: input.stage,
        stageExecutionId: input.stageExecutionId ?? null,
        agentId: input.agent.agentId, agentVersionId: input.agent.versionId,
        provider: DEMO_MODEL.provider, model: DEMO_MODEL.model,
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
    const history = parent?.path ?? [];
    const { agents, narrator, guardian, director } = team(turn.team);
    const priced = !turn.legacy;

    const userMessage = turn.regeneratedFrom
      ? playedTurn(played, turn.regeneratedFrom).turn.userMessage
      : newMessage(project.id, 'user', requiredInput(turn), new Date(startedAtMs), id);
    if (!turn.regeneratedFrom) rows.messages.push(userMessage);
    // The demo records requests without their composition: one system section is enough to rebuild the messages.
    const dialogue = (system: string) =>
      conversationMessages([{ part: 'systemPrompt', text: system }], history, userMessage).messages;

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
          response: `Voici mon analyse : ${analysis.summary}`, error: INVALID_RESPONSE,
        });
      }
      at = call({ turnId, stage: 'analysis', agent, messages, memory, priced, startedAt: at, response: JSON.stringify(envelope) });
      analysisEnd = Math.max(analysisEnd, at);
    }

    let direction: TurnDirection | null = null;
    let directionEnd = analysisEnd;
    if (Boolean(director) !== Boolean(turn.direction)) {
      throw new Error(`Demo turn ${turn.ref} must have a direction exactly when its team has a Director.`);
    }
    if (director && turn.direction) {
      const items = identifyWhiteboard(whiteboard).flatMap((entry) => entry.items);
      const messages = dialogue([
        project.systemPrompt, director.instructions,
        ...items.map((item) => `- [${item.id}] ${item.agent} — ${formatItem(item.item)}`),
      ].join('\n\n'));
      const directorCall = (response: string, error?: string) => call({
        turnId, stage: 'direction', agent: director, priced, startedAt: directionEnd,
        memory: { tags: [], entries: [] }, messages, response, error,
      });
      if (turn.direction === 'failed') {
        // Two invalid answers: the Director's retry fails too and the Narrator falls back to the whole whiteboard.
        directionEnd = directorCall('{"v":1,"retained":[]}', INVALID_RESPONSE);
        directionEnd = directorCall('{"v":1,"retained":[]}', INVALID_RESPONSE);
      } else {
        const output = directorOutputContract(items, forbiddenNudgeTypes([parent?.direction ?? null]))
          .parse({ v: 1, ...turn.direction });
        direction = resolveDirection(output, items);
        directionEnd = directorCall(JSON.stringify(output));
      }
    }
    const developments = turnDevelopments(whiteboard, direction);

    const narratorMemory = memoryContext(before, narrator);
    const narratorMessages = dialogue(joinSections(
      narratorSystemSections(project.systemPrompt, narrator.instructions, whiteboard, narratorMemory, direction),
    ));
    let end: number;
    let memoryAfter = before;
    let memoryResult: MemoryResult | null = null;
    let assistantMessage: Message | null = null;
    if (turn.outcome.status === 'failed') {
      end = call({
        turnId, stage: 'narrator', agent: narrator, priced, startedAt: directionEnd,
        memory: narratorMemory, messages: narratorMessages, response: null, error: turn.outcome.error,
      });
    } else {
      end = call({
        turnId, stage: 'narrator', agent: narrator, priced, startedAt: directionEnd,
        memory: narratorMemory, messages: narratorMessages, response: turn.outcome.prose,
      });
      if (!turn.legacy) {
        const guardianStart = end;
        const run = guardianRun(turn.outcome.memory, before, tagId);
        const runId = id();
        end = call({
          turnId, stage: 'guardian', agent: guardian, priced, startedAt: guardianStart, stageExecutionId: runId,
          memory: memoryContext(before, guardian), response: JSON.stringify(run),
          messages: [
            { role: 'system', content: guardian.instructions },
            { role: 'user', content: JSON.stringify({ projectContext: project.systemPrompt, prose: turn.outcome.prose, developments }) },
          ],
        });
        const reduced = reduceProposals(before, run.proposals, guardian, turnId, id, new Date(end).toISOString());
        memoryAfter = reduced.state;
        memoryResult = {
          status: 'success', code: null, message: appliedMemoryMessage(reduced.changes.length),
          changes: reduced.changes, tagSuggestions: [], guardianMs: end - guardianStart, reducerMs: REDUCER_MS,
        };
        end += REDUCER_MS;
        rows.memoryRuns.push({ id: runId, projectId: project.id, branchId, turnId, result: memoryResult, createdAt: new Date(end) });
      }
    }
    const completedAt = new Date(end + 20);
    if (turn.outcome.status === 'completed') {
      assistantMessage = newMessage(project.id, 'assistant', turn.outcome.prose, completedAt, id);
      rows.messages.push(assistantMessage);
    }
    const chatTurn: ChatTurn = {
      id: turnId, parentTurnId: parent?.turn.id ?? null, originBranchId: branchId, retryOfTurnId: null,
      regeneratedFromTurnId: turn.regeneratedFrom ? playedTurn(played, turn.regeneratedFrom).turn.id : null,
      status: turn.outcome.status, error: turn.outcome.status === 'failed' ? turn.outcome.error : null,
      userMessage, assistantMessage, memory: memoryResult,
    };
    rows.turns.push({
      id: turnId, projectId: project.id, originBranchId: branchId, parentTurnId: chatTurn.parentTurnId,
      retryOfTurnId: null, regeneratedFromTurnId: chatTurn.regeneratedFromTurnId,
      userMessageId: userMessage.id, assistantMessageId: assistantMessage?.id ?? null,
      status: chatTurn.status, error: chatTurn.error,
      memorySnapshot: turn.legacy ? null : before, memoryResult,
      configuration: turn.legacy ? null : turnConfiguration(project.systemPrompt, agents),
      direction, developments: turn.legacy ? null : developments,
      createdAt: new Date(startedAtMs), completedAt,
    });
    played.set(turn.ref, {
      turn: chatTurn, startedAt: new Date(startedAtMs), memoryAfter, direction, path: [...history, chatTurn],
    });
    clock = completedAt.getTime() + TURN_INTERVAL_MS;
  }

  for (const name of ['main', 'alternative'] as const) {
    const turns = project.turns.filter((turn) => turn.branch === name);
    const first = turns[0];
    const head = turns.at(-1);
    if (!first || !head) continue;
    const headTurn = playedTurn(played, head.ref);
    rows.branches.push({
      id: branchIds[name], projectId: project.id,
      name: name === 'main' ? 'Principale' : 'Alternative 1',
      sourceBranchId: name === 'main' ? null : branchIds.main,
      forkTurnId: name === 'main' || first.parent === null ? null : playedTurn(played, first.parent).turn.id,
      headTurnId: headTurn.turn.id,
      // An alternative branch is created by the regeneration that starts it.
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
  const version = member.agent.versions.find((candidate) => candidate.version === member.version);
  if (!version) throw new Error(`Demo agent ${member.agent.id} has no version ${member.version}.`);
  return {
    agentId: member.agent.id, versionId: version.id, phase: member.agent.phase, output: member.agent.output,
    version: member.version, name: version.name, instructions: version.instructions,
    memoryRead: member.agent.phase === 'analysis'
      ? { mode: 'selected', tagIds: (member.reads ?? []).map(tagId) }
      : defaultMemoryRead(member.agent.output),
  };
}

/** The Guardian's output for a turn, validated against its contract. */
function guardianRun(
  changes: Extract<DemoTurn['outcome'], { status: 'completed' }>['memory'], state: MemoryState,
  tagId: (tag: DemoTag) => string,
) {
  return memoryProposalsSchema.parse({
    v: 2, tagSuggestions: [], proposals: changes.map((change) => toProposal(change, state, tagId)),
  });
}

function playedTurn(played: ReadonlyMap<string, PlayedTurn>, ref: string): PlayedTurn {
  const turn = played.get(ref);
  if (!turn) throw new Error(`Demo turn ${ref} is referenced before it is played.`);
  return turn;
}

function requiredInput(turn: DemoTurn): string {
  if (!turn.input) throw new Error(`Demo turn ${turn.ref} needs an input.`);
  return turn.input;
}

function newMessage(projectId: string, role: Message['role'], content: string, createdAt: Date, id: () => string): Message {
  return { id: id(), projectId, role, content, createdAt };
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
