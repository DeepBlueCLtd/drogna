/**
 * Where a step's parts go, and what happens when there is not room for them.
 *
 * FR-023: prose sits beside the drawing where there is width for it and stacks below
 * it where there is not — that part is CSS, so it needs no second code path.
 * FR-024: below the width a drawing needs, the drawing is replaced by a statement of
 * the width it wants. Never scaled past legibility, and never rendered having
 * silently dropped its labels; the prose and the spine stay usable either way.
 */
import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import type { FigureContext, Step, StepFigure } from './model.js';

/**
 * The panel's width in CSS pixels, or undefined when there is nothing to measure.
 * Undefined is not narrow: an unknown width is no evidence of one, so the figure is
 * drawn rather than withheld.
 */
export function useMeasuredWidth(ref: RefObject<HTMLElement>): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () => setWidth(element.clientWidth || undefined);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** The drawing, or the honest statement of the width it wants. */
export function Figure({
  figure,
  width,
  context,
}: {
  figure: StepFigure;
  width: number | undefined;
  context: FigureContext;
}): ReactNode {
  if (width !== undefined && width < figure.minWidth) {
    return (
      <p className="bg-figure-floor" data-testid="figure-floor">
        The diagram needs about {figure.minWidth}px. Widen the panel to see it.
      </p>
    );
  }
  return (
    <figure className="bg-figure">
      <div className="bg-figure-frame" role="img" aria-label={figure.label}>
        {figure.draw(context)}
      </div>
      {figure.caption ? <figcaption>{figure.caption}</figcaption> : null}
    </figure>
  );
}

/**
 * FR-005: where a step claims something about drogna specifically rather than about
 * a standard, it links to the live view that shows it and does not depict it. The
 * system speaks for itself; a diagram would only be a claim about a tree that moves.
 */
export function LiveViewLink({
  liveView,
  onView,
}: {
  liveView: Step['liveView'];
  onView: (view: string) => void;
}): ReactNode {
  if (!liveView) return null;
  return (
    <p className="bg-live">
      <button type="button" className="bg-link" onClick={() => onView(liveView.view)}>
        {liveView.label}
      </button>
    </p>
  );
}
