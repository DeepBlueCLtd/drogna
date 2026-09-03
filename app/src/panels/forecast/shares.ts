/**
 * The two vocabularies the centre region draws in, in one place because they must not drift.
 *
 * **The four shares** are the analyst's provenance: where a cell's value came from, by kind.
 * They were `ColumnProvenance.tsx`'s own until feature 124's profile needed them too, and a
 * second copy of an order that is load-bearing — slot 1 is slot 1 on the map, in the legend and
 * in the profile — is exactly the kind of duplication this repository has paid for before.
 *
 * **The instruments** are feature 124's sources: the datastreams whose observations the gain
 * actually weighed. They are a different vocabulary and get different colours deliberately, so
 * a reader never has to wonder whether the green in the profile's baseline and the green in a
 * ray mean the same thing. Colour is not the only carrier for either: a ray carries its
 * instrument's dash, a profile band carries its hatch angle, the legends name them, and every
 * figure is printed in text — which is what SRD-v2 FR-138 requires.
 *
 * **Whether that is enough is Q-01, and it is open.** A review found the angle assigned to every
 * band and read by nothing, so the hatch this comment claimed did not exist in the rendered
 * output; it does now. Whether six hatched hues separate in greyscale is still a question a
 * capture answers and a comment cannot, and T030 is the task that takes it.
 */

/**
 * The four shares, in the analyst's own storage order, which never changes and is never cycled.
 * Hues are the validated categorical steps for a dark surface; `pattern` names the hatch that
 * carries the same identity without colour.
 */
export const SOURCES = [
  { key: 'archive', label: 'archive', hue: '#3987e5', pattern: 'hatch-archive' },
  { key: 'departure', label: 'departure', hue: '#d95926', pattern: 'hatch-departure' },
  { key: 'measurement', label: 'measurement', hue: '#199e70', pattern: 'hatch-measurement' },
  { key: 'model', label: 'model', hue: '#c98500', pattern: 'hatch-model' },
] as const;

export type SourceKey = (typeof SOURCES)[number]['key'];

/** The three shares that are not measurement: the background a correction sits on (FR-125). */
export const BACKGROUND_KEYS: readonly SourceKey[] = ['archive', 'departure', 'model'];

/**
 * The instrument palette: hue, hatch angle and dash by position in the column's own source list.
 *
 * Six entries, and the count is a measurement rather than a guess — a cycle of the shipped
 * configuration produces four to six sources (specs/124 T001, measured with the holding in the
 * store). A seventh source would wrap, and `paletteExhausted` says so rather than letting two
 * instruments quietly share a colour; the region prints the warning where a reader sees it.
 *
 * **The hues are an ordered luminance ramp, and that is the correction a review forced.** The
 * first palette picked six pleasant hues at similar lightness, and its worst pair —
 * `#b58ae0` against `#e87f9e` — came to a contrast of **1.037**, which is the same grey twice.
 * Two sources of one column sit as adjacent bands of one bar, so that is not a theoretical
 * complaint. These six climb monotonically from 0.094 to 0.635 relative luminance: the extremes
 * clear `AA_NON_TEXT`, and no pair anywhere in the set falls below 1.32.
 *
 * Six ordered steps cannot each clear a contrast of 3 against its neighbour — that would need a
 * luminance range no screen has — so the ramp is what colour can honestly carry, and identity is
 * carried by the **hatch angle and the dash**, which are distinct for every entry. The angles are
 * 30° apart rather than 45° so that a seventh would not repeat the third's direction. That
 * disjunction — an ordered ramp, plus a texture per entry — is the same one
 * `panels/consumers/greyscale.test.ts` holds its own line marks to, and `greyscale.test.ts`
 * beside this file holds it here.
 */
export const INSTRUMENTS = [
  { hue: '#7233b8', angle: 0, dash: 'none' },
  { hue: '#c03a30', angle: 30, dash: '6 3' },
  { hue: '#ae7016', angle: 60, dash: '2 3' },
  { hue: '#41a891', angle: 90, dash: '10 4' },
  { hue: '#77b7e5', angle: 120, dash: '4 2 1 2' },
  { hue: '#dad2a0', angle: 150, dash: '1 3' },
] as const;

export function instrumentAt(index: number): (typeof INSTRUMENTS)[number] {
  return INSTRUMENTS[index % INSTRUMENTS.length];
}

/** True once a column carries more sources than the palette has distinct entries. */
export function paletteExhausted(sourceCount: number): boolean {
  return sourceCount > INSTRUMENTS.length;
}

/**
 * Which share a served parameter name belongs to, or nothing where it names something else.
 *
 * **Matched on the segment after `_share_`, by prefix, and the reason is a fault this had.**
 * The analyst names each field from its *configured label* — `config.analyst.shares.departure`
 * ships as "departure forecast" — so the served parameter is `temperature_share_departure_forecast`.
 * Matched by `endsWith('_departure')` that name misses, and the departure share came back `NaN`
 * on every cell of every column: drawn as nothing on the map, and printed as `NaN%` in the
 * readout beneath it, since feature 116. Nothing caught it because both surfaces treated a
 * non-number as a zero, which is exactly the reading FR-041 forbids and is why the profile
 * below now states an absent share rather than drawing one.
 *
 * The prefix match is deliberate rather than a wider `includes`: a label may be extended
 * ("departure forecast", "departure brief") and still be the departure share, but a share whose
 * label stops beginning with its key is a vocabulary change the shell should miss loudly.
 */
export function sourceOf(parameterName: string): SourceKey | undefined {
  const at = parameterName.lastIndexOf('_share_');
  const suffix = at >= 0 ? parameterName.slice(at + '_share_'.length) : parameterName;
  return SOURCES.find((source) => suffix === source.key || suffix.startsWith(`${source.key}_`))?.key;
}
