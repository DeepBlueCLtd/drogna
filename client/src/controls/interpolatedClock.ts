/**
 * The one place in this client that reads the browser's animation frame timestamp.
 *
 * ADR-0007 grants the exemption and bounds it with three rules. All three are held here,
 * and the shape of the module is the argument that they are held:
 *
 * 1. **It interpolates between two received samples and never past the most recent one.**
 *    The displayed instant walks from the earlier sample towards the later one and stops
 *    there. It follows that the display *trails* the clock by up to one sample interval.
 *    That is the price of the rule and it is the right price: a display that ran ahead
 *    would be inventing a simulation time the clock has not reached, which is precisely
 *    what the rule forbids.
 * 2. **Every arriving sample is authoritative and snaps the display to it.** On arrival
 *    the pair is replaced wholesale and the fraction restarts at zero, whose value is the
 *    newly-previous sample's own instant — a received value, not a computed one. Nothing
 *    is blended and nothing is carried forward, so error cannot accumulate across samples.
 * 3. **No value derived from the frame timestamp leaves the render path.** This module
 *    returns no simulation-time number at all. It returns text to print and a unitless
 *    fraction between zero and one to drive an animation with. There is no accessor for
 *    the interpolated instant in microseconds, so there is nothing for a query, a message
 *    or a recorded observation to be given. `tests/controls/interpolationDoesNotEscape`
 *    holds that shut from the other side (SC-014).
 *
 * If sample arrival stops, the fraction saturates at one and the display holds at the last
 * sample rather than drifting forward. A rate of zero — the two samples carrying the same
 * instant — is therefore indistinguishable from a paused display, which is correct.
 *
 * Rendering on clock samples alone stays supported: pass `interpolate: false` and the
 * display steps at the sample rate. Dropping interpolation costs smoothness and nothing
 * else, which is the fallback ADR-0007 keeps open.
 */
import { useEffect, useState } from "react";

import { isoFromMicros, microsFromIso } from "./simInstant";

/** One received clock sample, reduced to what the display needs of it. */
export interface DisplaySample {
  /** The instant the clock reported, exactly as it spelt it. */
  readonly simTime: string;
  /** Host instant of arrival, from the shell's own monotonic reading (ADR-0006). */
  readonly receivedAt: number;
}

/** The two most recent samples. `previous` is null until a second one has arrived. */
export interface SamplePair {
  readonly previous: DisplaySample | null;
  readonly latest: DisplaySample | null;
}

export const NO_SAMPLES: SamplePair = { previous: null, latest: null };

/**
 * Fold an arriving sample into the pair, discarding whatever the interpolation was doing.
 *
 * This is rule two, in three lines. The pair is replaced; nothing about the frame the
 * display happened to be on survives the call.
 */
export function receiveDisplaySample(pair: SamplePair, sample: DisplaySample): SamplePair {
  return { previous: pair.latest, latest: sample };
}

/**
 * What to draw this frame.
 *
 * `text` is the instant to print. `fraction` says how far between the two samples the
 * frame sits, for an animation that wants to move rather than to print. `interpolated`
 * says whether the instant shown is a received sample verbatim or a point between two of
 * them, so the display can decline to claim more precision than it has.
 */
export interface FrameInstant {
  readonly text: string | null;
  readonly fraction: number;
  readonly interpolated: boolean;
  /** True while the display is holding at the most recent sample rather than moving. */
  readonly holding: boolean;
}

export const NO_INSTANT: FrameInstant = {
  text: null,
  fraction: 0,
  interpolated: false,
  holding: true,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value >= 1 ? 1 : value;
}

/**
 * The instant to draw, given the two most recent samples and this frame's host timestamp.
 *
 * Pure, and total: an unparsable instant, a single sample, two samples that arrived at the
 * same host instant, or samples out of order all fall back to printing the most recent
 * sample verbatim. Falling back to the sample is always safe, because the sample is a
 * value the clock actually reached.
 */
export function frameInstant(
  pair: SamplePair,
  frameTimestamp: number,
  interpolate = true,
): FrameInstant {
  const { previous, latest } = pair;
  if (latest === null) {
    return NO_INSTANT;
  }
  const verbatim: FrameInstant = {
    text: latest.simTime,
    fraction: 1,
    interpolated: false,
    holding: true,
  };
  if (!interpolate || previous === null) {
    return verbatim;
  }
  const span = latest.receivedAt - previous.receivedAt;
  if (!(span > 0)) {
    return verbatim;
  }
  const from = microsFromIso(previous.simTime);
  const to = microsFromIso(latest.simTime);
  if (from === null || to === null || to < from) {
    return verbatim;
  }
  const fraction = clamp01((frameTimestamp - latest.receivedAt) / span);
  if (to === from) {
    // A rate of zero, or a clock that has not moved between samples. There is nothing to
    // interpolate, and saying "holding" is the honest description of a still display.
    return { text: latest.simTime, fraction, interpolated: false, holding: true };
  }
  return {
    text: isoFromMicros(Math.round(from + (to - from) * fraction)),
    fraction,
    interpolated: fraction > 0 && fraction < 1,
    holding: fraction >= 1,
  };
}

/**
 * The animation hook, and the marked read.
 *
 * The timestamp arrives as the argument to the frame callback rather than from a call to
 * a clock, which is why no lint pattern fires on the line below. The marker is there
 * anyway, because SC-013 counts exemptions rather than lint findings, and an exemption
 * that is only visible to someone reading the ADR is not an exemption anybody reviewed.
 *
 * `frames` is injectable so the hook can be driven without a browser. What is injected is
 * a scheduler, not a clock: it decides *when* the callback runs, and the value it passes
 * is the host timestamp of that frame either way.
 */
export type FrameScheduler = (callback: (timestamp: number) => void) => number;
export type FrameCanceller = (handle: number) => void;

export interface InterpolationOptions {
  readonly interpolate?: boolean;
  readonly schedule?: FrameScheduler;
  readonly cancel?: FrameCanceller;
}

export function useFrameInstant(
  pair: SamplePair,
  options: InterpolationOptions = {},
): FrameInstant {
  const { interpolate = true, schedule, cancel } = options;
  const [instant, setInstant] = useState<FrameInstant>(NO_INSTANT);

  useEffect(() => {
    const request = schedule ?? ((callback) => requestAnimationFrame(callback));
    const release = cancel ?? ((handle) => cancelAnimationFrame(handle));
    let handle = 0;
    let live = true;
    const draw = (timestamp: number): void => {
      if (!live) {
        return;
      }
      // harness:allow-wallclock ADR-0007, the frame timestamp interpolates between two received clock samples and reaches nothing outside this module
      setInstant(frameInstant(pair, timestamp, interpolate));
      handle = request(draw);
    };
    handle = request(draw);
    return () => {
      live = false;
      release(handle);
    };
  }, [pair, interpolate, schedule, cancel]);

  return instant;
}
