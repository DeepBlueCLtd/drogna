/**
 * The volume's arithmetic, alone (feature 124, FR-120).
 *
 * The load-bearing test here is the last one: it runs this module's pick over the same input the
 * *backend's* published estimator runs over, and requires the two to agree. Everything the volume
 * draws rests on those being one definition rather than two, and a test file that only checked
 * this module against numbers typed into it would hold nothing about that.
 */
import { describe, expect, it } from 'vitest';
import {
  FEATURE_SIGMAS,
  domainMeanProfile,
  featureReach,
  thermoclineIn,
  thermoclineSurface,
  type LevelField,
} from './volume.js';

describe('where a column falls fastest', () => {
  const depthsM = [0, 200, 400, 600, 800, 1000];

  it('reports the midpoint of the steepest pair, carrying the interval it was resolved at', () => {
    // Falls hardest between 200 m and 400 m: 4 degrees over 200 m.
    const profile = { depthsM, temperatureC: [15, 14.5, 10.5, 10, 9.8, 9.7] };
    const found = thermoclineIn(profile);
    expect(found?.depthM, 'not the midpoint of the steepest pair').toBe(300);
    expect(found?.thicknessM, 'the estimate does not carry the interval it was taken over').toBe(200);
    expect(found?.dropC).toBeCloseTo(4, 10);
  });

  it('refuses a profile that does not fall, which is not the same as one falling at nought', () => {
    // A column that warms with depth has no thermocline to place. Drawing 0 m — or the first
    // pair — would put a surface where the physics says there is none.
    expect(thermoclineIn({ depthsM, temperatureC: [9, 10, 11, 12, 13, 14] })).toBeUndefined();
    expect(thermoclineIn({ depthsM, temperatureC: [10, 10, 10, 10, 10, 10] })).toBeUndefined();
    // And a profile too short to have a pair at all.
    expect(thermoclineIn({ depthsM: [0], temperatureC: [10] })).toBeUndefined();
  });

  it('skips a level it was not served rather than letting it win the comparison', () => {
    // **The fault this is written against.** `NaN > steepest` is false, so an unguarded scan
    // does not *choose* the unserved pair — it silently keeps whatever came before it, and the
    // surface reports a shallower thermocline with no sign anything was missing. Here the real
    // steepest pair is 600–800 m, and it sits after the hole.
    const holed = { depthsM, temperatureC: [15, 14.9, Number.NaN, 14.7, 10, 9.9] };
    const found = thermoclineIn(holed);
    expect(found?.depthM, 'a hole in the profile changed which pair was picked').toBe(700);
    expect(found?.dropC).toBeCloseTo(4.7, 10);
  });
});

describe('the surface over a field', () => {
  // Two cells: the first falls between 200 and 400, the second between 600 and 800. A domain
  // mean cannot express that difference, which is why the surface exists.
  const levels: LevelField[] = [
    { depthM: 0, temperatureC: [15, 15] },
    { depthM: 200, temperatureC: [14.5, 14.9] },
    { depthM: 400, temperatureC: [10.5, 14.8] },
    { depthM: 600, temperatureC: [10.2, 14.7] },
    { depthM: 800, temperatureC: [10, 10] },
    { depthM: 1000, temperatureC: [9.9, 9.9] },
  ];

  it('gives each column its own depth, which is the shape a domain mean cannot carry', () => {
    const surface = thermoclineSurface(levels);
    expect(surface).toHaveLength(2);
    expect(surface[0]?.depthM).toBe(300);
    expect(surface[1]?.depthM).toBe(700);
    expect(new Set(surface.map((cell) => cell?.depthM)).size, 'the surface is flat').toBe(2);
  });

  it('keeps a column with no thermocline in place rather than dropping it', () => {
    // Indexable by cell: a caller drawing the surface has to be able to draw the hole where a
    // column has none, and a compacted array would silently shift every later cell westwards.
    const withHole = levels.map((level) => ({ ...level, temperatureC: [...level.temperatureC, 10] }));
    const surface = thermoclineSurface(withHole);
    expect(surface).toHaveLength(3);
    expect(surface[2], 'a flat column was given a thermocline').toBeUndefined();
    expect(surface[0]?.depthM, 'the hole moved an earlier column').toBe(300);
  });

  it('reads no further than the shortest level it was given', () => {
    // A truncated level is a short read, not a stack of different places: taking the first
    // level's width would index past the end of the others and compare undefined temperatures.
    const ragged = levels.map((level, at) => (at === 3 ? { ...level, temperatureC: [level.temperatureC[0]] } : level));
    expect(thermoclineSurface(ragged)).toHaveLength(1);
    expect(thermoclineSurface([])).toEqual([]);
    expect(thermoclineSurface([levels[0]]), 'one level is not a profile').toEqual([]);
  });
});

