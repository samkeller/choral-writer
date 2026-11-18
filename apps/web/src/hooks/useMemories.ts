import { useEffect, useRef, useState } from 'react';
import type { ChatBranch, MemoryMutation, MemoryResult, MemorySetupProposal, MemoryView, Project, ProjectAgent } from '@choral-writer/shared';
import { getProject } from '../api/projects/projectsApi';
import { listProjectAgents } from '../api/agents/agentsApi';
import { getBranches } from '../api/chat/chatApi';
import { getMemory, getMemoryTrace, mutateMemory, proposeMemorySetup, retryMemory } from '../api/memories/memoriesApi';
import { getErrorMessage } from '../api/client';

export function useMemories(projectId: string, requestedBranch: string | null) {
  const [view, setView] = useState<MemoryView | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [branches, setBranches] = useState<ChatBranch[]>([]);
  const [agents, setAgents] = useState<ProjectAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [lastResult, setLastResult] = useState<MemoryResult | null>(null);
  const retryRequest = useRef<AbortController | null>(null);
  useEffect(() => () => retryRequest.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void (async () => {
      const [nextProject, nextBranches, nextAgents] = await Promise.all([
        getProject(projectId, controller.signal), getBranches(projectId, controller.signal),
        listProjectAgents(projectId, controller.signal),
      ]);
      const branchId = requestedBranch ?? nextProject.defaultBranchId;
      if (!branchId) throw new Error('Ce projet n’a pas de branche principale.');
      const next = await getMemory(projectId, branchId, controller.signal);
      if (controller.signal.aborted) return;
      setProject(nextProject); setBranches(nextBranches); setAgents(nextAgents); setView(next);
      setLastResult(null);
      if (next.headTurnId) {
        try {
          const trace = await getMemoryTrace(projectId, next.headTurnId, controller.signal);
          if (!controller.signal.aborted) setLastResult(trace.runs.at(-1)?.result ?? null);
        } catch (failure) {
          if (!controller.signal.aborted) setError(`Dernier traitement indisponible : ${getErrorMessage(failure)}`);
        }
      }
    })().catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(getErrorMessage(failure));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId, requestedBranch, revision]);

  async function change(input: MemoryMutation['change'], expectedView?: MemoryView): Promise<boolean> {
    if (!view || pending) return false;
    setPending(true); setError('');
    try {
      const next = await mutateMemory(expectedView ?? view, input);
      setView(next);
      if (input.op === 'setAgentRead') setAgents((current) => current.map((agent) =>
        agent.agentId === input.agentId ? { ...agent, memoryRead: input.read } : agent));
      if (input.op === 'applySetup') {
        try { setAgents(await listProjectAgents(projectId)); }
        catch (failure) { setError(`Proposition appliquée, mais impossible de recharger les agents : ${getErrorMessage(failure)}`); }
      }
      return true;
    } catch (failure) { setError(getErrorMessage(failure)); return false; }
    finally { setPending(false); }
  }
  async function propose(): Promise<MemorySetupProposal | null> {
    if (!view || pending) return null;
    setPending(true); setError('');
    try { return await proposeMemorySetup(view); }
    catch (failure) { setError(getErrorMessage(failure)); return null; }
    finally { setPending(false); }
  }
  async function runGuardian() {
    if (!view?.headTurnId || pending || retryRequest.current) return;
    const controller = new AbortController();
    retryRequest.current = controller;
    setPending(true); setError(''); setLastResult(null);
    try {
      const result = await retryMemory(view, view.headTurnId, controller.signal);
      const next = await getMemory(projectId, view.branchId, controller.signal);
      if (!controller.signal.aborted) { setLastResult(result); setView(next); }
    } catch (failure) { if (!controller.signal.aborted) setError(getErrorMessage(failure)); }
    finally {
      if (!controller.signal.aborted) setPending(false);
      if (retryRequest.current === controller) retryRequest.current = null;
    }
  }
  return { view, project, branches, agents, loading, pending, error, change, propose, lastResult, runGuardian,
    reload: () => setRevision((value) => value + 1) };
}
