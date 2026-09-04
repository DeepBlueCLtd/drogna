/**
 * The two vocabularies the centre region draws in, in one place because they must not drift.
 *
 * **The four shares** are the analyst's provenance: where a cell's value came from, by kind.
 * They were `ColumnProvenance.tsx`'s own until feature 124's profile needed them too, and a
 * second copy of an order that is load-bearing — slot 1 is slot 1 on the map, in the legend and
 * in the profile — is exactly the kind of duplication this repository has paid for before.
 *
 * **The instruments** are feature 124's sources: the datastreams whose observations the gain
 * actually weighed. They are a different vocabulary and get different hues deliberately, so a
 * reader in colour never has to wonder whether the green in the profile's baseline and the green
 * in a ray mean the same thing.
 *
 * **In greyscale the hues do not separate them, and saying otherwise was the claim that failed.**
 * Measured with the shell's own `contrast`, `archive` `#3987e5` against instrument slot 1
 * `#e0584a` comes to **1.019** — one grey, twice — and three other cross-vocabulary pairs are
 * worse than the worst pair *within* the instrument ramp, which the test below holds to a derived
 * floor. Two such bands sit side by side in one stacked bar, so this is not theoretical. What
 * separates them without colour is the **hatch angle**: the four shares are odd multiples of 15°
 * and the six instruments are multiples of 30°, so no share direction can equal an instrument's
 * however either list grows, and `greyscale.test.ts` asserts that of the two lists. Six ordered
 * hues cannot also clear a contrast bound against four more; the texture is what carries it, and
 * that is stated here rather than assumed. Colour is not the only carrier for either: a ray carries its
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
 *
 * **The angle is here rather than computed from the position, and that is a fault being fixed.**
 * The map drew each share's hatch at `index * 45` — 0°, 45°, 90°, 135° — inside the JSX, while
 * `INSTRUMENTS` below hatch at multiples of 30 starting at 0. Slots 0 and 3 therefore collided
 * exactly with archive and measurement, in one region, one surface above the other, which is the
 * confusion the two vocabularies are given different textures to avoid. Worse, the check written
 * to hold that line asserted `!('angle' in source)` — the angles were not on `SOURCES` to be
 * seen, so it tested a key name and passed whatever the map drew.
 *
 * The four are now odd multiples of 15, which no multiple of 30 can equal, so a share hatch and
 * an instrument hatch cannot land on the same direction however either list grows; and
 * `greyscale.test.ts` asserts that of the two lists rather than of a property name.
 */
export const SOURCES = [
  { key: 'archive', label: 'archive', hue: '#3987e5', pattern: 'hatch-archive', angle: 15 },
  { key: 'departure', label: 'departure', hue: '#d95926', pattern: 'hatch-departure', angle: 75 },
  { key: 'measurement', label: 'measurement', hue: '#199e70', pattern: 'hatch-measurement', angle: 105 },
  { key: 'model', label: 'model', hue: '#c98500', pattern: 'hatch-model', angle: 165 },
] as const;

export type SourceKey = (typeof SOURCES)[number]['key'];

/**
 * The declared share a key names.
 *
 * A total function over `SourceKey`, because that is what the type already guarantees: the call
 * sites were `SOURCES.find((candidate) => candidate.key === key) ?? SOURCES[0]`, whose fallback
 * is unreachable over a literal containing every key and is a second opinion about which share to
 * draw if it were not. The `!` is the narrowing TypeScript cannot do over `find`, stated once here
 * rather than papered over with a different share at every call site.
 */
export function shareOf(key: SourceKey): (typeof SOURCES)[number] {
  return BY_KEY[key];
}

const BY_KEY = Object.fromEntries(SOURCES.map((source) => [source.key, source])) as Record<
  SourceKey,
  (typeof SOURCES)[number]
>;

/**
 * The measurement share itself, the one the background is not.
 *
 * Through `shareOf`, so there is one spelling of "which share is measurement" in this file rather
 * than three. It was `SOURCES.find(...) ?? SOURCES[0]` — an unreachable fallback that was a
 * second opinion about which share to use if it were taken — and then `SOURCES[2]`, an index
 * beside a sibling that names the same share by key, held in agreement by a test rather than by
 * construction.
 */
export const MEASUREMENT = shareOf('measurement');

/**
 * The three shares that are not measurement: the background a correction sits on (FR-125).
 *
 * Derived rather than restated. The list used to be written out again as three key strings, so
 * `SOURCES` and this had to be kept in step by hand, and the consumer then looked each key back
 * up in `SOURCES` through a `find` that could not miss.
 */
export const BACKGROUND_SOURCES = SOURCES.filter((source) => source !== MEASUREMENT);


/**
 * The instrument palette: hue, hatch angle and dash by position in the column's own source list.
 *
 * Six entries, and the count is a measurement rather than a guess — a cycle produces four to six
 * sources on the **loitering** condition (specs/124 T001, measured with the holding in the store).
 * Naming the condition rather than "the shipped configuration": this change cites three different
 * ones as that, and a source count is a fact about a platform's behaviour, not about the build. A seventh source would wrap, and `paletteExhausted` says so rather than letting two
 * instruments quietly share a colour; the region prints the warning where a reader sees it.
 *
 * **The hues are an ordered luminance ramp, and that took two corrections.** The first palette
 * picked six pleasant hues at similar lightness, and its worst pair — `#b58ae0` against
 * `#e87f9e` — came to a contrast of **1.037**, which is the same grey twice; two sources of one
 * column sit as adjacent bands of one bar, so that was not a theoretical complaint. The ramp
 * that replaced it was ordered but started too dark: `#7233b8` measured **2.52** against the
 * shell's own ground, under `AA_NON_TEXT`, and every column draws slot 0. The floor is therefore
 * the ground and not the palette — a hue must clear 3:1 on `--shell-bg` before it can be the
 * bottom of anything — and these six climb from there, 0.147 to 0.751, no pair below 1.23 and
 * nothing below 3.44 against the surface it is drawn on.
 *
 * **Those figures are of the declared hue, not of the drawn pixel, and the difference is Q-01.**
 * The region composites: map cells at `fill-opacity` 0.15–1.0, pattern washes at 0.45, profile
 * bands under a `rgba(0,0,0,0.55)` stripe, the earlier-cycles band at 0.55 opacity. A bound on
 * the undimmed hue is a necessary condition for the drawn one and not the same measurement, and
 * nothing here claims otherwise: whether six hatched hues separate in greyscale *as drawn* is the
 * question a capture answers and a number in a comment cannot, and T030 is the task that takes
 * it.
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
  { hue: '#8b4bc8', angle: 0, dash: 'none' },
  { hue: '#e0584a', angle: 30, dash: '6 3' },
  { hue: '#c48f2e', angle: 60, dash: '2 3' },
  { hue: '#4fbca4', angle: 90, dash: '10 4' },
  { hue: '#8cc4ea', angle: 120, dash: '4 2 1 2' },
  { hue: '#e7e2bd', angle: 150, dash: '1 3' },
] as const;

/**
 * The angle the remainder band's stripe is drawn at, declared here so the check that holds the
 * hatch vocabularies apart can see it.
 *
 * It lives in `forecast.css` and it is **135°** — an odd multiple of 15, which is the series the
 * four shares occupy. A fifth share would have been given 135° by the same rule that gave the
 * first four theirs, and would have collided with the remainder band *in the same stacked bar*,
 * while the check written to prevent exactly that reported clean. Nothing on disk reserved it.
 */
export const REMAINDER_ANGLE = 135;

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
