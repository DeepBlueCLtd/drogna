/**
 * The ghost of stale-then-refresh (FR-73).
 *
 * What a consumer is reasoning against, and how a newly published forecast is taken up,
 * lives in `basis.ts`; what stays behind when it is taken up lives here. The ghost is the
 * point of the ceremony: where the recommendation barely moves the new forecast was not
 * decision-relevant, and where it swings, the value of fresh environmental data has been
 * shown rather than argued.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface Ghost<T> {
  readonly value: T;
  /** The run the ghosted answer was computed against. */
  readonly runId: string | undefined;
}

/**
 * The previous answer, kept when — and only when — the run under it changed.
 *
 * A local control is not a reason to ghost (FR-74 recomputes it instantly and the reader
 * is not comparing forecasts), and equally a local control is not a reason to *clear* a
 * ghost: re-tuning while both answers are on screen is exactly the comparison the ghost
 * is for. So the ghost is replaced by the next accepted update, and otherwise stands
 * until it is dismissed.
 *
 * The effects' order is load-bearing rather than incidental: on the commit where the run
 * changes the value has changed with it, so the run-watching effect has to promote the
 * old pair before the recording effect overwrites it.
 */
export function useGhostOnRunChange<T>(
  value: T,
  runId: string | undefined,
): { ghost?: Ghost<T>; dismiss: () => void } {
  const last = useRef<Ghost<T> | undefined>(undefined);
  const [ghost, setGhost] = useState<Ghost<T> | undefined>();

  useEffect(() => {
    // The first forecast a consumer hears is not an update: there is no previous answer
    // to ghost, and one drawn from the empty state would be a picture of nothing. Found
    // by a test that read the ghost's legend and got a run id that was the empty string.
    if (last.current?.runId !== undefined && last.current.runId !== runId) setGhost(last.current);
  }, [runId]);

  useEffect(() => {
    last.current = { value, runId };
  }, [value, runId]);

  const dismiss = useCallback(() => setGhost(undefined), []);
  return { ghost, dismiss };
}
