import { useEffect, useState } from 'react';
import type { TurnAttributionResponse, TurnTraceSummary } from '@choral-writer/shared';

import { attributeTurn } from '../../../api/chat/traceApi';
import { getErrorMessage } from '../../../api/client';

export type AttributionState =
  | { status: 'waiting' }
  /** The turn has no prose: there is nothing to attribute. */
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'ready'; response: TurnAttributionResponse }
  | { status: 'error'; error: string };

export type TurnAttributionHandle = {
  state: AttributionState;
  /** Recomputes the attribution, at the cost of a new LLM call. */
  regenerate: () => void;
  /** Repeats the request that failed. */
  retry: () => void;
};

/**
 * The attribution of the displayed turn, requested as soon as its summary shows a prose. The server computes
 * it on first request and caches it: reopening a turn costs nothing, only `regenerate` pays again.
 * Leaving the turn aborts the request, not the computation, whose result stays cached.
 */
export function useTurnAttribution(
  projectId: string, turnId: string, summary: TurnTraceSummary | null,
): TurnAttributionHandle {
  const [state, setState] = useState<AttributionState>({ status: 'waiting' });
  const [request, setRequest] = useState({ turnId, regenerate: false, revision: 0 });
  const loaded = summary?.turnId === turnId;
  const hasProse = loaded && Boolean(summary.narrator?.prose);
  const ownRequest = request.turnId === turnId;
  const regenerate = ownRequest && request.regenerate;
  const revision = ownRequest ? request.revision : 0;

  useEffect(() => {
    if (!loaded) {
      setState({ status: 'waiting' });
      return;
    }
    if (!hasProse) {
      setState({ status: 'unavailable' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    attributeTurn(projectId, turnId, regenerate, controller.signal)
      .then((response) => setState({ status: 'ready', response }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', error: getErrorMessage(error) });
      });
    return () => controller.abort();
  }, [projectId, turnId, loaded, hasProse, regenerate, revision]);

  return {
    state,
    regenerate: () => setRequest((current) => ({ turnId, regenerate: true, revision: current.revision + 1 })),
    retry: () => setRequest((current) => ({
      turnId, regenerate: current.turnId === turnId && current.regenerate, revision: current.revision + 1,
    })),
  };
}
