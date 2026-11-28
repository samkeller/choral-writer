import { useEffect, useState } from 'react';
import type { TurnTraceSummary } from '@choral-writer/shared';

import { getTurnTraceSummary } from '../../../api/chat/traceApi';
import { getErrorMessage } from '../../../api/client';

export type SummaryState = { summary: TurnTraceSummary | null; loading: boolean; error: string; retry: () => void };

/** The trace summary of one turn, reloaded when the turn changes or on `retry`. */
export function useTurnTraceSummary(projectId: string, turnId: string): SummaryState {
  const [summary, setSummary] = useState<TurnTraceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSummary(null);
    void getTurnTraceSummary(projectId, turnId, controller.signal).then(setSummary).catch((loadError: unknown) => {
      if (!controller.signal.aborted) setError(getErrorMessage(loadError));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [projectId, turnId, revision]);

  return { summary, loading, error, retry: () => setRevision((value) => value + 1) };
}
