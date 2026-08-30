/**
 * Stale-then-refresh (FR-73), the behaviour that makes the consumer tabs checkable.
 *
 * When a run becomes current, a consumer does **not** recalculate. It says a new forecast
 * is available and waits to be told. On the reader's click it takes the new run up and
 * the previous answer stays on screen as a ghost, so the delta is legible: where the
 * recommendation barely moves the new forecast was not decision-relevant, and where it
 * swings, the value of fresh environmental data has been shown rather than argued.
 *
 * A publication that is not current is not a new forecast to a consumer and does not
 * raise the halo. The message says which it is, so nothing here has to guess.
 *
 * Nothing polls. The only trigger is the run's own announcement on the configured topic,
 * which is also where a consumer learns the domain and the collections to ask for
 * (`domain.ts`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RunPublished } from '../../generated/types.js';
import type { SeamClient } from '../../seam/transport.js';
import type { SeamValidator } from '../../seam/validate.js';

export interface Freshness {
  /** The run the displayed answer is computed against, or undefined before the first. */
  readonly accepted?: RunPublished;
  /** A newer current run, announced and not yet taken up. */
  readonly pending?: RunPublished;
  /** Take the pending run up. A no-op when there is none. */
  readonly update: () => void;
  /** Why the last announcement was refused, if it was. */
  readonly refusal?: string;
}

export function useForecastFreshness(
  client: SeamClient,
  topic: string,
  validator: SeamValidator,
): Freshness {
  const [accepted, setAccepted] = useState<RunPublished | undefined>();
  const [pending, setPending] = useState<RunPublished | undefined>();
  const [refusal, setRefusal] = useState<string | undefined>();

  useEffect(() => {
    return client.subscribe(topic, (message) => {
      const verdict = validator.validate('run-published', message.payload);
      if (!verdict.ok) {
        setRefusal(`the publication was refused by its master: ${verdict.refusals[0]}`);
        return;
      }
      setRefusal(undefined);
      const run = message.payload as RunPublished;
      // A run published for inspection is not a new forecast to a consumer of the
      // current one. The message says which it is (run-published.schema.json).
      if (!run.current) return;
      setAccepted((standing) => {
        // The first one a consumer hears is taken up without ceremony: there is nothing
        // to be stale against, and a tab that opened empty and waited for a click would
        // be asking the reader to confirm a forecast they had never seen.
        if (standing === undefined) return run;
        if (standing.run_id !== run.run_id) setPending(run);
        return standing;
      });
    });
  }, [client, topic, validator]);

  const update = useCallback(() => {
    setPending((waiting) => {
      if (waiting) setAccepted(waiting);
      return undefined;
    });
  }, []);

  return { accepted, pending, update, refusal };
}

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
