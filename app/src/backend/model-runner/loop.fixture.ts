/**
 * What the forecast loop's scenario tests share (feature 105).
 *
 * Extracted when the loop's tests were split across two files. The split is not
 * cosmetic: vitest's worker talks to the main process over an RPC with a sixty-second
 * timeout, and a test file that turns the loop synchronously never yields to service
 * the reply — so a file whose scenarios total more than that fails the run with an
 * unhandled `Timeout calling "onTaskUpdate"` while every test in it passes. Feature 115
 * put an analysis in the loop and pushed two files over the line. Splitting them costs
 * no coverage; trimming the scenarios would have cost the thing they are for.
 *
 * Client identifiers are counted rather than drawn from `Math.random`, which is what
 * the tests used while they were exempt from the seeded-randomness gate. A harness
 * whose whole claim is determinism should not be seeding its own test clients from
 * entropy, and here it no longer does.
 */
import { expect } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun, Divergence, RunPublished, RunRequest } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';

export const validator = createSeamValidator();
export const options = { rootSeed: 4242, revision: 'test', dirty: false };

export function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

export interface LoopRecord {
  divergences: Divergence[];
  requests: RunRequest[];
  published: RunPublished[];
}

let clientOrdinal = 0;

/** Turn the loop for a fixed number of ticks, validating every control message. */
export function drive(runtime: BackendRuntime, config: ConfigRun, ticks: number): LoopRecord {
  const shell = runtime.transport.connect(`shell-${(clientOrdinal += 1)}`, 'shell');
  const record: LoopRecord = { divergences: [], requests: [], published: [] };
  shell.subscribe(config.monitor.topics.divergence, (message) => {
    expect(validator.validate('divergence', message.payload).refusals).toEqual([]);
    record.divergences.push(message.payload as Divergence);
  });
  shell.subscribe(config.scheduler.topics.run_request, (message) => {
    expect(validator.validate('run-request', message.payload).refusals).toEqual([]);
    record.requests.push(message.payload as RunRequest);
  });
  shell.subscribe(config.model_runner.topics.run_published, (message) => {
    expect(validator.validate('run-published', message.payload).refusals).toEqual([]);
    record.published.push(message.payload as RunPublished);
  });
  for (let i = 0; i < ticks; i++) runtime.clock.tickOnce();
  return record;
}

export { buildBackend };
