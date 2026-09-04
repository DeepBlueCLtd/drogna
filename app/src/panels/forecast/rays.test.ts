/**
 * Feature 124: the ray arithmetic, on its own.
 *
 * The document these build is a served document's shape, not a fixture standing in for the
 * ocean: what is asserted here is what `raysFor` does to numbers, and the numbers themselves
 * are checked against a running loop in `forecast.test.tsx` (SC-001, AT-07), where they come
 * from the analyst rather than from this file.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisContributions, AnalysisContributionsSource } from '../../generated/types.js';
import {
  backgroundRaysIn,
  contributionResidual,
  drawableRays,
  levelAtDepth,
  paletteSlots,
  placeOn,
  raysFor,
  sourceLabels,
} from './rays.js';

function source(
  id: string,
  longitude: number,
  datastream = id,
  kind: AnalysisContributionsSource['kind'] = 'measured',
): AnalysisContributionsSource {
  return {
    source_id: id,
    datastream_id: datastream,
    sensor_id: `${datastream}-sensor`,
    kind,
    cell: { index: 0, longitude, latitude: 46, depth_m: 0 },
    observed: { longitude: longitude + 0.01, latitude: 46.01, depth_m: 50 },
    observation_count: 3,
    error_std: 0.02,
    background_error_std: 0.3,
    mean_innovation: -0.1,
  };
}

/**
 * Two levels, three sources. The surface level is dominated by `b`; the deep level by `a`,
 * which is what makes the re-weighting assertion mean something.
 */
function document(): AnalysisContributions {
  return {
    schema_version: 1,
    holding_id: 'analysis.run-0-contributions',
    run_id: 'run-0',
    variable: 'temperature',
    correlation: { horizontal_km: 30, vertical_m: 160 },
    column: { longitude: -11, latitude: 46, longitude_index: 4, latitude_index: 5 },
    sources: [source('c.cell-2', -10.6), source('a.cell-0', -11.4), source('b.cell-1', -11.0)],
    levels: [
      {
        depth_index: 0,
        depth_m: 0,
        cell_index: 10,
        reached: true,
        observation_weight: 0.9,
        remainder: 0.1,
        background_error_std: 0.3,
        contributions: [
          { source: 0, contribution: 0.1, separation: { horizontal_km: 30, vertical_m: 0 } },
          { source: 1, contribution: 0.2, separation: { horizontal_km: 25, vertical_m: 0 } },
          { source: 2, contribution: 0.5, separation: { horizontal_km: 5, vertical_m: 0 } },
        ],
      },
      {
        depth_index: 1,
        depth_m: 200,
        cell_index: 20,
        reached: true,
        observation_weight: 0.5,
        remainder: -0.05,
        background_error_std: 0.31,
        contributions: [
          { source: 1, contribution: 0.45, separation: { horizontal_km: 25, vertical_m: 200 } },
          { source: 2, contribution: 0.1, separation: { horizontal_km: 5, vertical_m: 200 } },
        ],
      },
    ],
  };
}

