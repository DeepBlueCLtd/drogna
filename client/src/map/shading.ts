/**
 * How magnitude is drawn, and why nothing on this map has a colour.
 *
 * PR-08 asks that every encoding stay legible in greyscale, and FR-005 restates it: no
 * state or magnitude carried by hue alone. The usual way to satisfy that is to choose a
 * palette whose luminance happens to be monotone — viridis, cividis, one of the
 * colour-vision-safe ramps — and then to hope nobody adds a category to it later.
 *
 * This does something blunter. Hue carries nothing anywhere on this surface, because there
 * is no hue: every colour the map produces is achromatic, red equal to green equal to
 * blue. A greyscale print of it is not an approximation of the map, it *is* the map, and
 * SC-005's "rank three sampled cells by magnitude in a greyscale print" is then not a
 * property somebody has to check by eye. A test asserts the three channels are equal for
 * every value in the range, which is the machine-checkable form of the requirement and
 * cannot be satisfied by a palette that looks all right on the day.
 *
 * Magnitude is drawn twice — as lightness and as radius, both monotone in the value —
 * because a single channel is hard to rank at the ends of its range, and because two
 * redundant encodings degrade gracefully: a cell too small to judge by area is still light
 * or dark, and a cell against a background of similar tone is still large or small.
 *
 * There is nothing here about what a value *means*. Whether a spread of 0.4 is good or bad
 * is the planner's judgement and the quality statement's to report; the map draws high and
 * low, and says which end is which in its legend.
 */

/** A colour, as the drawing library takes one: red, green, blue, alpha, 0–255. */
export type Shade = readonly [number, number, number, number];

/**
 * The lightest and darkest the field is drawn.
 *
 * The page is printed on light paper, so the lightest tone stops well short of the
 * background: a cell drawn at the paper's own value is a cell that is not drawn at all, and
 * a field whose lowest values are invisible reads as a field with holes in it.
 */
const LIGHTEST = 208;
const DARKEST = 24;

/** The smallest and largest a drawn cell is, as a fraction of the cell spacing. */
const SMALLEST_FRACTION = 0.22;
const LARGEST_FRACTION = 1;

/** How opaque a drawn cell is. Constant: opacity is not a third encoding of magnitude. */
const CELL_ALPHA = 216;

/**
 * Where a value sits in the range that was drawn, from 0 to 1.
 *
 * A range of zero width — every cell the same, which a freshly initialised field genuinely
 * is — normalises to the middle rather than to either end. Mapping it to zero would draw a
 * uniform field as uniformly lowest, which is a claim about its magnitude that the data
 * does not make.
 */
export function normalise(value: number, range: readonly [number, number]): number {
  const [lowest, highest] = range;
  if (!Number.isFinite(value) || !Number.isFinite(lowest) || !Number.isFinite(highest)) {
    return 0.5;
  }
  if (highest <= lowest) {
    return 0.5;
  }
  const fraction = (value - lowest) / (highest - lowest);
  return Math.max(0, Math.min(1, fraction));
}

/**
 * The tone a normalised value is drawn at: light for low, dark for high.
 *
 * Low uncertainty is light and high uncertainty is dark, which is the direction a reader
 * expects from ink on paper — more ink, more of the thing — and is the direction that
 * survives being printed.
 */
export function tone(fraction: number): number {
  const held = Math.max(0, Math.min(1, fraction));
  return Math.round(LIGHTEST - held * (LIGHTEST - DARKEST));
}

/** The achromatic shade for a normalised value. Red, green and blue are equal by build. */
export function shade(fraction: number, alpha: number = CELL_ALPHA): Shade {
  const grey = tone(fraction);
  return [grey, grey, grey, alpha];
}

/** How large a cell of this magnitude is drawn, as a fraction of the cell spacing. */
export function sizeFraction(fraction: number): number {
  const held = Math.max(0, Math.min(1, fraction));
  return SMALLEST_FRACTION + held * (LARGEST_FRACTION - SMALLEST_FRACTION);
}

/** Everything the drawing needs about one value, so a layer reads it once. */
export interface Encoding {
  readonly fraction: number;
  readonly shade: Shade;
  readonly sizeFraction: number;
}

export function encode(value: number, range: readonly [number, number]): Encoding {
  const fraction = normalise(value, range);
  return { fraction, shade: shade(fraction), sizeFraction: sizeFraction(fraction) };
}

/**
 * The shades used for everything that is not a field value.
 *
 * Achromatic for the same reason, and distinguished from one another by tone and by the
 * shape they are drawn on rather than by colour. A route that were red would be a route
 * whose meaning vanished in a greyscale print, and a declined vertex marked only by being
 * a different colour would vanish with it.
 */
export const INK = {
  /** The extent frame: the strongest line on the surface, because it bounds everything. */
  frame: [24, 24, 24, 255] as Shade,
  /** The graticule: present, countable, and never competing with the data. */
  graticule: [130, 130, 130, 170] as Shade,
  /** The recommended route. */
  route: [24, 24, 24, 235] as Shade,
  /** A route vertex the trajectory response answered for: filled. */
  vertex: [24, 24, 24, 255] as Shade,
  /**
   * A route vertex the response declined: hollow, with the same dark outline.
   *
   * Filled against hollow, not one tone against another, because the distinction has to
   * survive a reader glancing at a small mark — and because both marks are achromatic, so
   * there is no colour for the distinction to have been carried by in the first place.
   */
  declinedVertex: [247, 247, 247, 255] as Shade,
  /** The cell a viewer has picked. */
  picked: [24, 24, 24, 255] as Shade,
} as const;

/** The legend's own sentence, so the surface says which end of the ramp is which. */
export function rampWords(range: readonly [number, number]): string {
  const [lowest, highest] = range;
  if (highest <= lowest) {
    return (
      `Every drawn cell holds ${lowest}, so the shading spans nothing and every cell is ` +
      `drawn at the same tone. Nothing here is a magnitude to rank.`
    );
  }
  return (
    `Light is ${lowest} and dark is ${highest}, the lowest and highest values among the ` +
    `cells actually drawn. Magnitude is carried by tone and by size together and by no ` +
    `colour at all, so this reads the same in a greyscale print as it does here.`
  );
}
