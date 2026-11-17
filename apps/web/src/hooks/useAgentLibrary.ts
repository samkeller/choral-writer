import { useEffect, useState } from 'react';
import type { Agent } from '@choral-writer/shared';
import { listAgents } from '../api/agents/agentsApi';
import { getErrorMessage } from '../api/client';

export function useAgentLibrary() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    listAgents(controller.signal).then((result) => {
      if (!controller.signal.aborted) setAgents(result);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(getErrorMessage(failure));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [revision]);
  return { agents, loading, error, reload: () => setRevision((value) => value + 1) };
}