describe('how far down a feature reaches', () => {
  // Four cells. Cell 0 is the feature: strongly warm at the surface, half as warm at 200 m, and
  // lost in the field's own scatter below. The others are the field it sits in.
  //
  // **The deepest level has to scatter like real water, not sit uniform.** Written with the other
  // three within 0.01 °C of each other, a residual of 0.02 °C at the feature cleared two sigma of
  // almost nothing and the level read as "present" — the fixture, not the threshold, was wrong:
  // it did not represent the state it was named for. The shipped field's spread collapses with
  // depth but never to nothing (1.13 °C at the surface against 0.23 °C at 800 m), and it is that
  // remaining scatter a deep feature has to beat.
  const levels: LevelField[] = [
    { depthM: 0, temperatureC: [15.0, 12.0, 12.1, 11.9] },
    { depthM: 200, temperatureC: [11.5, 10.0, 10.1, 9.9] },
    { depthM: 400, temperatureC: [8.01, 8.0, 8.05, 7.95] },
  ];

  it('draws the feature where it beats the field, and stops where it does not', () => {
    const reach = featureReach(levels, 0);
    expect(reach.map((level) => level.present), 'the reach does not stop where the feature does').toEqual([
      true,
      true,
      false,
    ]);
    expect(reach[0].depthM).toBe(0);
    expect(reach[0].anomalyC).toBeGreaterThan(reach[1].anomalyC);
  });

  it('finds a deep feature that a fixed temperature floor would miss', () => {
    // **The case the per-level floor exists for, and the one the other tests could not see.**
    // Planted a fixed 0.5 °C threshold in place of the spread and every test here still passed:
    // on the fixture above the two rules give the same answer at every level, so nothing held the
    // design its docstring argues for. This is where they part. At 800 m the shipped field varies
    // by about 0.23 °C, so a feature standing 0.4 °C above its surroundings is unmistakable —
    // nearly ten sigma below — and a fixed floor of half a degree calls it absent.
    const deep: LevelField[] = [{ depthM: 800, temperatureC: [4.5, 4.1, 4.14, 4.06] }];
    const reach = featureReach(deep, 0);
    expect(reach[0].anomalyC, 'the anomaly is not the weak one this case is about').toBeLessThan(0.5);
    expect(reach[0].spreadC).toBeLessThan(0.1);
    expect(
      reach[0].present,
      'a feature far above a quiet field was missed, so the floor is not the level\u2019s own',
    ).toBe(true);
  });

  it('measures the floor from the level, not from a temperature typed here', () => {
    // **The point of a per-level floor.** The same anomaly in degrees is a feature at depth and a
    // wiggle at the surface, because the field's own spread collapses with depth — 1.13 °C at the
    // surface against 0.23 °C at 800 m on the shipped run. A fixed threshold would be two
    // different claims depending which level it was applied to.
    const reach = featureReach(levels, 0);
    for (const level of reach) {
      expect(level.spreadC, 'the floor is not the level\u2019s own spread').toBeGreaterThan(0);
      expect(level.present).toBe(Math.abs(level.anomalyC) >= FEATURE_SIGMAS * level.spreadC);
    }
    // The surface spread really is the larger one, so the two floors differ.
    expect(reach[0].spreadC).toBeGreaterThan(reach[2].spreadC);
  });

  it('draws nothing through water that does not vary, rather than everything', () => {
    // A level with no spread has nothing for a feature to stand out from. With a floor of nought
    // every cell clears it, and the drawing would carry the feature down through uniform water.
    const flat: LevelField[] = [{ depthM: 0, temperatureC: [10, 10, 10, 10] }];
    expect(featureReach(flat, 0)[0].present).toBe(false);
    // And a cell the field did not serve is absent, not present at nought.
    const holed: LevelField[] = [{ depthM: 0, temperatureC: [Number.NaN, 12, 12.1, 11.9] }];
    expect(featureReach(holed, 0)[0].present).toBe(false);
  });
});

