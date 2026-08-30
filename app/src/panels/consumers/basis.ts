/**
 * What a consumer is reasoning against, and stale-then-refresh over it (FR-78).
 *
 * **Why there are two kinds of basis.** The first version of this waited for a published
 * forecast and drew nothing until one arrived — which, at the scenario's own cadence, is
 * several minutes of three blank yellow tabs. That is honest and useless: a downstream
 * consumer opening at 0900 does not sit in the dark until the next model run, it works
 * from whatever the service is already holding and takes the forecast up when it lands.
 * So a consumer starts from the **now-cast** the coverage store already holds, read
 * through the ordinary inventory endpoint, and says which of the two it is standing on.
 *
 * That makes the freshness ceremony *better* rather than weaker. With a now-cast basis on
 * screen, the first published forecast is a genuine change of basis: the halo goes up, the
 * answer does not move, and the click produces the ghost — the whole demonstration, from
 * the first minute, instead of after the first model run.
 *
 * **What does not raise a halo.** The now-cast is itself replaced on its own cadence, and
 * that replacement is announced. A consumer standing on a now-cast does not chase those:
 * FR-78's trigger is a published run becoming current, and a second staleness source would
 * make the halo mean two things. The now-cast is the bootstrap, and the tab says so.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ConfigShell, CoverageHolding, HoldingsInventory, RunPublished } from '../../generated/types.js';
import type { SeamClient } from '../../seam/transport.js';
import type { SeamValidator } from '../../seam/validate.js';
import { domainFromRun, instantMillis, type Domain } from './domain.js';

export interface Basis {
  readonly kind: 'nowcast' | 'forecast';
  /** The run id, or the holding id: what the ghost hangs on and the frame names. */
  readonly identity: string;
  /** The EDR collection this basis is servable under. */
  readonly collection: string;
  readonly domain: Domain;
  /** When it became visible, in simulation time. */
  readonly since: string;
  readonly validFrom: string;
  readonly validTo: string;
}

export interface Freshness {
  /** What the displayed answer is computed against. */
  readonly basis?: Basis;
  /** A newer forecast, announced and not yet taken up. */
  readonly pending?: Basis;
  /** Take the pending forecast up. A no-op when there is none. */
  readonly update: () => void;
  readonly refusal?: string;
}

function forecastBasis(run: RunPublished): Basis {
  return {
    kind: 'forecast',
    identity: run.run_id,
    collection: run.collections.forecast,
    domain: domainFromRun(run),
    since: run.sim_time,
    validFrom: run.valid_time.start_sim_time,
    validTo: run.valid_time.end_sim_time,
  };
}

/**
 * A now-cast holding as a basis. The collection identifier is the holding's own era,
 * which is how the query layer names it — an enumerated value off the holdings master
 * rather than a string typed here, so a consumer asks for exactly what is served.
 */
export function nowcastBasis(holding: CoverageHolding): Basis {
  const { longitude, latitude, depth, time } = holding.manifest.grid;
  const originMillis = instantMillis(time.origin_sim_time);
  const at = (offsetSeconds: number) =>
    `${new Date(originMillis + offsetSeconds * 1000).toISOString().slice(0, 23)}000Z`;
  return {
    kind: 'nowcast',
    identity: holding.holding_id,
    collection: holding.era,
    domain: {
      west: longitude.minimum,
      east: longitude.maximum,
      south: latitude.minimum,
      north: latitude.maximum,
      minimumDepthM: depth.minimum,
      maximumDepthM: depth.maximum,
    },
    since: holding.published_at.sim_time,
    validFrom: at(time.start_offset_seconds),
    validTo: at(time.start_offset_seconds + (time.count - 1) * time.step_seconds),
  };
}

export function useConsumerBasis(
  config: ConfigShell,
  client: SeamClient,
  validator: SeamValidator,
): Freshness {
  const [basis, setBasis] = useState<Basis | undefined>();
  const [pending, setPending] = useState<Basis | undefined>();
  const [refusal, setRefusal] = useState<string | undefined>();

  // The bootstrap: one genuine GET against the configured inventory path, exactly the
  // request the Holdings tab makes. Nothing polls it afterwards.
  useEffect(() => {
    let dropped = false;
    void (async () => {
      const response = await fetch(config.endpoints.holdings);
      if (!response.ok || dropped) return;
      const body = (await response.json()) as unknown;
      const verdict = validator.validate('holdings-inventory', body);
      if (!verdict.ok) {
        setRefusal(`the inventory was refused by its master: ${verdict.refusals[0]}`);
        return;
      }
      const nowcast = (body as HoldingsInventory).holdings.find((holding) => holding.era === 'nowcast');
      if (!nowcast || dropped) return;
      // A forecast heard while this was in flight wins: it is the newer basis, and the
      // now-cast exists here only so that something is on screen before one arrives.
      setBasis((standing) => standing ?? nowcastBasis(nowcast));
    })();
    return () => {
      dropped = true;
    };
  }, [config.endpoints.holdings, validator]);

  useEffect(() => {
    return client.subscribe(config.topics.run_published, (message) => {
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
      const arrived = forecastBasis(run);
      setBasis((standing) => {
        // Nothing on screen yet — not even a now-cast — so there is nothing to be stale
        // against and no ceremony to perform.
        if (standing === undefined) return arrived;
        if (standing.identity !== arrived.identity) setPending(arrived);
        return standing;
      });
    });
  }, [client, config.topics.run_published, validator]);

  const update = useCallback(() => {
    setPending((waiting) => {
      if (waiting) setBasis(waiting);
      return undefined;
    });
  }, []);

  return { basis, pending, update, refusal };
}
