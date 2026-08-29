/**
 * Simulation time and rate, as heard over the seam. The display snaps to each
 * received clock sample (ADR-0007's bound: never extrapolate past the latest); the
 * rate control is a genuine seam request against the configured relative endpoint,
 * so V3 changes nothing here (FR-04, FR-09).
 */
import { useEffect, useState } from 'react';
import type { ConfigShell } from '../generated/types.js';
import type { SeamClient } from '../seam/transport.js';
import { displayInstant } from './display.js';

interface ClockSample {
  tick: number;
  sim_time: string;
  mode: string;
  rate: number;
}

export function ClockStrip({ config, client }: { config: ConfigShell; client: SeamClient }) {
  const [sample, setSample] = useState<ClockSample | undefined>();
  const [refusal, setRefusal] = useState<string | undefined>();

  useEffect(() => {
    return client.subscribe(config.topics.clock, (message) => {
      setSample(message.payload as ClockSample);
      setRefusal(undefined);
    });
  }, [client, config.topics.clock]);

  const setRate = async (rate: number) => {
    const response = await fetch(config.endpoints.clock_rate, {
      method: 'PUT',
      body: JSON.stringify({ rate }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { refused?: string };
      setRefusal(body.refused ?? `refused with status ${response.status}`);
    } else {
      setRefusal(undefined);
    }
  };

  return (
    <span className="clock-strip">
      <span className="clock-time" data-testid="sim-time">
        {sample ? displayInstant(sample.sim_time) : 'no clock heard yet'}
      </span>
      <span className="clock-rate" data-testid="sim-rate">
        rate {sample ? sample.rate : '—'}
      </span>
      {[0, 1, 60, 600].map((rate) => (
        <button
          key={rate}
          className={sample?.rate === rate ? 'rate-active' : ''}
          onClick={() => void setRate(rate)}
        >
          ×{rate}
        </button>
      ))}
      {refusal && <span className="shell-refusal">{refusal}</span>}
    </span>
  );
}
