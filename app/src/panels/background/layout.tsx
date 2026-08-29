/**
 * Where a step's parts go, and what happens when there is not room for them.
 *
 * FR-023: prose sits beside the drawing where there is width for it and stacks below
 * it where there is not — that part is CSS, so it needs no second code path.
 * FR-024: below the width a drawing needs, the drawing is replaced by a statement of
 * the width it wants. Never scaled past legibility, and never rendered having
 * silently dropped its labels; the prose and the spine stay usable either way.
 */
import { useRef, type ReactNode } from 'react';
import { fillsViewport, useMeasuredWidth, viewportWidth } from '../../shell/viewport.js';
import type { FigureContext, Step, StepFigure } from './model.js';

/**
 * The measurement moved to `shell/viewport.ts` in feature 112, so that the shell and
 * every panel measure the same way, and is re-exported here because this is where the
 * course's own tests and explainers reach for it. Undefined is still not narrow: an
 * unknown width is no evidence of one, so the figure is drawn rather than withheld.
 */
export { useMeasuredWidth };

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
 * **Feature 112 amends what happens below the floor.** "Widen the panel" is sound advice
 * to a viewer who has a window to widen and an instruction that cannot be followed on a
 * phone — a claim the tab makes that stops being true. So where the column is already as
 * wide as the viewport, the drawing is rendered at its own minimum width inside a frame
 * that scrolls sideways: full size, labels intact, panned rather than shrunk. FR-024's
 * two guarantees are what make that the right answer instead of a workaround, and both
 * still hold — never scaled past legibility, never rendered having dropped its labels.
 * Where there *is* a wider width to be had, the statement of the width it wants is
 * unchanged, because there the advice can be taken.
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
  // There is no wider width to move to: the column already has the viewport.
  const nowhereToWiden = tooNarrow && fillsViewport(width, viewportWidth() ?? Number.POSITIVE_INFINITY);

  const drawing = (
    <figure className="bg-figure">
      <div className="bg-figure-frame" role="img" aria-label={figure.label}>
        {figure.draw(context)}
      </div>
      {figure.caption ? <figcaption>{figure.caption}</figcaption> : null}
    </figure>
  );

  if (nowhereToWiden) {
    return (
      <div className="bg-figure-column" ref={columnRef}>
        <div className="bg-figure-pan" data-testid="figure-pan">
          <div className="bg-figure-pan-inner" style={{ minWidth: `${figure.minWidth}px` }}>
            {drawing}
          </div>
        </div>
        <p className="bg-figure-pan-note">Wider than the screen — scroll the diagram sideways.</p>
      </div>
    );
  }

  return (
    <div className="bg-figure-column" ref={columnRef}>
      {tooNarrow ? (
        <p className="bg-figure-floor" data-testid="figure-floor">
          The diagram needs about {figure.minWidth}px. Widen the panel to see it.
        </p>
      ) : (
        drawing
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