describe('held to the estimate the run itself published', () => {
  it('reproduces the backend estimator exactly, on the domain mean of one field', async () => {
    // **The tie between this module and `model-runner/features.ts`.** Both define the
    // thermocline as the steepest level pair reported at its midpoint; if they ever stop
    // agreeing, the volume draws a surface the run's own published figure contradicts and
    // nothing else in the tree would notice.
    //
    // **The real estimator is called, not transcribed.** The first draft of this test copied
    // `features.ts#thermocline`'s arithmetic into the test body and compared this module against
    // the copy — which holds the two copies together and says nothing at all about the backend,
    // and would go on passing after the estimator it names had changed. A test may import both
    // halves: the import boundary excludes tests, and this is the case that exemption is for.
    //
    // The *domain mean* profile is the input the two can be compared on. The mean of the
    // per-column picks is a different quantity — argmax does not commute with averaging — so
    // this deliberately does not assert that, and `domainMeanProfile`'s docstring says why.
    const { estimateFeatures } = await import('../../backend/model-runner/features.js');

    const longitudes = [-11.4, -11.2];
    const latitudes = [46.0, 46.2];
    const levels: LevelField[] = [
      { depthM: 0, temperatureC: [15.0, 15.4, 14.6, 15.2] },
      { depthM: 200, temperatureC: [14.4, 14.9, 13.9, 14.6] },
      { depthM: 400, temperatureC: [10.6, 11.2, 10.1, 10.9] },
      { depthM: 600, temperatureC: [10.1, 10.6, 9.7, 10.3] },
      { depthM: 800, temperatureC: [9.9, 10.2, 9.5, 10.0] },
      { depthM: 1000, temperatureC: [9.8, 10.0, 9.4, 9.9] },
    ];

    // The estimator reads one Float32Array laid out level by level, each level row-major over
    // the same grid — the same order the levels above carry.
    const perLevel = levels[0].temperatureC.length;
    const packed = new Float32Array(levels.flatMap((level) => [...level.temperatureC]));
    const published = estimateFeatures(packed, {
      longitudes,
      latitudes,
      depthsM: levels.map((level) => level.depthM),
      cellKmEast: 15,
      cellKmNorth: 22,
      referenceLatitude: 46.1,
    }).thermocline;

    expect(published, 'the backend estimator placed no thermocline, so this test held nothing').toBeDefined();

    // **Compared on the same values, not merely the same numbers.** The estimator reads a
    // `Float32Array`; the literals above are doubles, and the first run of this test failed by
    // 2.4e-7 on the drop — float32 epsilon at that magnitude — with the depth and the thickness
    // already exact. That is a difference in the *precision of the input*, not in the
    // definition, and loosening the bound to absorb it would have hidden a real disagreement
    // later behind a tolerance sized for a storage artefact. Reading the levels back out of the
    // packed array is also the truer input: holdings are stored `drogna-f32-v1`, so a value
    // served through EDR has been through float32 before the shell ever parses it.
    const asServed: LevelField[] = levels.map((level, at) => ({
      depthM: level.depthM,
      temperatureC: [...packed.subarray(at * perLevel, (at + 1) * perLevel)],
    }));
    const mine = thermoclineIn(domainMeanProfile(asServed));
    expect(mine?.depthM, 'the volume and the run disagree about where the thermocline is').toBe(published?.depthM);
    expect(mine?.thicknessM, 'they disagree about the interval it was resolved at').toBe(published?.thicknessM);
    expect(mine?.dropC, 'they disagree about the drop across it').toBeCloseTo(published?.layerDropC ?? Number.NaN, 12);
  });
});