describe('the rays a column is made of', () => {
  it('gives one ray per contributing source, ordered by source id rather than by the holding’s order', () => {
    const set = raysFor(document());
    // The document lists c, a, b. The drawn order is a, b, c — declared, so a source keeps its
    // place between levels and between runs (FR-123).
    expect(set.rays.map((ray) => ray.sourceId)).toEqual(['a.cell-0', 'b.cell-1', 'c.cell-2']);
    expect(set.rays).toHaveLength(3);
  });

  it('draws from where the instrument was, and states the separation the gain used', () => {
    const set = raysFor(document());
    const a = set.rays[0];
    // The line ends at the observed position…
    expect(a.longitude).toBeCloseTo(-11.39, 10);
    expect(a.latitude).toBeCloseTo(46.01, 10);
    // …and the separation it states is the cell-to-cell distance the taper was evaluated on,
    // which is a different distance. Two distances, both stated, neither pretending to be the
    // other.
    expect(a.separationKm).toBe(25);
    expect(a.errorStd).toBe(0.02);
    expect(a.backgroundErrorStd).toBe(0.3);
  });

  it('makes widths the true fraction of the widest, and prints the magnitude the width cannot carry', () => {
    const set = raysFor(document());
    // Summed over the column: a = 0.2 + 0.45 = 0.65, b = 0.5 + 0.1 = 0.6, c = 0.1.
    const [a, b, c] = set.rays;
    expect(a.contribution).toBeCloseTo(0.65, 10);
    expect(b.contribution).toBeCloseTo(0.6, 10);
    expect(c.contribution).toBeCloseTo(0.1, 10);
    expect(set.widest).toBeCloseTo(0.65, 10);
    expect(a.weight).toBe(1);
    expect(b.weight).toBeCloseTo(0.6 / 0.65, 10);
    expect(c.weight).toBeCloseTo(0.1 / 0.65, 10);
    // The ratios the picture carries are the contributions' own.
    expect(b.weight / c.weight).toBeCloseTo(b.contribution / c.contribution, 10);
  });

  it('SC-003: selecting a level re-weights the rays without moving them or changing their count', () => {
    // Levels are chosen by **depth**, never by position: the panel's depth list and the served
    // document are filed on different axes, and an index paired one depth's background with
    // another depth's contributions on three rows out of four.
    const whole = raysFor(document());
    const surface = raysFor(document(), 0);   // the level at 0 m
    const deep = raysFor(document(), 200); // the level at 200 m, by depth and not by index

    // Same origins, in the same order, at every level — the volume carries *which* sources and
    // the profile carries *where they mattered*, and neither is read through the other.
    const origins = (set: ReturnType<typeof raysFor>) =>
      set.rays.map((ray) => `${ray.sourceId}@${ray.longitude},${ray.latitude}`);
    expect(origins(surface)).toEqual(origins(whole));

    // Different widths, and the dominant source changes between the two levels — which is the
    // thing a reader is looking for and the reason the re-weighting exists.
    expect(surface.rays.map((ray) => ray.weight)).not.toEqual(deep.rays.map((ray) => ray.weight));
    expect(surface.rays.find((ray) => ray.sourceId === 'b.cell-1')?.weight).toBe(1);
    expect(deep.rays.find((ray) => ray.sourceId === 'a.cell-0')?.weight).toBe(1);

    // **The count does not change**, which is what FR-128 and SC-003 require and what the
    // first version of this got wrong: it dropped a source that did not reach the chosen
    // level, so choosing a level made rays vanish. A ray that disappears says "this source is
    // not part of this column"; the source is part of it and contributed nothing *here*, which
    // is what the flag says and what the profile prints.
    expect(deep.rays.map((ray) => ray.sourceId)).toEqual(whole.rays.map((ray) => ray.sourceId));
    expect(deep.rays).toHaveLength(3);
    const missing = deep.rays.find((ray) => ray.sourceId === 'c.cell-2');
    expect(missing?.reachedHere).toBe(false);
    expect(missing?.contribution).toBe(0);
    expect(missing?.weight).toBe(0);
    // And the ones that did reach it say so, at their own widths.
    expect(deep.rays.filter((ray) => ray.reachedHere)).toHaveLength(2);
    expect(deep.reachedCount).toBe(2);
  });

  it('carries the remainder beside the rays and never as one of them', () => {
    const set = raysFor(document());
    expect(set.remainder).toBeCloseTo(0.05, 10);
    // No ray is the remainder: the drawn set is exactly the column's sources.
    expect(set.rays.some((ray) => ray.contribution === set.remainder)).toBe(false);
    expect(set.rays).toHaveLength(3);
    expect(set.rays.map((ray) => ray.sourceId).sort()).toEqual(['a.cell-0', 'b.cell-1', 'c.cell-2']);
  });

  it('SC-001: the drawn contributions and the remainder sum to the weight the holding published', () => {
    for (const level of [undefined, 0, 200]) {
      const set = raysFor(document(), level);
      const residual = contributionResidual(set);
      // `residual.published` **is** `set.observationWeight` — the function returns it verbatim —
      // so an assertion relating the two was true for every input and every implementation,
      // correct or broken. It read as coverage of the SC-001 identity and covered nothing. What
      // is left is the line that was always doing the work.
      // Exact in this arithmetic; the running loop's own tolerance is the holding's, and that
      // assertion is in forecast.test.tsx where the numbers are the analyst's.
      expect(residual.difference).toBeCloseTo(0, 10);
    }
  });

  it('says a column nothing reached is unreached, rather than drawing it as nothing contributing', () => {
    const empty = document();
    const unreachedDocument: AnalysisContributions = {
      ...empty,
      levels: empty.levels.map((level) => ({
        ...level,
        reached: false,
        observation_weight: 0,
        remainder: 0,
        background_error_std: null,
        contributions: [],
      })),
    };
    const set = raysFor(unreachedDocument);
    expect(set.widest).toBe(0);
    expect(set.reachedCount).toBe(0);
    // The column's sources are still its sources; none of them reached it, and every ray says
    // so rather than the set being empty, which would read as a column with no sources at all.
    expect(set.rays).toHaveLength(3);
    expect(set.rays.every((ray) => ray.reachedHere === false)).toBe(true);

    // And a column that *was* reached and whose contributions summed to nothing is the other
    // fact: reached, no rays worth drawing, and it does not claim to be unsampled.
    const summedToNothing: AnalysisContributions = {
      ...empty,
      levels: [{ ...empty.levels[0], reached: true, observation_weight: 0, remainder: 0, contributions: [] }],
    };
    // Reached, and contributed nothing: `reachedCount` counts sources with an entry, and a
    // level with no entries has none — the two facts are told apart by `absenceOf`, over the
    // document, which is where FR-129's distinction is drawn.
    expect(raysFor(summedToNothing).reachedCount).toBe(0);
  });

  it('SC-005: the standing forecast is not a ray, and a source table that admitted one is named', () => {
    const clean = raysFor(document());
    expect(backgroundRaysIn(clean)).toEqual([]);

    // **The plant is a document a future analyst could actually publish.** The first version of
    // this test planted a source whose *datastream id* was the word `archive`, matching a guard
    // that string-matched the share vocabulary — but datastream ids in this harness are sensor
    // streams, so the plant tested the function and not the guard: a shore broadcast admitted as
    // `shore-temperature-broadcast` would have walked straight past it. What marks an origin as
    // the background is `kind`, which the master defines and the analyst fills.
    const admitted = document();
    admitted.sources = [
      source('c.cell-2', -10.6),
      source('a.cell-0', -11.4),
      source('d.cell-3', -11.0, 'shore-temperature-broadcast', 'modelled'),
    ];
    const set = raysFor(admitted);
    const named = backgroundRaysIn(set);
    expect(named.map((ray) => ray.datastreamId)).toEqual(['shore-temperature-broadcast']);
    // And it is found by what it is, not by what it is called: the same source under any name
    // is still the background.
    expect(named[0].kind).toBe('modelled');

    // **And it is not drawn**, which is what "not among the rays" says. Reporting it in a
    // paragraph while the map drew it anyway put the guard on the sentence rather than on the
    // surface — and the SRD's FR-123 amendment, which declines to build the docked marginal
    // nodes, leans on this guard for the day an analyst admits a non-spatial source.
    expect(drawableRays(set).map((ray) => ray.datastreamId)).not.toContain('shore-temperature-broadcast');
    expect(drawableRays(set)).toHaveLength(set.rays.length - 1);
    // It stays in the set the table and the ω identity are read from: it is part of what the
    // gain weighed, and dropping it there would break SC-001 silently instead of loudly.
    expect(set.rays).toHaveLength(3);
    expect(drawableRays(raysFor(document()))).toHaveLength(3);
  });
});

