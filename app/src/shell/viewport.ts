/**
 * Width, and what it is allowed to decide (feature 112, FR-001, FR-002).
 *
 * One threshold, declared here and nowhere else. Every CSS breakpoint that partners it
 * carries the same number and `check-one-breakpoint` fails the build when one does not:
 * a breakpoint copied into five stylesheets is a number that drifts, and drifts
 * silently, because nothing renders wrong until somebody is holding a phone.
 *
 * Everything here is keyed to the width of the *element* being measured, never to a
 * device, a user agent or a build flag. That is the only version of the rule a
 * component can enforce about itself, and it is what makes a panel docked narrow on a
 * 27-inch display behave exactly as it does on a phone.
 *
 * An unmeasured width is not evidence of a narrow one — feature 111's rule, inherited
 * verbatim from `panels/background/layout.tsx`, where it is written out at length.
 */
import { useEffect, useState, type RefObject } from 'react';

/**
 * The width at which the shell changes presentation, in CSS pixels.
 *
 * 720 because below it two docked panels are two unusable panels, and because it puts
 * every phone in portrait and most small tablets in portrait on the stack side while
 * leaving a half-screen desktop window on the dock side. It is one number in one
 * module, which matters more than its being right first time (spec Q1).
 */
export const NARROW_WIDTH = 720;

/**
 * The height below which there is nothing to dock either, in CSS pixels.
 *
 * 500 because docking divides space in *both* axes, and the case this exists for is the
 * phone turned sideways: 844 by 390 is wide enough to pass the width test and has no
 * room at all for a docked arrangement — two panels one above the other would be 150
 * pixels each once the chrome has had its share. It is also still a phone, and a tab bar
 * built for a cursor is still the wrong tab bar for a thumb.
 *
 * Found by the capture proof rather than by reasoning: the landscape size was in the
 * proof's list from the start, and the run said the shell was in the dock presentation
 * at a size the feature exists to serve. The first draft of this module had width alone.
 */
export const SHORT_HEIGHT = 500;

/** Whether an element of this width is narrow. Undefined is not narrow. */
export function isNarrow(width: number | undefined): boolean {
  return width !== undefined && width < NARROW_WIDTH;
}

/**
 * Which presentation a shell body of this size gets (ADR-0033). Either dimension is
 * enough on its own: docking wants room in both, and a viewport short of either has
 * none to divide.
 */
export function presentationFor(
  width: number | undefined,
  height: number | undefined,
): 'dock' | 'stack' {
  if (isNarrow(width)) return 'stack';
  if (height !== undefined && height < SHORT_HEIGHT) return 'stack';
  return 'dock';
}

/**
 * The element's width in CSS pixels, or undefined when there is nothing to measure.
 *
 * Moved here from `panels/background/layout.tsx` by feature 112 so that the shell and
 * the panels measure the same way. The comment that was there is worth keeping: the
 * measured element must be one that cannot be unmounted by the measurement's own
 * outcome, or the observer reads a detached element as zero width and the two take
 * turns. Watched happening, in 111.
 *
 * The observation watches the DOM, not the clock (Constitution I): a resize is an event
 * the browser already reports.
 */
export function useMeasuredWidth(ref: RefObject<HTMLElement>): number | undefined {
  return useMeasuredSize(ref).width;
}

/** The element's size, or undefined in either axis when there is nothing to measure. */
export function useMeasuredSize(ref: RefObject<HTMLElement>): {
  width: number | undefined;
  height: number | undefined;
} {
  const [size, setSize] = useState<{ width: number | undefined; height: number | undefined }>({
    width: undefined,
    height: undefined,
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () =>
      setSize((previous) => {
        const width = element.clientWidth || undefined;
        const height = element.clientHeight || undefined;
        // A new object every notification would re-render every measuring component on
        // every scroll-induced observer callback, panels included.
        return previous.width === width && previous.height === height ? previous : { width, height };
      });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * Whether the element is narrow, measuring it. The two lines every panel needs.
 *
 * Where there is nothing to measure the viewport stands in, for the same reason the
 * shell uses it: on the frame before the first measurement it is the best guess there
 * is, and without it a phone renders one wide frame and then throws it away. In a
 * browser with layout the measurement always wins, so a panel docked narrow inside a
 * wide window is narrow and a wide panel on a phone-sized page is not.
 *
 * This is not a weakening of feature 111's "an unmeasured width is not evidence of a
 * narrow one". That rule governs whether a *drawing* is withheld, where being wrong
 * costs the viewer the picture; `Figure` still measures its own column and still treats
 * unknown as wide. Here being wrong costs a disclosure being open or closed for one
 * frame.
 */
export function useIsNarrow(ref: RefObject<HTMLElement>): boolean {
  const measured = useMeasuredWidth(ref);
  return isNarrow(measured ?? viewportWidth());
}

/**
 * The viewport's own width, or undefined where there is no window to ask.
 *
 * Used for two things and nothing else: as the shell's first guess before anything has
 * been measured — so a phone does not mount the dock for one frame and then throw it
 * away — and as the comparison in `fillsViewport`. It is a host *dimension*, not a host
 * clock; Constitution I is not engaged.
 */
export function viewportWidth(): number | undefined {
  return typeof window === 'undefined' ? undefined : window.innerWidth || undefined;
}

/** The viewport's own height, for the same first-guess reason as its width. */
export function viewportHeight(): number | undefined {
  return typeof window === 'undefined' ? undefined : window.innerHeight || undefined;
}

/**
 * Whether the element is as wide as the viewport allows — the case where "widen it" is
 * advice that cannot be taken (FR-019). A small margin absorbs the panel's own padding
 * and any scrollbar, because a panel two pixels short of the window is not a panel the
 * viewer can widen.
 */
export function fillsViewport(width: number | undefined, viewportWidth: number): boolean {
  return width !== undefined && width >= viewportWidth - 48;
}
