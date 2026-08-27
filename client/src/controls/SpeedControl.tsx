/**
 * The speed control: ask for a rate, and show the rate the clock reports in force.
 *
 * SRD FR-10 puts the rate control on the browser side and FR-49 asks this page to expose
 * it. What the control shows is never what it asked for — the number under it is the one
 * the clock reported on `ctl/clock`, and where the two differ the display says the
 * request was adjusted (FR-012). A control that echoed its own request would report
 * success it has no evidence for, and would do so most convincingly in the case where
 * the clock refused.
 *
 * Zero is offered first among the rates because it is a legitimate rate and the one an
 * interface is most likely to treat as an absence. Setting it pins the clock: simulation
 * time stops, everything driven by simulation time stops with it, and the page says
 * paused. The components stay lit, because liveness windows are real time (ADR-0006) and
 * the heartbeats keep arriving — which is what makes a capture at rate zero worth taking
 * at all (FR-53, SC-015).
 *
 * The acknowledged rate is also written where something outside the React tree can read
 * it, so a capture waits for the pin rather than shooting and hoping. That is
 * `captureReadiness`; the data attributes here are the second surface of the same three
 * facts.
 */
import { captureReadiness } from "./captureReadiness";
import { OFFERED_RATES, rateWords } from "./rateState";
import type { RateState } from "./rateState";

export interface SpeedControlProps {
  readonly rate: RateState;
  /** Called with the rate the viewer chose. Asking is all a viewer can do. */
  readonly onRequest: (rate: number) => void;
  /** Why no request can be sent, or null where one can. */
  readonly unavailable: string | null;
}

function rateLabel(rate: number): string {
  return rate === 0 ? "0 — paused" : `${rate}×`;
}

export function SpeedControl({ rate, onRequest, unavailable }: SpeedControlProps): JSX.Element {
  const readiness = captureReadiness(rate);
  return (
    <section
      className="panel speed-control"
      data-testid="speed-control"
      data-acknowledged-rate={readiness.acknowledgedRate === null ? "" : String(readiness.acknowledgedRate)}
      data-pinned={String(readiness.pinned)}
      data-awaiting={String(readiness.awaitingAcknowledgement)}
      data-steady={String(readiness.steady)}
    >
      <h2>Simulation speed</h2>
      <p className="rate-words" data-testid="rate-words">
        {rateWords(rate)}
      </p>
      <div className="rate-buttons" role="group" aria-label="Ask the clock for a simulation rate">
        {OFFERED_RATES.map((offered) => (
          <button
            key={offered}
            type="button"
            data-testid={`rate-${offered}`}
            data-in-force={String(rate.acknowledged === offered)}
            aria-pressed={rate.acknowledged === offered}
            disabled={unavailable !== null}
            onClick={() => {
              onRequest(offered);
            }}
          >
            {rateLabel(offered)}
          </button>
        ))}
      </div>
      {unavailable === null ? null : (
        <p className="rate-unavailable" data-testid="rate-unavailable">
          The rate cannot be changed from this page: {unavailable} The rate in force is still shown
          above, because it comes from the clock's own samples rather than from this control.
        </p>
      )}
      <p className="rate-in-force" data-testid="rate-in-force">
        {readiness.acknowledgedRate === null
          ? "The clock has not yet reported a rate in force."
          : `In force: ${readiness.acknowledgedRate}. Reported by the clock, not requested by this page.`}
      </p>
    </section>
  );
}