describe('telling two sources of one instrument apart', () => {
  it('names a lone datastream plainly and an ambiguous one by its ordinal', () => {
    // The case a capture found: one instrument sampling either side of a cell boundary is two
    // sources, and the profile printed both as `temperature-200m` at different widths.
    const twice = [source('a.cell-0', -11.4, 'temperature-200m'), source('b.cell-1', -11.0, 'temperature-050m'), source('c.cell-2', -10.6, 'temperature-200m')];
    expect(sourceLabels(twice)).toEqual(['temperature-200m ·1', 'temperature-050m', 'temperature-200m ·2']);
    // And a column where every instrument appears once keeps the plain names: the ordinal is
    // there to remove an ambiguity, not as decoration.
    expect(sourceLabels([source('a.cell-0', -11.4, 'temperature-050m')])).toEqual(['temperature-050m']);
  });
});

describe('where a position lands on the drawn map', () => {
  // The served axis of a five-cell grid, thinned by two: cells 0, 2 and 4 are drawn, so the map
  // is three units wide and a served cell is half a unit.
  const axis = [-11.4, -11.2, -11.0, -10.8, -10.6];
  const kept = [0, 2, 4];

  it('puts a cell centre at the centre of the drawn column it falls in', () => {
    expect(placeOn(axis, kept, -11.4)).toBeCloseTo(0.5, 10);
    expect(placeOn(axis, kept, -11.0)).toBeCloseTo(1.5, 10);
    expect(placeOn(axis, kept, -10.6)).toBeCloseTo(2.5, 10);
  });

  it('interpolates between two axis entries rather than snapping to one', () => {
    // **The fault this replaced.** Snapping put every one of these at 0.5 or 1.5, so two sources
    // a cell apart shared a point and the ray between a column and its source had no length.
    const between = [-11.3, -11.2, -11.1].map((value) => placeOn(axis, kept, value) as number);
    expect(new Set(between).size, 'three distinct positions collapsed to fewer').toBe(3);
    expect(between[0]).toBeCloseTo(0.75, 10);
    expect(between[1]).toBeCloseTo(1.0, 10);
    expect(between[2]).toBeCloseTo(1.25, 10);
    // Monotone: moving east never moves the mark west.
    expect(between[0]).toBeLessThan(between[1]);
    expect(between[1]).toBeLessThan(between[2]);
  });

  it('reads a descending axis the same way, since a latitude axis may run either way', () => {
    const down = [46.8, 46.6, 46.4, 46.2, 46.0];
    expect(placeOn(down, kept, 46.8)).toBeCloseTo(0.5, 10);
    expect(placeOn(down, kept, 46.0)).toBeCloseTo(2.5, 10);
    expect(placeOn(down, kept, 46.5)).toBeCloseTo(1.25, 10);
  });

  it('clamps outside the axis to the drawn extent rather than marking a place off the map', () => {
    // The axes carry cell centres and an observation sits inside a cell, so this is at most half
    // a cell and only at the grid's rim. A mark outside the viewBox would read as a place the
    // source is not.
    expect(placeOn(axis, kept, -12)).toBe(0.5);
    expect(placeOn(axis, kept, -9)).toBe(2.5);
    for (const value of [-12, -9, -11.4, -10.6, -11.1]) {
      const at = placeOn(axis, kept, value) as number;
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThanOrEqual(kept.length);
    }
  });

  it('says nothing where there is no axis or nothing drawn, rather than answering zero', () => {
    expect(placeOn([], kept, -11)).toBeUndefined();
    expect(placeOn(axis, [], -11)).toBeUndefined();
    // A one-entry axis is one place, and it is the middle of the only drawn column.
    expect(placeOn([-11], [0], -11)).toBeCloseTo(0.5, 10);
    expect(placeOn([-11], [0], 40)).toBeCloseTo(0.5, 10);
  });
});

