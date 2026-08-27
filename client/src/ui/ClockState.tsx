/**
 * The clock, as far as this page can tell.
 *
 * Paused and stale look alike to a casual glance and mean opposite things. Paused is a
 * state the clock reported — a rate of zero, which is exactly what screenshot capture
 * pins (FR-53) — and it is displayed prominently so that a still page is not read as a
 * healthy one. Stale is the absence of any state, and says so.
 *
 * A rate of zero decays nothing on this page, because liveness windows are real time
 * (ADR-0006). Stopping the simulated world does not stop the processes simulating it,
 * and a capture taken with the rate pinned shows the components that are genuinely alive
 * still lit.
 */
import type { ClockView } from "../transport/clock";

const WORDS: Readonly<Record<ClockView["display"], string>> = {
  unheard: "No time sample has arrived. The page does not know what time the simulation is at.",
  running: "Running. Simulation time is advancing.",
  paused:
    "Paused: the clock reports a rate of zero. Simulated time is not advancing, and nothing here decays while it is not, because liveness is measured in real time.",
  stale:
    "Stale: no time sample within tolerance, and the clock is not being heard from. This is the absence of a clock, not a paused one.",
};

const MARKS: Readonly<Record<ClockView["display"], string>> = {
  unheard: "○",
  running: "▶",
  paused: "‖",
  stale: "⨯",
};

export function ClockState({ clock }: { readonly clock: ClockView }): JSX.Element {
  const sample = clock.sample;
  return (
    <section className="panel" data-testid="clock-state" data-clock={clock.display}>
      <h2>Simulation clock</h2>
      <p className={`state clock-${clock.display}`} data-testid="clock-display">
        <span aria-hidden="true">{MARKS[clock.display]} </span>
        {WORDS[clock.display]}
      </p>
      <dl>
        <dt>Mode</dt>
        <dd data-testid="clock-mode">{sample === null ? "not heard" : sample.mode}</dd>
        <dt>Rate</dt>
        <dd data-testid="clock-rate">{sample === null ? "not heard" : sample.rate}</dd>
        <dt>Tick</dt>
        <dd data-testid="clock-tick">{sample === null ? "not heard" : sample.tick}</dd>
        <dt>Simulation time</dt>
        <dd data-testid="clock-sim-time">{sample === null ? "not heard" : sample.simTime}</dd>
        <dt>Last sample</dt>
        {/*
          The sample's own run identifier, not a host duration since it arrived. FR-009
          confines host time to illumination: a figure counting upwards would make the
          page differ frame to frame, and two captures of the same pinned state would
          never be identical (SC-009). Whether the sample is recent is already said by
          the four-state display above, which is where that judgement belongs.
        */}
        <dd data-testid="clock-sample-run">{sample === null ? "never" : sample.runId}</dd>
      </dl>
      {clock.discarded === 0 ? null : (
        <p className="detail" data-testid="clock-discard-count">
          {clock.discarded} time sample{clock.discarded === 1 ? "" : "s"} discarded for failing the
          contract{clock.lastDiscardReason === null ? "" : `: ${clock.lastDiscardReason}`}.
        </p>
      )}
    </section>
  );
}
