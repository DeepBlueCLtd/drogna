/**
 * The ordered step machine every explainer obeys (FR-016), slides and interactive
 * alike.
 *
 * Three rules shape this file:
 *   - **Next always works, and performs the interaction** (FR-017). A step is a named
 *     state, and advancing drives the mechanism into it. A viewer who never touches a
 *     diagram still sees every state and reaches the Consequences panel — which is
 *     also what makes the course keyboard-traversable and capturable without a second
 *     code path.
 *   - **Free play does not change the address** (FR-018). Poking is a second route to
 *     states the spine already reaches, so it is held here and discarded when the
 *     spine moves. Arriving at a step by advancing and arriving by deep link show the
 *     same thing.
 *   - **Nothing animates on arrival** (FR-019). The stage opens finished. There is no
 *     autoplay, no timer, and no clock read of any kind (Constitution I).
 *
 * The arrow keys are not answered here. They walk the *course* — past an explainer's
 * last step into the next explainer — so they belong to the panel that holds a course
 * position, and `BackgroundPanel` owns them. These buttons stay bounded by the
 * explainer they count: they sit beside "step N of M", and a control that silently
 * leaves the thing it counts is a different control.
 *
 * The controls are pinned to the foot of the stage and the step's content scrolls
 * behind them. A tall step used to push Next off the bottom of the panel, so
 * advancing meant scrolling to find a button that had moved — which is a poor thing
 * to ask of the one control every viewer uses sixty-nine times.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { Explainer, FigureContext } from './model.js';
import { stepCount } from './model.js';
import { Figure, LiveViewLink } from './layout.js';
import { Slides } from './Slides.js';
import { ValuePanel } from './ValuePanel.js';

export interface SpineProps {
  readonly explainer: Explainer;
  /** 1-based, already clamped by the panel to something this explainer has. */
  readonly step: number;
  readonly onStep: (step: number) => void;
  readonly onView: (view: string) => void;
  /**
   * Rendered at the end of the scrolling region, below the step. The mark key lives
   * here rather than under the controls so that the controls are genuinely the last
   * thing at the foot and never shift.
   */
  readonly legend?: ReactNode;
}

export function Spine({ explainer, step, onStep, onView, legend }: SpineProps): ReactNode {
  const total = stepCount(explainer);
  const [poke, setPoke] = useState<string | undefined>(undefined);

  // Free play belongs to the step it was performed in (FR-018).
  useEffect(() => setPoke(undefined), [explainer.id, step]);

  const content = explainer.steps[step - 1];
  const context: FigureContext = { poke, onPoke: setPoke };

  return (
    <div
      className="bg-stage"
      data-explainer={explainer.id}
      data-step={step}
      data-form={explainer.form}
    >
      <div className="bg-scroll">
        {content === undefined ? (
          explainer.value ? (
            <ValuePanel value={explainer.value} />
          ) : (
            // FR-020 says this cannot happen in the course. It can happen in the
            // fixture SC-007's test is watched catching, and it must not be a blank.
            <p className="bg-figure-floor">This explainer states no consequences.</p>
          )
        ) : explainer.form === 'slides' ? (
          <Slides step={content} context={context} onView={onView} />
        ) : (
          <Interactive step={content} context={context} onView={onView} />
        )}
        {legend}
      </div>
      <nav className="bg-spine" aria-label={`${explainer.title}: step ${step} of ${total}`}>
        <button type="button" onClick={() => onStep(step - 1)} disabled={step <= 1}>
          ← previous
        </button>
        <button
          type="button"
          className="bg-next"
          onClick={() => onStep(step + 1)}
          disabled={step >= total}
        >
          next →
        </button>
        <span className="bg-position" data-testid="spine-position">
          step {step} of {total}
        </span>
        {/* Said out loud because a key that is never mentioned is a key nobody presses. */}
        <span className="bg-keyhint">← → walk the whole course</span>
      </nav>
    </div>
  );
}

/**
 * The interactive stage: prose beside the drawing where there is width for it, and
 * stacked below it where there is not (FR-023) — the stacking is CSS, so it needs no
 * second code path.
 */
function Interactive({
  step,
  context,
  onView,
}: {
  step: Explainer['steps'][number];
  context: FigureContext;
  onView: (view: string) => void;
}): ReactNode {
  return (
    <div className="bg-step">
      <div className="bg-prose">
        <h3>{step.title}</h3>
        {step.prose.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {step.play ? <p className="bg-play">{step.play}</p> : null}
        {step.note ? <p className="bg-note">{step.note}</p> : null}
        <LiveViewLink liveView={step.liveView} onView={onView} />
      </div>
      {step.figure ? <Figure figure={step.figure} context={context} /> : null}
    </div>
  );
}
