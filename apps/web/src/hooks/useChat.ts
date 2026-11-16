import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChatBranch, ChatCommand, ChatHistory, Message, Project } from '@choral-writer/shared';

import { getErrorMessage } from '../api/client.js';
import { getProject } from '../api/projects.js';
import { getBranches, getChatHistory, streamTurn } from '../api/chat/index.js';

type ChatAction =
  | { operation: 'send'; content: string }
  | { operation: 'regenerate' | 'retry' };

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
  const [optimisticUser, setOptimisticUser] = useState<Message | null>(null);
  const [failedBranchId, setFailedBranchId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setPartial('');
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
        } else if (event.type === 'chat.message.delta') {
          setPartial((text) => text + event.delta);
        } else if (event.type === 'chat.turn.completed') {
          completedBranchId = event.branchId;
          persisted = true;
          setPartial('');
        } else if (event.type === 'chat.turn.failed' && action.operation === 'regenerate') {
          failedAlternativeId = event.branchId;
          setFailedBranchId(event.branchId ?? null);
        }
      });
    } catch (error) {
      if (!controller.signal.aborted) setError(getErrorMessage(error));
    } finally {
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
    project, branches, history, messages, loading, error, pending, partial, failedBranchId,
    selectBranch,
    send: (content: string) => execute({ operation: 'send', content }),
    regenerate: () => execute({ operation: 'regenerate' }),
    retry: () => execute({ operation: 'retry' }),
    reload: () => setRevision((value) => value + 1),
  };
}
