import { useEffect, useState } from 'react';
import type { ChatHistory, TurnMetrics } from '@choral-writer/shared';

import { getTurnMetrics } from '../api/chat/traceApi';
import { getErrorMessage } from '../api/client';

/** Metrics of the displayed branch, reloaded whenever its history is reloaded. */
export function useTurnMetrics(projectId: string, history: ChatHistory | null) {
  const [metrics, setMetrics] = useState<TurnMetrics[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const branchId = history?.branch.id;

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    setError('');
    void getTurnMetrics(projectId, branchId, controller.signal).then(setMetrics).catch((loadError: unknown) => {
      if (controller.signal.aborted) return;
      setMetrics(null);
      setError(getErrorMessage(loadError));
    });
    return () => controller.abort();
  }, [projectId, branchId, history, revision]);

  return { metrics, error, reload: () => setRevision((value) => value + 1) };
}
