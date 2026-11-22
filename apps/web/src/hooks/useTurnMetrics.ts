import { useEffect, useState } from 'react';
import type { ChatHistory, TurnMetrics } from '@choral-writer/shared';

import { getTurnMetrics } from '../api/chat/traceApi';
import { getErrorMessage } from '../api/client';

/**
 * Metrics of the displayed branch, reloaded once its history settles: an operation may reload the
 * history several times while pending, the metrics only once it ends.
 */
export function useTurnMetrics(projectId: string, history: ChatHistory | null, pending: boolean) {
  const [metrics, setMetrics] = useState<TurnMetrics[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const branchId = history?.branch.id;

  useEffect(() => {
    if (!branchId || pending) return;
    const controller = new AbortController();
    setError('');
    void getTurnMetrics(projectId, branchId, controller.signal).then(setMetrics).catch((loadError: unknown) => {
      if (controller.signal.aborted) return;
      setMetrics(null);
      setError(getErrorMessage(loadError));
    });
    return () => controller.abort();
  }, [projectId, branchId, history, pending, revision]);

  return { metrics, error, reload: () => setRevision((value) => value + 1) };
}
