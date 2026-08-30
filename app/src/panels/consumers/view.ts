/**
 * What part of the ocean a consumer's map is looking at, and the gestures that move it.
 *
 * Two things made this necessary, and they are the same thing. The hexes were drawn over
 * the whole domain at one resolution, which at the resolutions worth looking at is either
 * a handful of enormous cells or a hundred thousand tiny ones; and the wheel scrolled the
 * page rather than the map, so there was no way to get closer. A map you cannot approach
 * has to show everything at once, and a map that shows everything at once cannot show
 * anything finely.
 *
 * So the view is a rectangle over the domain, and the hexes cover **the rectangle** rather
 * than the domain. Zooming in is what makes a fine resolution affordable, which is why the
 * cell ceiling refuses by naming both remedies: come closer, or choose a coarser grid.
 *
 * The wheel listener is attached by hand rather than through React's `onWheel` because it
 * must be able to call `preventDefault`, and React attaches wheel handlers passively. That
 * is the whole of why this is a hook with a ref rather than a prop.
 *
 * No timers and no host clock: a gesture is an event, and everything here is a pure
 * function of the event and the rectangle it lands on (Constitution I).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Domain } from './domain.js';

/** A window onto the domain, in the domain's own degrees. */
export interface ViewRect {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

export function wholeDomain(domain: Domain): ViewRect {
  return { west: domain.west, south: domain.south, east: domain.east, north: domain.north };
}

/** How far in the view may go: a window narrower than this is a window onto nothing. */
const SMALLEST_SPAN_DEGREES = 0.02;

/**
 * Zoom by `factor` about a point, and stay inside the domain.
 *
 * Zooming about the pointer rather than the centre is what makes a wheel feel like a map
 * rather than a slider: the water under the cursor stays under the cursor.
 */
export function zoomAbout(
  rect: ViewRect,
  domain: Domain,
  factor: number,
  atLongitude: number,
  atLatitude: number,
): ViewRect {
  const width = (rect.east - rect.west) * factor;
  const height = (rect.north - rect.south) * factor;
  const wholeWidth = domain.east - domain.west;
  const wholeHeight = domain.north - domain.south;
  if (width >= wholeWidth || height >= wholeHeight) return wholeDomain(domain);
  if (width < SMALLEST_SPAN_DEGREES || height < SMALLEST_SPAN_DEGREES) return rect;
  // Keep the anchor at the same fraction across the new window as the old.
  const acrossX = (atLongitude - rect.west) / (rect.east - rect.west);
  const acrossY = (atLatitude - rect.south) / (rect.north - rect.south);
  return clampInto(
    {
      west: atLongitude - acrossX * width,
      east: atLongitude + (1 - acrossX) * width,
      south: atLatitude - acrossY * height,
      north: atLatitude + (1 - acrossY) * height,
    },
    domain,
  );
}

/** Slide the window, keeping its size, without leaving the domain. */
export function panBy(rect: ViewRect, domain: Domain, byLongitude: number, byLatitude: number): ViewRect {
  return clampInto(
    {
      west: rect.west + byLongitude,
      east: rect.east + byLongitude,
      south: rect.south + byLatitude,
      north: rect.north + byLatitude,
    },
    domain,
  );
}

/**
 * A window pushed back inside the domain without being resized. A view that could leave
 * the domain would show empty water the harness never claimed to model.
 */
function clampInto(rect: ViewRect, domain: Domain): ViewRect {
  const width = rect.east - rect.west;
  const height = rect.north - rect.south;
  let west = rect.west;
  let south = rect.south;
  if (west < domain.west) west = domain.west;
  if (west + width > domain.east) west = domain.east - width;
  if (south < domain.south) south = domain.south;
  if (south + height > domain.north) south = domain.north - height;
  return { west, south, east: west + width, north: south + height };
}

/** How far in the view is, as a multiple of the whole domain's width. 1 is fully out. */
export function zoomFactor(rect: ViewRect, domain: Domain): number {
  const wholeWidth = domain.east - domain.west;
  return wholeWidth > 0 ? wholeWidth / (rect.east - rect.west) : 1;
}

/**
 * The keyboard's steps, as proportions of what is in view rather than degrees. A fixed
 * step is either a crawl when zoomed out or a leap when zoomed in, and the same key has
 * to be usable at both ends.
 */
export const PAN_STEP = 0.2;
export const ZOOM_STEP = 1.2;

/**
 * One press of a key, applied to the view.
 *
 * A pure function rather than a branch inside the listener, because the keyboard is the
 * path the proof drives (T035): a gesture reachable only through a real DOM event is a
 * gesture whose test mostly tests the DOM. Zoom is about the centre, since a keyboard has
 * no cursor to keep the water under.
 *
 * `undefined` means the key is not one of the map's, which is a different answer from the
 * rectangle coming back unchanged: an arrow pressed against the edge of the domain moves
 * nothing and is still the map's key, and letting that one through would scroll the panel
 * out from under a viewer who was only trying to look further west.
 */
export function viewAfterKey(rect: ViewRect, domain: Domain, key: string): ViewRect | undefined {
  const width = rect.east - rect.west;
  const height = rect.north - rect.south;
  const centreLongitude = (rect.west + rect.east) / 2;
  const centreLatitude = (rect.south + rect.north) / 2;
  switch (key) {
    case 'ArrowLeft':
      return panBy(rect, domain, -width * PAN_STEP, 0);
    case 'ArrowRight':
      return panBy(rect, domain, width * PAN_STEP, 0);
    // North is up, and up is where the latitude grows.
    case 'ArrowUp':
      return panBy(rect, domain, 0, height * PAN_STEP);
    case 'ArrowDown':
      return panBy(rect, domain, 0, -height * PAN_STEP);
    case '+':
    case '=':
      return zoomAbout(rect, domain, 1 / ZOOM_STEP, centreLongitude, centreLatitude);
    case '-':
    case '_':
      return zoomAbout(rect, domain, ZOOM_STEP, centreLongitude, centreLatitude);
    case 'Home':
      return wholeDomain(domain);
    default:
      return undefined;
  }
}

export interface MapView {
  readonly rect: ViewRect;
  /** Attach to the SVG element: the wheel and drag listeners hang off it. */
  readonly ref: React.RefObject<SVGSVGElement>;
  readonly reset: () => void;
  readonly factor: number;
  /** True while a drag is in progress, so the cursor can say so. */
  readonly panning: boolean;
}

/**
 * The view, and the gestures that move it, bound to an SVG element.
 *
 * `boxWidth`/`boxHeight` are the SVG's own coordinate box, not its pixel size: the
 * gesture is converted through the element's measured rectangle, so it works at any
 * rendered size, including a phone's.
 */
export function useMapView(domain: Domain | undefined, boxWidth: number, boxHeight: number): MapView {
  const [rect, setRect] = useState<ViewRect | undefined>(undefined);
  const [panning, setPanning] = useState(false);
  const ref = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  // A new domain — the first one heard, or a different forecast's — resets the view.
  // Keeping a window from a domain that no longer exists would be showing water by
  // coordinates that no longer mean anything.
  useEffect(() => {
    setRect(domain ? wholeDomain(domain) : undefined);
  }, [domain?.west, domain?.east, domain?.south, domain?.north]);

  const current = rect ?? (domain ? wholeDomain(domain) : { west: 0, south: 0, east: 1, north: 1 });

  useEffect(() => {
    const element = ref.current;
    if (!element || !domain) return;

    const domainAt = (clientX: number, clientY: number) => {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return undefined;
      const acrossX = (clientX - box.left) / box.width;
      const acrossY = (clientY - box.top) / box.height;
      const standing = rect ?? wholeDomain(domain);
      return {
        longitude: standing.west + acrossX * (standing.east - standing.west),
        // The drawing's y grows downwards and latitude does not.
        latitude: standing.north - acrossY * (standing.north - standing.south),
      };
    };

    const onWheel = (event: WheelEvent) => {
      // The gesture belongs to the map, not to the page behind it (the reported fault).
      event.preventDefault();
      const at = domainAt(event.clientX, event.clientY);
      if (!at) return;
      const factor = event.deltaY > 0 ? 1.2 : 1 / 1.2;
      setRect((standing) => zoomAbout(standing ?? wholeDomain(domain), domain, factor, at.longitude, at.latitude));
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging.current = { x: event.clientX, y: event.clientY };
      setPanning(true);
      element.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      const from = dragging.current;
      if (!from) return;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      const standing = rect ?? wholeDomain(domain);
      const perPixelX = (standing.east - standing.west) / box.width;
      const perPixelY = (standing.north - standing.south) / box.height;
      dragging.current = { x: event.clientX, y: event.clientY };
      setRect((held) =>
        panBy(
          held ?? standing,
          domain,
          -(event.clientX - from.x) * perPixelX,
          (event.clientY - from.y) * perPixelY,
        ),
      );
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging.current = null;
      setPanning(false);
      element.releasePointerCapture?.(event.pointerId);
    };

    // The same gestures from the keyboard (T035). Without this the map is the one surface
    // in the family reachable by pointer alone: every other control is a native range,
    // select or button and was operable by keyboard the day it was written. The key is
    // taken away from the page only when it moved the view, so Tab still leaves and an
    // arrow the map does not use still scrolls the panel.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const next = viewAfterKey(rect ?? wholeDomain(domain), domain, event.key);
      if (!next) return;
      event.preventDefault();
      setRect(next);
    };

    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    return () => {
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
    };
  }, [domain, rect, boxWidth, boxHeight]);

  const reset = useCallback(() => setRect(domain ? wholeDomain(domain) : undefined), [domain]);
  const factor = useMemo(() => (domain ? zoomFactor(current, domain) : 1), [current, domain]);

  return { rect: current, ref, reset, factor, panning };
}
