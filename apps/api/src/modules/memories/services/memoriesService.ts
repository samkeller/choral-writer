import { v7 as uuidv7 } from 'uuid';
import {
  defaultMemoryRead, readsMemory, type MemoryMutation, type MemoryResult, type MemoryState, type MemoryView,
} from '@choral-writer/shared';
import type { Database, Transaction } from '../../../db/client.js';
import { ApiError } from '../../../errors/errors.js';
import type { ProjectsService } from '../../projects/services/projectServices.js';
import { AgentRepository } from '../../agents/repository/agentsRepository.js';
import { MemoryRepository } from '../repositories/memoryRepository.js';
import { applyManualChange, applyMemorySetup, reduceProposals, validateMemory } from './memoryState.js';
import { GuardianService, type GuardianInput } from './guardianService.js';
import type { createCallLLM } from '../../../llm/call-llm.js';

/** What a successful memory run reports to the user. */
export function appliedMemoryMessage(changeCount: number): string {
  return changeCount ? `${changeCount} changement(s) mémoire appliqué(s).` : 'Aucun changement mémoire nécessaire.';
}

export function skippedMemory(message: string): MemoryResult {
  return { status: 'skipped', message, code: null, changes: [], guardianMs: 0, reducerMs: 0 };
}

export class MemoriesService {
  private readonly guardian: GuardianService;
  constructor(private readonly database: Database, private readonly projects: ProjectsService,
    callLLM: ReturnType<typeof createCallLLM>) {
    this.guardian = new GuardianService(callLLM);
  }

  session(tx: Transaction, projectId: string) {
    return new MemorySession(tx, projectId, this.guardian);
  }

