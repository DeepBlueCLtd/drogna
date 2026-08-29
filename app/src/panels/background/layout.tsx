/**
 * Where a step's parts go, and what happens when there is not room for them.
 *
 * FR-023: prose sits beside the drawing where there is width for it and stacks below
 * it where there is not — that part is CSS, so it needs no second code path.
 * FR-024: below the width a drawing needs, the drawing is replaced by a statement of
 * the width it wants. Never scaled past legibility, and never rendered having
 * silently dropped its labels; the prose and the spine stay usable either way.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
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

/**
 * The drawing, or the honest statement of the width it wants.
 *
 * It measures **its own** column rather than being told the panel's width. Where
 * there is room, the prose sits beside the drawing and the drawing has roughly half
 * the panel; comparing a figure's minimum against the whole panel would pass a
 * figure that is in fact drawn at half of it, which is the case FR-024 is about.
 *
 * The measured element is the column, which is always present, and never the figure
 * inside it. Measuring the figure meant the measurement could unmount the thing it
 * was measuring: the observer then read a detached element as zero width, the floor
 * gave way to the drawing, the drawing was measured again, and the two took turns.
 * It settled on drawing, so the floor simply never appeared — watched happening,
 * when a figure whose minimum nothing could satisfy was drawn anyway.
 *
 * `width` is an override for tests, which have no layout to measure.
 */
export function Figure({
  figure,
  width: given,
  context,
}: {
  figure: StepFigure;
  width?: number;
  context: FigureContext;
}): ReactNode {
  const columnRef = useRef<HTMLDivElement>(null);
  const measured = useMeasuredWidth(columnRef);
  const width = given ?? measured;
  const tooNarrow = width !== undefined && width < figure.minWidth;
  return (
    <div className="bg-figure-column" ref={columnRef}>
      {tooNarrow ? (
        <p className="bg-figure-floor" data-testid="figure-floor">
          The diagram needs about {figure.minWidth}px. Widen the panel to see it.
        </p>
      ) : (
        <figure className="bg-figure">
          <div className="bg-figure-frame" role="img" aria-label={figure.label}>
            {figure.draw(context)}
          </div>
          {figure.caption ? <figcaption>{figure.caption}</figcaption> : null}
        </figure>
      )}
    </div>
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

/**
 * A sentence that belongs beside a drawing rather than inside it.
 *
 * Prose set as SVG <text> does not wrap: it runs past the viewBox and is clipped,
 * which looks like a finished diagram with a sentence cut in half. FR-024 forbids a
 * drawing that renders having silently dropped its labels, so a figure says its
 * words here, in HTML, where they wrap. A figure's own labels stay in the drawing;
 * what it concludes comes out here.
 *
 * The capture proof measures every remaining <text> against its viewBox and fails on
 * an overflow, which is what stops this rule from decaying back into a habit.
 */
export function Readout({ children }: { children: ReactNode }): ReactNode {
  return <p className="bg-readout">{children}</p>;
}
