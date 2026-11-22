import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChatBranch, ChatCommand, ChatHistory, Message, Project, ReplayConfiguration } from '@choral-writer/shared';

import { ClientApiError, getErrorMessage } from '../api/client';
import { getProject } from '../api/projects/projectsApi';
import { getBranches, getChatHistory, streamTurn } from '../api/chat/chatApi';
import { getMemory, retryMemory } from '../api/memories/memoriesApi';
import { initialPipelineProgress, updatePipelineProgress } from './chatPipelineProgress';
import type { ChatPipelineProgress } from './chatPipelineProgress';

export type { ChatPipelineProgress } from './chatPipelineProgress';

type ChatAction =
  | { operation: 'send'; content: string }
  | { operation: 'regenerate'; configuration?: ReplayConfiguration }
  | { operation: 'retry' };

/**
 * Owns branch selection, provisional streaming and reconciliation with committed
 * history. Regeneration never replaces the source view until its success is
 * persisted; failed alternatives remain explicitly accessible.
 */
export function useChat(projectId: string) {
  const [search, setSearch] = useSearchParams();
  const requestedBranchId = search.get('branch');
  const [project, setProject] = useState<Project | null>(null);
  const [branches, setBranches] = useState<ChatBranch[]>([]);
  const [history, setHistory] = useState<ChatHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [partial, setPartial] = useState('');
  const [pipelineProgress, setPipelineProgress] = useState<ChatPipelineProgress | null>(null);
  const [optimisticUser, setOptimisticUser] = useState<Message | null>(null);
  const [failedBranchId, setFailedBranchId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const [legacyAction, setLegacyAction] = useState<ChatAction | null>(null);

  useEffect(() => {
    if (!pipelineProgress?.activeStage || pipelineProgress.activeStageStartedAt === null) return;
    const interval = window.setInterval(() => {
      setPipelineProgress((current) => {
        if (!current?.activeStage || current.activeStageStartedAt === null) return current;
        const elapsedMs = Date.now() - current.activeStageStartedAt;
        return { ...current, [current.activeStage]: { ...current[current.activeStage], elapsedMs } };
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [pipelineProgress?.activeStage, pipelineProgress?.activeStageStartedAt]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setPartial('');
    setPipelineProgress(null);
    setPending(false);
    setOptimisticUser(null);
    setHistory(null);
    setFailedBranchId(null);
    setLegacyAction(null);
    async function load() {
      const [project, branches] = await Promise.all([
        getProject(projectId, controller.signal), getBranches(projectId, controller.signal),
      ]);
      const branchId = requestedBranchId ?? project.defaultBranchId;
      if (!branchId) throw new Error('Ce projet ne possède pas de branche principale.');
      const history = await getChatHistory(projectId, branchId, controller.signal);
      if (controller.signal.aborted) return;
      setProject(project);
      setBranches(branches);
      setHistory(history);
    }
    void load().catch((error: unknown) => {
      if (!controller.signal.aborted) setError(getErrorMessage(error));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [projectId, requestedBranchId, revision]);

  function selectBranch(branchId: string) {
    if (activeRequest.current) return;
    setSearch((current) => {
      const next = new URLSearchParams(current);
      next.set('branch', branchId);
      return next;
    });
  }

  async function execute(action: ChatAction, allowLegacyMemoryReset = false): Promise<boolean> {
    if (activeRequest.current) {
      setError('Une génération est déjà en cours.');
      return false;
    }
    if (!history) {
      setError('La conversation n’est pas chargée.');
      return false;
    }
    const head = history.turns.at(-1);
    let command: ChatCommand;
    const base = {
      projectId, branchId: history.branch.id, expectedHeadTurnId: history.branch.headTurnId,
      ...(allowLegacyMemoryReset ? { allowLegacyMemoryReset: true } : {}),
    };
    if (action.operation === 'send') {
      command = { ...base, ...action };
    } else if (head) {
      command = { ...base, ...action, turnId: head.id };
    } else {
      setError('Cette action n’est pas disponible pour ce tour.');
      return false;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setError('');
    setPartial('');
    setFailedBranchId(null);
    let userMessageId: string | undefined;
    let completedBranchId: string | undefined;
    let failedAlternativeId: string | undefined;
    let persisted = false;
    try {
      await streamTurn(command, controller.signal, (event) => {
        if (event.type === 'chat.turn.started') {
          userMessageId = event.message.id;
          if (action.operation === 'send') setOptimisticUser(event.message);
          setPipelineProgress(initialPipelineProgress(event.turnId));
        } else if (event.type === 'chat.pipeline.stage' || event.type === 'chat.pipeline.agent') {
          setPipelineProgress((current) => updatePipelineProgress(current, event));
        } else if (event.type === 'chat.message.delta') {
          setPartial((text) => text + event.delta);
        } else if (event.type === 'chat.turn.completed') {
          completedBranchId = event.branchId;
          persisted = true;
          setPartial('');
          setPipelineProgress(null);
        } else if (event.type === 'chat.turn.failed' && action.operation === 'regenerate') {
          failedAlternativeId = event.branchId;
          setFailedBranchId(event.branchId ?? null);
          setPipelineProgress(null);
        }
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ClientApiError && error.details.code === 'MEMORY_LEGACY_RESET') setLegacyAction(action);
        else setError(getErrorMessage(error));
      }
    } finally {
      setPipelineProgress(null);
      if (!controller.signal.aborted) {
        try {
          const targetBranchId = completedBranchId ?? history.branch.id;
          const [updated, branches] = await Promise.all([
            getChatHistory(projectId, targetBranchId, controller.signal),
            getBranches(projectId, controller.signal),
          ]);
          if (!controller.signal.aborted) {
            setHistory(updated);
            setBranches(branches);
            setOptimisticUser(null);
            setPartial('');
            setFailedBranchId(failedAlternativeId ?? null);
            if (action.operation === 'send') {
              persisted = updated.turns.some((turn) => turn.userMessage.id === userMessageId);
            }
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setError((current) => [current, getErrorMessage(error)].filter(Boolean).join(' '));
          }
        }
        if (!controller.signal.aborted) setPending(false);
      }
      if (activeRequest.current === controller) activeRequest.current = null;
      if (!controller.signal.aborted && completedBranchId && completedBranchId !== history.branch.id) {
        selectBranch(completedBranchId);
      }
    }
    return persisted;
  }

  async function retryHeadMemory() {
    if (activeRequest.current) {
      setError('Une génération est déjà en cours.');
      return;
    }
    const head = history?.turns.at(-1);
    if (!history || head?.status !== 'completed') {
      setError('La mémoire ne peut être relancée que pour une scène terminée.');
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setPending(true);
    setError('');
    setPipelineProgress({
      ...initialPipelineProgress(head.id),
      memoryOnly: true,
      activeStage: 'guardian',
      activeStageStartedAt: Date.now(),
      guardian: { status: 'running', elapsedMs: 0 },
    });
    try {
      const view = await getMemory(projectId, history.branch.id, controller.signal);
      if (view.headTurnId !== head.id) {
        throw new Error('La conversation a changé. Rechargez avant de relancer la mémoire.');
      }
      const result = await retryMemory(view, head.id, controller.signal);
      if (controller.signal.aborted) return;
      setHistory((current) => current && {
        ...current,
        turns: current.turns.map((turn) => turn.id === head.id ? { ...turn, memory: result } : turn),
      });
      const updated = await getChatHistory(projectId, history.branch.id, controller.signal);
      if (!controller.signal.aborted) setHistory(updated);
    } catch (error) {
      if (!controller.signal.aborted) setError(getErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        setPipelineProgress(null);
      }
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  const messages = history?.turns.flatMap((turn) =>
    [turn.userMessage, ...(turn.assistantMessage ? [turn.assistantMessage] : [])]) ?? [];
  if (optimisticUser && !messages.some((message) => message.id === optimisticUser.id)) messages.push(optimisticUser);

  return {
    project, branches, history, messages, loading, error, pending, partial, pipelineProgress, failedBranchId,
    selectBranch,
    send: (content: string) => execute({ operation: 'send', content }),
    /** Without a configuration, the turn is replayed with the project's. */
    regenerate: (configuration?: ReplayConfiguration) =>
      execute(configuration ? { operation: 'regenerate', configuration } : { operation: 'regenerate' }),
    retry: () => execute({ operation: 'retry' }),
    retryMemory: retryHeadMemory,
    legacyMemoryConfirmation: legacyAction !== null,
    cancelLegacyMemoryReset: () => setLegacyAction(null),
    confirmLegacyMemoryReset: () => {
      const action = legacyAction;
      setLegacyAction(null);
      if (action) void execute(action, true);
    },
    reload: () => setRevision((value) => value + 1),
  };
}