  async get(projectId: string, branchId: string): Promise<MemoryView> {
    await this.projects.get(projectId);
    return this.database.transaction(async (tx) => {
      const view = await new MemoryRepository(tx, projectId).view(branchId);
      if (!view) throw new ApiError(404, 'BRANCH_NOT_FOUND', 'Cette branche n’existe pas.');
      return view;
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
  }

  async mutate(projectId: string, branchId: string, input: MemoryMutation): Promise<MemoryView> {
    return this.projects.withLockedProject(projectId, async (_project, tx) => {
      const repository = new MemoryRepository(tx, projectId);
      const view = await repository.view(branchId);
      if (!view) throw new ApiError(404, 'BRANCH_NOT_FOUND', 'Cette branche n’existe pas.');
      if (view.headTurnId !== input.expectedHeadTurnId || view.revisionId !== input.expectedRevisionId
        || view.catalogRevisionId !== input.expectedCatalogRevisionId) {
        throw new ApiError(409, 'MEMORY_CHANGED', 'La mémoire ou la conversation a changé. Rechargez avant d’enregistrer ; votre brouillon est conservé.');
      }
      const change = input.change;
      const agents = await new AgentRepository(tx).listForProject(projectId);
      if (change.op === 'setAgentRead') {
        if (change.read.tagIds.some((id) => !view.state.tags.some((tag) => tag.id === id))) {
          throw new ApiError(422, 'UNKNOWN_TAG', 'Un tag sélectionné n’existe plus.');
        }
        if (agents.some((agent) => agent.agentId === change.agentId && !readsMemory(agent.output))
          && change.read.mode !== 'none') {
          throw new ApiError(422, 'DIRECTOR_HAS_NO_MEMORY', 'Le Directeur ne reçoit aucune mémoire.');
        }
        if (agents.some((agent) => agent.agentId === change.agentId && agent.output === 'memory_proposals')
          && change.read.mode === 'selected') {
          throw new ApiError(422, 'GUARDIAN_REQUIRES_ALL', 'Le Gardien doit lire toute la mémoire, ou être désactivé.');
        }
        if (!await new AgentRepository(tx).setMemoryRead(projectId, change.agentId, change.read)) {
          throw new ApiError(404, 'AGENT_NOT_ASSIGNED', 'Cet agent n’est plus associé au projet.');
        }
      }
      let next: MemoryState;
      if (change.op === 'applySetup') {
        const setup = applyMemorySetup(view.state, change.proposal, agents, uuidv7);
        next = setup.state;
        for (const assignment of setup.assignments) {
          if (!await new AgentRepository(tx).setMemoryRead(projectId, assignment.agentId, assignment.read)) {
            throw new ApiError(409, 'AGENT_NOT_ASSIGNED', 'Un agent de la proposition n’est plus configuré.');
          }
        }
      } else next = applyManualChange(view.state, change, uuidv7, new Date().toISOString());
      await repository.save(branchId, next, change.op === 'settings' ? change.enabled : view.enabled,
        !['saveEntry', 'archiveEntry'].includes(change.op));
      const result = await repository.view(branchId);
      if (!result) throw new Error('Memory branch disappeared inside a locked transaction.');
      return result;
    });
  }

  async proposeSetup(projectId: string, branchId: string, expected: Omit<MemoryMutation, 'change'>, signal: AbortSignal) {
    return this.projects.withLockedProject(projectId, async (_project, tx) => {
      const view = await new MemoryRepository(tx, projectId).view(branchId);
      if (!view) throw new ApiError(404, 'BRANCH_NOT_FOUND', 'Cette branche n’existe pas.');
      if (view.headTurnId !== expected.expectedHeadTurnId || view.revisionId !== expected.expectedRevisionId
        || view.catalogRevisionId !== expected.expectedCatalogRevisionId) {
        throw new ApiError(409, 'MEMORY_CHANGED', 'La configuration a changé. Rechargez avant de proposer une configuration.');
      }
      return this.guardian.proposeSetup(projectId, view.state, await new AgentRepository(tx).listForProject(projectId), signal);
    });
  }

  async trace(projectId: string, turnId: string) {
    await this.projects.get(projectId);
    const repository = new MemoryRepository(this.database, projectId);
    return { input: await repository.snapshot(turnId), runs: await repository.runs(turnId) };
  }
}

export type MemoryProgress = (stage: 'guardian' | 'reducer', status: 'started' | 'completed' | 'failed', elapsedMs?: number) => Promise<void>;

/** Bound to the chat's project transaction. A savepoint isolates the whole memory batch. */
export class MemorySession {
  constructor(private readonly tx: Transaction, private readonly projectId: string, private readonly guardian: GuardianService) {}

  source(turnId: string) {
    return new MemoryRepository(this.tx, this.projectId).source(turnId);
  }

  /** Exposé pour rattacher la consommation du Gardien et de l'écriture mémoire à leur projet. */
  get id(): string {
    return this.projectId;
  }

  async prepare(branchId: string, regeneratedFromTurnId: string | null, allowLegacyReset = false): Promise<MemoryView> {
    const repository = new MemoryRepository(this.tx, this.projectId);
    const view = await repository.view(branchId);
    if (!view) throw new ApiError(404, 'BRANCH_NOT_FOUND', 'Cette branche n’existe pas.');
    if (regeneratedFromTurnId) {
      const snapshot = await repository.snapshot(regeneratedFromTurnId);
      // Catalog and access configuration are project settings; only narrative entries fork.
      if (!snapshot && !allowLegacyReset) {
        const source = await this.tx.query.chatTurns.findFirst({
          where: (turns, { and, eq }) => and(eq(turns.id, regeneratedFromTurnId), eq(turns.projectId, this.projectId)),
        });
        if (!source) throw new Error('Missing source turn during memory regeneration.');
        const sourceView = await repository.view(source.originBranchId);
        if (sourceView?.state.entries.length) {
          throw new ApiError(409, 'MEMORY_LEGACY_RESET', 'Ce tour précède M6. Sa régénération repartira sans les entrées ajoutées depuis. Confirmez pour continuer.');
        }
      }
      view.state.entries = snapshot?.entries ?? [];
      validateMemory(view.state);
      await repository.save(branchId, view.state, view.enabled, false);
    }
    return view;
  }

  async failed(turnId: string, branchId: string, error: unknown, guardianMs = 0, reducerMs = 0, runId = uuidv7()): Promise<MemoryResult> {
    const code = error instanceof ApiError ? error.code : 'MEMORY_FAILED';
    console.error('Memory processing failed.', { turnId, runId, code,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
    });
    const result: MemoryResult = {
      status: 'failed', code,
      message: error instanceof ApiError ? error.message
        : 'La mémorisation a échoué. Le récit est conservé ; vous pouvez continuer.',
      changes: [], guardianMs, reducerMs,
    };
    await new MemoryRepository(this.tx, this.projectId).recordRun(runId, branchId, turnId, result);
    return result;
  }

  async process(
    projectId: string, branchId: string, view: MemoryView,
    input: Omit<GuardianInput, 'state' | 'executionId' | 'agent' | 'projectId'>,
    progress: MemoryProgress,
  ): Promise<MemoryResult> {
    const repository = new MemoryRepository(this.tx, this.projectId);
    const runId = uuidv7();
    const agent = input.agents.find((item) => item.output === 'memory_proposals');
    const read = agent ? agent.memoryRead ?? defaultMemoryRead(agent.output) : null;
    if (!view.enabled || !agent || read?.mode === 'none' || !view.state.tags.length) {
      const result = skippedMemory(!view.enabled ? 'Mémoire désactivée.' : !view.state.tags.length
        ? 'Configurez les tags mémoire avant le premier traitement.' : 'Gardien désactivé ou absent.');
      await repository.recordRun(runId, branchId, input.turnId, result);
      return result;
    }
    let stage: 'guardian' | 'reducer' = 'guardian';
    const started = performance.now();
    let guardianMs = 0;
    let reducerStarted = 0;
    try {
      await progress('guardian', 'started');
      if (read?.mode !== 'all') throw new ApiError(422, 'GUARDIAN_REQUIRES_ALL', 'Le Gardien doit lire toute la mémoire pour la maintenir.');
      const { proposals, tagSuggestions } = await this.guardian.generate({ ...input, projectId, agent, state: view.state, executionId: runId });
      guardianMs = Math.round(performance.now() - started);
      await progress('guardian', 'completed', guardianMs);
      stage = 'reducer';
      reducerStarted = performance.now();
      await progress('reducer', 'started');
      input.signal.throwIfAborted();
      const reduced = reduceProposals(view.state, proposals, agent, input.turnId, uuidv7, new Date().toISOString());
      return await this.tx.transaction(async (savepoint) => {
        const storage = new MemoryRepository(savepoint, this.projectId);
        if (reduced.changes.length) {
          await storage.save(branchId, reduced.state, view.enabled, false);
        }
        input.signal.throwIfAborted();
        const result: MemoryResult = {
          status: 'success', code: null,
          message: appliedMemoryMessage(reduced.changes.length),
          changes: reduced.changes, tagSuggestions, guardianMs, reducerMs: Math.round(performance.now() - reducerStarted),
        };
        await storage.recordRun(runId, branchId, input.turnId, result);
        input.signal.throwIfAborted();
        await progress('reducer', 'completed', result.reducerMs);
        input.signal.throwIfAborted();
        return result;
      });
    } catch (error) {
      const elapsed = Math.round(performance.now() - (stage === 'guardian' ? started : reducerStarted));
      const result = await this.failed(input.turnId, branchId, error, stage === 'guardian' ? elapsed : guardianMs,
        stage === 'reducer' ? elapsed : 0, runId);
      if (!input.signal.aborted) await progress(stage, 'failed', elapsed);
      return result;
    }
  }
}
