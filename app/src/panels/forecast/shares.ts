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
 * ray mean the same thing. Colour is not the only carrier for either: every entry has a hatch
 * angle of its own, the legends name them, and every figure is printed in text — which is what
 * SRD-v2 FR-138 requires and what Q-01 asks about, and Q-01 is answered by a greyscale capture
 * rather than by this comment.
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
 * The instrument palette: hue and hatch angle by position in the column's own source list.
 *
 * Six entries, and the count is a measurement rather than a guess — a cycle of the shipped
 * configuration produces four to six sources (specs/124 T001, measured with the holding in the
 * store). A seventh source would wrap, and `paletteExhausted` says so rather than letting two
 * instruments quietly share a colour; the region prints the warning where a reader sees it.
 *
 * The angles are 30° apart rather than 45°, because at 45° the third and seventh would be the
 * same stroke direction. Every entry also carries a dash so the hatch reads at a ray's width,
 * where a fill pattern has almost no area to show itself in.
 */
export const INSTRUMENTS = [
  { hue: '#5ec2e8', angle: 0, dash: 'none' },
  { hue: '#e8a13f', angle: 30, dash: '6 3' },
  { hue: '#b58ae0', angle: 60, dash: '2 3' },
  { hue: '#7fd18c', angle: 90, dash: '10 4' },
  { hue: '#e87f9e', angle: 120, dash: '4 2 1 2' },
  { hue: '#d9d36a', angle: 150, dash: '1 3' },
] as const;

export function instrumentAt(index: number): (typeof INSTRUMENTS)[number] {
  return INSTRUMENTS[index % INSTRUMENTS.length];
}

/** True once a column carries more sources than the palette has distinct entries. */
export function paletteExhausted(sourceCount: number): boolean {
  return sourceCount > INSTRUMENTS.length;
}
