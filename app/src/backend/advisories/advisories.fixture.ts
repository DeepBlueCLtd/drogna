/**
 * What feature 108's advisory scenarios share.
 *
 * Extracted when these tests were split across two files, for the reason
 * model-runner/loop.fixture.ts records: vitest's worker RPC has a sixty-second window,
 * a file that turns the loop synchronously never yields to service the reply, and a
 * file whose scenarios total more than that fails the run while every test in it
 * passes. Feature 115 put an analysis in the loop and pushed this file over the line.
 *
 * Client identifiers are counted rather than drawn from `Math.random`, which is what
 * these helpers did while they were exempt from the seeded-randomness gate.
 *
 * Feature 108: shore advisories, the offload packager, and the Features face.
 * Nothing mocked: the source authors from its seed stream on the real clock, the
 * store refuses at its own seam, the packager stages from genuine published runs,
 * and every document is validated against its master as it crosses.
 */
import { expect } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { Advisory, ConfigRun, OffloadTelemetry, RunPublished } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { buildBackend, type BackendRuntime } from '../runtime/runtime.js';

export const validator = createSeamValidator();

export function lockstepConfig(): ConfigRun {
  const config = JSON.parse(JSON.stringify(runConfigDocument)) as ConfigRun;
  config.clock.mode = 'lockstep';
  config.clock.rate = 0;
  return config;
}

let clientOrdinal = 0;

export const options = { rootSeed: 4242, revision: 'test', dirty: false };

/**
 * Turn the loop until it has published `wanted` runs, or give up at `limit` ticks.
 *
 * A fixed tick count used to be enough because the loop breached often. Feature 115
 * put an analysis in front of the runner, so the forecast is corrected by what the
 * platform measured and the residual stays under the monitor's threshold far longer:
 * over 3700 ticks the shipped configuration now publishes one run where it used to
 * publish two. Waiting for the runs the test actually needs says what it needs, rather
 * than encoding how excitable the sea happened to be.
 */
export function driveUntilRuns(
  runtime: BackendRuntime,
  config: ConfigRun,
  wanted: number,
  limit: number,
): AdvisoryRecord {
  const shell = runtime.transport.connect(`until-${(clientOrdinal += 1)}`, 'shell');
  const record: AdvisoryRecord = { advisories: [], published: [], offloadReports: [] };
  shell.subscribe(config.advisory_source.topics.advisory, (message) => {
    record.advisories.push(message.payload as Advisory);
  });
  shell.subscribe(config.model_runner.topics.run_published, (message) => {
    record.published.push(message.payload as RunPublished);
  });
  shell.subscribe(config.offload.topics.offload, (message) => {
    record.offloadReports.push(message.payload as OffloadTelemetry);
  });
  for (let tick = 0; tick < limit && record.published.length < wanted; tick++) runtime.clock.tickOnce();
  return record;
}

export interface AdvisoryRecord {
  advisories: Advisory[];
  published: RunPublished[];
  offloadReports: OffloadTelemetry[];
}

export function drive(runtime: BackendRuntime, config: ConfigRun, ticks: number): AdvisoryRecord {
  const shell = runtime.transport.connect(`shell-${(clientOrdinal += 1)}`, 'shell');
  const record: AdvisoryRecord = { advisories: [], published: [], offloadReports: [] };
  shell.subscribe(config.advisory_source.topics.advisory, (message) => {
    expect(validator.validate('advisory', message.payload).refusals).toEqual([]);
    record.advisories.push(message.payload as Advisory);
  });
  shell.subscribe(config.model_runner.topics.run_published, (message) => {
    record.published.push(message.payload as RunPublished);
  });
  shell.subscribe(config.offload.topics.offload, (message) => {
    expect(validator.validate('offload-telemetry', message.payload).refusals).toEqual([]);
    record.offloadReports.push(message.payload as OffloadTelemetry);
  });
  for (let i = 0; i < ticks; i++) runtime.clock.tickOnce();
  return record;
}

/** Every string-typed schema node reachable from the given node. */


export { buildBackend };
export type { BackendRuntime };