describe('matching a displayed depth to a level the document carries', () => {
  function axis(depths: readonly number[]): AnalysisContributions {
    const base = document();
    return {
      ...base,
      levels: depths.map((depth, index) => ({ ...base.levels[0], depth_index: index, depth_m: depth })),
    };
  }

  it('T022l: refuses a depth from another era’s axis rather than pairing it with a near level', () => {
    // **The fault this join exists to catch, asked of it directly.** The archive era is filed at
    // 0, 333, 667, 1000 and an analysis at 0, 200, … 1000. A profile drawn over the wrong axis
    // asks for 333 and 667; if either is answered, a row pairs one depth's background with
    // another depth's contributions — and the printed "sums to 100.0%" cannot see it, because ω
    // cancels out of that sum. The first tolerance here was half the axis's own spacing, which
    // answered both.
    const analysis = axis([0, 200, 400, 600, 800, 1000]);
    expect(levelAtDepth(analysis, 333), '333 m was answered from a 200 m axis').toBeUndefined();
    expect(levelAtDepth(analysis, 667), '667 m was answered from a 200 m axis').toBeUndefined();
    // Its own depths still match, which is the whole of what a correct axis needs.
    for (const depth of [0, 200, 400, 600, 800, 1000]) {
      expect(levelAtDepth(analysis, depth)?.depth_m, `${depth} m went unmatched`).toBe(depth);
    }
  });

  it('matches a depth the arithmetic reproduces, without demanding bit equality', () => {
    // The display axis and the document are built by the same formula from the same manifest —
    // `minimum + index * spacing` in both — so a real match is equal to within floating-point
    // representation. `0.1 + 0.2` is the standard demonstration that "the same arithmetic" and
    // "the same bits" are different claims; the bound is relative and small rather than absent.
    const analysis = axis([0, 200, 400]);
    expect(levelAtDepth(analysis, 200 * 3 - 400)?.depth_m).toBe(200);
    expect(levelAtDepth(analysis, 400 + 1e-9)?.depth_m).toBe(400);
    // And a metre away is a different depth, not a rounding of this one.
    expect(levelAtDepth(analysis, 401)).toBeUndefined();
  });

  it('reads a non-uniform axis, where a spacing-derived tolerance has no single value', () => {
    // A fine near-surface axis coarsening with depth, which is the ordinary shape for an ocean
    // model and which the masters do not forbid. Every level it carries is matched; nothing
    // between them is.
    const coarsening = axis([0, 10, 20, 100, 300, 700]);
    for (const depth of [0, 10, 20, 100, 300, 700]) {
      expect(levelAtDepth(coarsening, depth)?.depth_m, `${depth} m went unmatched`).toBe(depth);
    }
    expect(levelAtDepth(coarsening, 55)).toBeUndefined();
    expect(levelAtDepth(coarsening, 320)).toBeUndefined();
    expect(levelAtDepth(coarsening, 500)).toBeUndefined();
  });

  it('answers only for its own depth when the document carries one level', () => {
    const single = axis([400]);
    expect(levelAtDepth(single, 400)?.depth_m).toBe(400);
    expect(levelAtDepth(single, 0)).toBeUndefined();
  });
});

