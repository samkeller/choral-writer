import { useCallback, useEffect, useRef, useState } from 'react';
import type { TurnAttribution, TurnAttributionResponse, TurnTraceSummary } from '@choral-writer/shared';

import { attributeTurn } from '../../../api/chat/traceApi';
import { getErrorMessage } from '../../../api/client';

export type AttributionState =
  | { status: 'waiting' }
  /** The turn has no prose: there is nothing to attribute. */
  | { status: 'unavailable' }
  | { status: 'loading' }
  /** What the server holds for the turn: an attribution, its last failure, or both. */
  | { status: 'ready'; response: TurnAttributionResponse }
  /** The request itself failed (network, server): nothing is known of the attribution. */
  | { status: 'error'; error: string };

export type TurnAttributionHandle = {
  state: AttributionState;
  /** Recomputes the attribution, at the cost of a new LLM call; only ever called on a click. */
  regenerate: () => void;
  /** Repeats what failed: a recomputation after a failure of the model, the same request otherwise. */
  retry: () => void;
};

/** Whether the prose has been read, for the views that count on it. */
export type ReadingStatus = 'pending' | 'unavailable' | 'failed' | 'ready';

export function proseReading(state: AttributionState): { reading: TurnAttribution | null; status: ReadingStatus } {
  switch (state.status) {
    case 'unavailable': return { reading: null, status: 'unavailable' };
    case 'error': return { reading: null, status: 'failed' };
    case 'ready': {
      const reading = state.response.attribution;
      return { reading, status: reading ? 'ready' : 'failed' };
    }
    default: return { reading: null, status: 'pending' };
  }
}

/**
 * The attribution of the displayed turn. It is read once per turn, when `enabled` (a view that shows it is open)
 * and the summary shows a prose; the server computes it on first read and caches it, failures included.
 * Only `regenerate` and `retry`, on a click, ask the server to pay again: navigating between turns or reloading
 * the summary never does. Leaving the turn aborts the request, not the computation, whose result stays cached.
 */
export function useTurnAttribution(
  projectId: string, turnId: string, summary: TurnTraceSummary | null, enabled: boolean,
): TurnAttributionHandle {
  const [state, setState] = useState<AttributionState>({ status: 'waiting' });
  const controller = useRef<AbortController | null>(null);
  /** The turn whose first read was sent: it is never sent twice. */
  const readTurnId = useRef<string | null>(null);
  const lastRegenerate = useRef(false);
  const loaded = summary?.turnId === turnId;
  const hasProse = loaded && Boolean(summary.narrator?.prose);

  const send = useCallback((regenerate: boolean) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    lastRegenerate.current = regenerate;
    setState({ status: 'loading' });
    attributeTurn(projectId, turnId, regenerate, current.signal)
      .then((response) => { if (!current.signal.aborted) setState({ status: 'ready', response }); })
      .catch((error: unknown) => {
        if (!current.signal.aborted) setState({ status: 'error', error: getErrorMessage(error) });
      });
  }, [projectId, turnId]);

  useEffect(() => {
    setState({ status: 'waiting' });
    return () => {
      controller.current?.abort();
      readTurnId.current = null;
    };
  }, [projectId, turnId]);

  useEffect(() => {
    if (!loaded) return;
    if (!hasProse) {
      setState({ status: 'unavailable' });
      return;
    }
    if (!enabled || readTurnId.current === turnId) return;
    readTurnId.current = turnId;
    send(false);
  }, [loaded, hasProse, enabled, turnId, send]);

  return {
    state,
    regenerate: () => send(true),
    retry: () => send(state.status === 'ready' || lastRegenerate.current),
  };
}
