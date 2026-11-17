import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChatBranch, ChatCommand, ChatHistory, Message, Project } from '@choral-writer/shared';

import { getErrorMessage } from '../api/client';
import { getProject } from '../api/projects/projectsApi';
import { getBranches, getChatHistory, streamTurn } from '../api/chat/chatApi';

type ChatAction =
  | { operation: 'send'; content: string }
  | { operation: 'regenerate' | 'retry' };

type PipelineStage = 'analysis' | 'narrator';
type PipelineStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ChatPipelineProgress = {
  turnId: string;
  activeStage: PipelineStage | null;
  activeStageStartedAt: number | null;
  analysis: {
    status: PipelineStepStatus;
    elapsedMs: number;
    agentCount: number;
    agents: Record<string, {
      name: string;
      status: 'started' | 'completed' | 'failed';
      startedAt: number | null;
      durationMs: number | null;
    }>;
  };
  narrator: { status: PipelineStepStatus; elapsedMs: number };
};

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

  async function execute(action: ChatAction): Promise<boolean> {
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
          setPipelineProgress({
            turnId: event.turnId,
            activeStage: null,
            activeStageStartedAt: null,
            analysis: { status: 'pending', elapsedMs: 0, agentCount: 0, agents: {} },
            narrator: { status: 'pending', elapsedMs: 0 },
          });
        } else if (event.type === 'chat.pipeline.stage') {
          setPipelineProgress((current) => {
            if (!current || current.turnId !== event.turnId) return current;
            if (event.status === 'started') {
              return {
                ...current,
                activeStage: event.stage,
                activeStageStartedAt: Date.now(),
                [event.stage]: {
                  ...current[event.stage],
                  status: 'running',
                  ...(event.stage === 'analysis' ? { agentCount: event.agentCount ?? 0 } : {}),
                },
              };
            }
            return {
              ...current,
              activeStage: current.activeStage === event.stage ? null : current.activeStage,
              activeStageStartedAt: current.activeStage === event.stage ? null : current.activeStageStartedAt,
              [event.stage]: {
                ...current[event.stage],
                status: event.status,
                elapsedMs: event.elapsedMs ?? current[event.stage].elapsedMs,
              },
            };
          });
        } else if (event.type === 'chat.pipeline.agent') {
          setPipelineProgress((current) => {
            if (!current || current.turnId !== event.turnId) return current;
            return {
              ...current,
              analysis: {
                ...current.analysis,
                agents: {
                  ...current.analysis.agents,
                  [event.agentId]: {
                    name: event.name,
                    status: event.status,
                    startedAt: event.status === 'started'
                      ? Date.now()
                      : current.analysis.agents[event.agentId]?.startedAt ?? null,
                    durationMs: event.durationMs
                      ?? current.analysis.agents[event.agentId]?.durationMs
                      ?? null,
                  },
                },
              },
            };
          });
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
      if (!controller.signal.aborted) setError(getErrorMessage(error));
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

  const messages = history?.turns.flatMap((turn) =>
    [turn.userMessage, ...(turn.assistantMessage ? [turn.assistantMessage] : [])]) ?? [];
  if (optimisticUser && !messages.some((message) => message.id === optimisticUser.id)) messages.push(optimisticUser);

  return {
    project, branches, history, messages, loading, error, pending, partial, pipelineProgress, failedBranchId,
    selectBranch,
    send: (content: string) => execute({ operation: 'send', content }),
    regenerate: () => execute({ operation: 'regenerate' }),
    retry: () => execute({ operation: 'retry' }),
    reload: () => setRevision((value) => value + 1),
  };
}