describe('which palette entry a source is drawn in', () => {
  it('keys on the instrument, so the same one keeps its colour between two columns', () => {
    // **The fault.** The palette used the source's position in the served `sources` array, and
    // `contributions.ts` builds that array by first encounter while walking *this column's*
    // levels. Two columns encounter differently, so the same physical instrument came out in one
    // colour, dash and hatch in one column and another in the next — in a region whose premise is
    // that a reader picks one square and then another.
    const columnA = [source('a.cell-0', -11.4, 'temperature-050m'), source('b.cell-1', -11.0, 'temperature-200m')];
    const columnB = [source('c.cell-2', -10.6, 'temperature-200m'), source('d.cell-3', -11.2, 'temperature-050m')];
    // Encounter order differs; the instrument's slot does not.
    expect(paletteSlots(columnA).hue).toEqual([0, 1]);
    expect(paletteSlots(columnB).hue).toEqual([1, 0]);
    const slotOf = (sources: AnalysisContributionsSource[], datastream: string) =>
      paletteSlots(sources).hue[sources.findIndex((entry) => entry.datastream_id === datastream)];
    for (const instrument of ['temperature-050m', 'temperature-200m']) {
      expect(slotOf(columnA, instrument), `${instrument} changed colour between columns`).toBe(
        slotOf(columnB, instrument),
      );
    }
  });

  it('gives two sources of one instrument its colour, and tells them apart by the ordinal', () => {
    // The same instrument either side of a cell boundary is two sources and one instrument. They
    // share the hue deliberately — the `·1`/`·2` ordinal and their positions are what separate
    // them, which is what that ordinal was added for.
    const twice = [
      source('a.cell-0', -11.4, 'temperature-200m'),
      source('b.cell-1', -11.0, 'temperature-050m'),
      source('c.cell-2', -10.6, 'temperature-200m'),
    ];
    expect(paletteSlots(twice).hue).toEqual([1, 0, 1]);
    // …and they are told apart *within* the column by dash and hatch, which step once per further
    // source of that instrument. Colour alone would have drawn three adjacent bands of one bar
    // identically, which is the defect the greyscale work exists against.
    expect(paletteSlots(twice).texture).toEqual([1, 0, 2]);
    expect(sourceLabels(twice)).toEqual(['temperature-200m ·1', 'temperature-050m', 'temperature-200m ·2']);
  });

  it('is a rank in the column’s own instruments, which is all the shell can promise', () => {
    // A column that carries an instrument the other does not shifts the ranks below it, and no
    // served document carries a list of every instrument in the run — so this is stated rather
    // than claimed away. The swatch sits beside the instrument's name in the table.
    const withExtra = [
      source('a.cell-0', -11.4, 'ctd-cast'),
      source('b.cell-1', -11.0, 'temperature-050m'),
      source('c.cell-2', -10.6, 'temperature-200m'),
    ];
    expect(paletteSlots(withExtra).hue).toEqual([0, 1, 2]);
  });
});

describe('a depth the document does not carry', () => {
  it('is not the same fact as a level nothing reached, and the set says which', () => {
    // Both come out as nought in every figure, which is why they were the same thing to every
    // surface reading the set: `levels` is empty when no level matched, so the sums are zero and
    // the caption printed "ω = 0.0000, the weight this cycle's observations added" about a level
    // the document says nothing about — under the row's own sentence saying so.
    const carried = document();
    const missing = raysFor(carried, 333);
    expect(missing.noSuchLevel).toBe(true);
    expect(missing.observationWeight).toBe(0);
    expect(missing.reachedCount).toBe(0);

    // A level the document *does* carry, where nothing reached, is the other fact: same zeros,
    // and the set does not claim the level is absent.
    const empty: AnalysisContributions = {
      ...carried,
      levels: [{ ...carried.levels[0], reached: false, observation_weight: 0, remainder: 0, contributions: [] }],
    };
    const nothing = raysFor(empty, 0);
    expect(nothing.noSuchLevel).toBe(false);
    expect(nothing.observationWeight).toBe(0);

    // And the whole column is never "no such level" — no depth was asked for.
    expect(raysFor(carried).noSuchLevel).toBe(false);
  });
});
