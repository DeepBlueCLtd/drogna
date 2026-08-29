/**
 * The slide stage (FR-006), built here rather than adopted: no slide library, no new
 * dependency, and SRD-v2 NFR-05's toolchain is unchanged by this feature. The
 * interview settled bespoke-over-a-library, so nothing contested survives and there
 * is no ADR to write.
 *
 * A slide is a step like any other — the spine drives it, the address names it, and
 * it obeys FR-019 by opening finished. What differs from the interactive stage is
 * only the arrangement: the drawing leads and the prose sits under it, because a
 * slide argues by picture.
 */
import type { ReactNode } from 'react';
import type { Explainer, FigureContext } from './model.js';
import { Figure, LiveViewLink } from './layout.js';

export function Slides({
  step,
  width,
  context,
  onView,
}: {
  step: Explainer['steps'][number];
  width: number | undefined;
  context: FigureContext;
  onView: (view: string) => void;
}): ReactNode {
  return (
    <div className="bg-step bg-slide">
      <h3>{step.title}</h3>
      {step.figure ? <Figure figure={step.figure} width={width} context={context} /> : null}
      <div className="bg-prose">
        {step.prose.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {step.note ? <p className="bg-note">{step.note}</p> : null}
        <LiveViewLink liveView={step.liveView} onView={onView} />
      </div>
    </div>
  );
}
