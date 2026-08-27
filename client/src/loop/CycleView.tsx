/**
 * The loop, turning, with the phase it has reached distinguished from the ones it has not.
 *
 * SRD §2 draws sense → decide → act → publish as a cycle, and this draws the same cycle
 * from the messages that actually arrived. A phase is active because the control message
 * that marks it was received and its schema accepted it. There is no other route to an
 * active phase, and none to a transit: both take their inputs from the loop state, whose
 * only entry point is a received message.
 *
 * The three loop statuses are the point of FR-007 and they are drawn differently on
 * purpose. **Stopped and disconnected** means the page cannot hear; **idle and
 * connected** means it can hear and nothing has been said; **turning** means a run is in
 * progress. The first two look identical if a display only draws what arrived, and they
 * mean opposite things — one is a broken display and the other is a true report — so
 * each carries its own word, its own mark and its own sentence.
 */
import type { LoopState, LoopStatus } from "../data/controlSubscription";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../layout/geometry";

import { Transit } from "./Transit";
import { CYCLE_PHASES, PHASE_WORDS } from "./transitRouting";
import type { CyclePhase } from "./transitRouting";

export interface LoopStatusWords {
  readonly label: string;
  readonly glyph: string;
  readonly detail: string;
}

/** What each status is called and what it means, in words a viewer reads. */
export const LOOP_STATUS_WORDS: Readonly<Record<LoopStatus, LoopStatusWords>> = {
  "stopped-disconnected": {
    label: "stopped, and not connected",
    glyph: "✕",
    detail:
      "The page has lost the broker, so it is not hearing anything and cannot say whether the loop is turning. This is a broken display, not a quiet system.",
  },
  "idle-connected": {
    label: "idle, and connected",
    glyph: "○",
    detail:
      "The page is connected to the broker and no control message has arrived. The loop is genuinely quiet; nothing is wrong with the display.",
  },
  turning: {
    label: "turning",
    glyph: "◍",
    detail:
      "Control messages are arriving and the cycle is being traversed. The active phase below is the one the most recent run message marked.",
  },
};

export interface CycleViewProps {
  readonly loop: LoopState;
  readonly status: LoopStatus;
  /**
   * How far along its boundary each transit is drawn, from zero to one.
   *
   * Supplied by the caller so this component reads no clock. A caller with the render
   * path's interpolation hands it that; a still display hands it a constant, and pinning
   * the rate to zero holds it still, which is what SC-009 needs.
   */
  readonly progress: number;
}

function PhaseStep({ phase, active, reached }: { phase: CyclePhase; active: boolean; reached: boolean }): JSX.Element {
  const state = active ? "active" : reached ? "reached" : "not-reached";
  return (
    <li
      className={`phase phase-${state}`}
      data-testid={`cycle-phase-${phase}`}
      data-phase-state={state}
    >
      <span className="phase-mark" aria-hidden="true">
        {active ? "●" : reached ? "◐" : "○"}
      </span>
      <span className="phase-name">{phase}</span>
      <span className="phase-words">{PHASE_WORDS[phase]}</span>
    </li>
  );
}

/** The cycle, its status, and the transits drawn for the messages of the last frame. */
export function CycleView({ loop, status, progress }: CycleViewProps): JSX.Element {
  const words = LOOP_STATUS_WORDS[status];
  return (
    <section className="cycle" data-testid="cycle" data-loop-status={status}>
      <h2>The control loop</h2>
      <p className="loop-status" data-testid="loop-status">
        <span className="loop-status-mark" aria-hidden="true">
          {words.glyph}
        </span>{" "}
        <strong>{words.label}</strong> — {words.detail}
      </p>
      <ol className="phases">
        {CYCLE_PHASES.map((phase) => (
          <PhaseStep
            key={phase}
            phase={phase}
            active={loop.phase === phase}
            reached={loop.reached.includes(phase)}
          />
        ))}
      </ol>
      <p className="loop-counts" data-testid="loop-counts">
        {loop.messagesReceived} control messages received, {loop.transitsDrawn} transits drawn,{" "}
        {loop.lastFrame.coalesced} coalesced into another mark on the last frame,{" "}
        {loop.refused} refused by their schema.
      </p>
      {loop.lastRefusal === null ? null : (
        <p className="loop-refusal" data-testid="loop-refusal">
          The most recent refusal: {loop.lastRefusal}
        </p>
      )}
      <svg
        className="transits"
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        role="img"
        aria-label="Messages crossing the boundaries between components"
        data-testid="transit-canvas"
      >
        {loop.lastFrame.transits.map((transit) => (
          <Transit key={transit.boundary} transit={transit} progress={progress} />
        ))}
      </svg>
    </section>
  );
}
