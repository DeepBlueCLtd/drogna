/**
 * Feature 124: the contributions codec, both ways, and what it refuses.
 */
import { describe, expect, it } from 'vitest';
import type { AnalysisContributionsHeader } from '../../generated/types.js';
import { createSeamValidator } from '../../seam/validate.js';
import { CONTRIBUTIONS_FORMAT, decodeContributions, encodeContributions, type ContributionRows } from './contributions-format.js';

const validator = createSeamValidator();

function header(cells: number, entries: number): AnalysisContributionsHeader {
  return {
    schema_version: 1,
    format: CONTRIBUTIONS_FORMAT,
    variable: 'temperature',
    correlation: { horizontal_km: 30, vertical_m: 160 },
    sources: [
      {
        source_id: 'temperature-050m.cell-7',
        datastream_id: 'temperature-050m',
        sensor_id: 'ctd-temp-050',
        kind: 'measured',
        cell: { index: 7, longitude: -13.5, latitude: 44.2, depth_m: 0 },
        observed: { longitude: -13.49, latitude: 44.21, depth_m: 50 },
        observation_count: 3,
        error_std: 0.02,
        background_error_std: 0.3,
        mean_innovation: -0.12,
      },
    ],
    cells,
    entries,
    layout:
      'u32[cells] cell; f32[cells] observation_weight; f32[cells] remainder; f32[cells] background_error_std; u32[cells+1] offsets; u32[entries] source; f32[entries] contribution; f32[entries] horizontal_km; f32[entries] vertical_m',
  };
}

function rows(): ContributionRows {
  return {
    cells: Uint32Array.from([7, 8]),
    weight: Float32Array.from([0.9, 0.4]),
    remainder: Float32Array.from([0.0, -0.05]),
    backgroundErrorStd: Float32Array.from([0.3, 0.31]),
    offsets: Uint32Array.from([0, 1, 2]),
    entrySource: Uint32Array.from([0, 0]),
    entryContribution: Float32Array.from([0.9, 0.45]),
    entryHorizontalKm: Float32Array.from([0, 4.9]),
    entryVerticalM: Float32Array.from([0, 0]),
  };
}

describe('drogna-contributions-v1', () => {
  it('round-trips the header and every section, and the header validates against its master', () => {
    const encoded = encodeContributions(header(2, 2), rows());
    const decoded = decodeContributions(encoded);
    expect(validator.validate('analysis-contributions#header', decoded.header).refusals).toEqual([]);
    expect(decoded.header).toEqual(header(2, 2));
    const expected = rows();
    for (const key of Object.keys(expected) as (keyof ContributionRows)[]) {
      expect(Array.from(decoded.rows[key]), key).toEqual(Array.from(expected[key]));
    }
    // A caller's unaligned view of the same bytes decodes the same: every section is copied.
    const shifted = new Uint8Array(encoded.byteLength + 1);
    shifted.set(encoded, 1);
    expect(decodeContributions(shifted.subarray(1)).rows.entryContribution[1]).toBe(expected.entryContribution[1]);
  });

  it('refuses a header that disagrees with the rows it fronts, and bytes that cannot be cut as their header says', () => {
    expect(() => encodeContributions(header(3, 2), rows())).toThrow(/claims 3 cells and the rows hold 2/);
    expect(() => encodeContributions(header(2, 5), rows())).toThrow(/claims 5 entries and the rows hold 2/);
    const encoded = encodeContributions(header(2, 2), rows());
    expect(() => decodeContributions(encoded.subarray(0, encoded.byteLength - 4))).toThrow(/which is \d+ bytes; the holding is \d+/);
  });
});
