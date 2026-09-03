/**
 * The contributions query (feature 124): one water column of one analysis cycle, source
 * by source, from the `drogna-contributions-v1` holding the analyst publishes beside its
 * analysis.
 *
 * Its own prefix and not a query type under EDR. A sparse per-source holding is not a
 * coverage — there is no grid of values to sample, and no CoverageJSON that could carry
 * a ray's origin — and the EDR component refuses unknown query types by name, which is
 * an honesty a fifth "position-like" query would spend. What is kept from EDR is the
 * spelling: a column is asked for as `coords=POINT(lon lat)` and snapped to the nearest
 * cell exactly as the position query snaps, so a reader who has one has the other.
 *
 * Nothing is computed here. The document restates the holding's rows for the six cells
 * of the column, with the source table cut to the sources those rows name, and the
 * identity a consumer may hold — Σ contributions + remainder = observation_weight — is
 * the kernel's, carried through untouched.
 */
import type { SeamHttpResponse, SeamRequest } from '../../seam/http.js';
import type { AnalysisContributions, AnalysisContributionsLevel, ConfigQuery, CoverageHolding } from '../../generated/types.js';
import type { CoverageStore } from '../coverage-store/store.js';
import { decodeContributions, type DecodedContributions } from '../lib/contributions-format.js';
import { CONTRIBUTIONS_FORMAT } from '../lib/holding-format.js';
import { axisValueAt, nearestIndex } from './field-sampler.js';
import { parsePoint } from './wkt.js';

function json(status: number, body: unknown): SeamHttpResponse {
  return { status, body: JSON.stringify(body) };
}

function refusal(status: number, text: string): SeamHttpResponse {
  return json(status, { refused: text });
}

export class ContributionsComponent {
  constructor(
    private readonly config: ConfigQuery,
    private readonly store: CoverageStore,
  ) {}

  private served(): string[] {
    return this.store
      .holdings()
      .filter((descriptor) => descriptor.field.format === CONTRIBUTIONS_FORMAT)
      .map((descriptor) => descriptor.holding_id)
      .sort();
  }

  handle(request: SeamRequest): SeamHttpResponse {
    const prefix = this.config.http.contributions_prefix;
    const pathOnly = request.path.split('?')[0];
    const rest = pathOnly === prefix ? '' : pathOnly.slice(prefix.length + 1);
    const segments = rest === '' ? [] : rest.split('/');
    const query = new URLSearchParams(request.path.split('?')[1] ?? '');

    if (segments.length === 0) {
      return refusal(404, `name a contributions holding; served: ${this.served().join(', ') || 'none yet — no analysis cycle has published one'}`);
    }
    const holding = this.store.holding(segments[0]);
    if (!holding) {
      return refusal(404, `no contributions holding named '${segments[0]}'; served: ${this.served().join(', ') || 'none yet'}`);
    }
    if (holding.descriptor.field.format !== CONTRIBUTIONS_FORMAT) {
      return refusal(
        404,
        `'${segments[0]}' is a ${holding.descriptor.field.format} coverage, served by EDR at ${this.config.http.edr_prefix}; contributions holdings served: ${this.served().join(', ') || 'none yet'}`,
      );
    }
    if (segments.length > 2 || (segments.length === 2 && segments[1] !== 'column')) {
      return refusal(404, `'${segments.slice(1).join('/')}' is not a query this prefix serves; served: column`);
    }
    // Decoded per request, once the request is known to be one this serves. A holding is
    // ~100 KB and the decode is a header parse and nine copies; a cache would be a second
    // copy of a store the run already keeps for ever, kept for a caller that does not exist
    // yet. The first measurement that wants one is where it gets added.
    const decoded = decodeContributions(holding.bytes);
    if (segments.length === 1) return json(200, decoded.header);
    const coords = query.get('coords');
    if (!coords) return refusal(400, "a column is asked for by 'coords=POINT(lon lat)', and none was given");
    const point = parsePoint(coords);
    if (!point.ok) return refusal(400, point.refusal);
    return this.column(holding, decoded, point.value.longitude, point.value.latitude);
  }

  private column(
    holding: { descriptor: CoverageHolding; bytes: Uint8Array },
    decoded: DecodedContributions,
    longitude: number,
    latitude: number,
  ): SeamHttpResponse {
    const grid = holding.descriptor.manifest.grid;
    const lonIndex = nearestIndex(grid.longitude, longitude);
    const latIndex = nearestIndex(grid.latitude, latitude);
    if (lonIndex === undefined || latIndex === undefined) {
      return refusal(
        400,
        `position (${longitude}, ${latitude}) is outside the holding's spatial extent lon [${grid.longitude.minimum}, ${grid.longitude.maximum}], lat [${grid.latitude.minimum}, ${grid.latitude.maximum}]`,
      );
    }
    const { header, rows } = decoded;
    // The document's source table is the holding's cut to what this column names, in
    // the holding's order, so an index in it is stable for the column's lifetime.
    const named = new Map<number, number>();
    const levels: AnalysisContributionsLevel[] = [];
    for (let depthIndex = 0; depthIndex < grid.depth.count; depthIndex++) {
      const cell = (depthIndex * grid.latitude.count + latIndex) * grid.longitude.count + lonIndex;
      const row = rowOf(rows.cells, cell);
      const level: AnalysisContributionsLevel = {
        depth_index: depthIndex,
        depth_m: axisValueAt(grid.depth, depthIndex),
        cell_index: cell,
        reached: row !== undefined,
        observation_weight: row === undefined ? 0 : rows.weight[row],
        remainder: row === undefined ? 0 : rows.remainder[row],
        background_error_std: row === undefined ? null : rows.backgroundErrorStd[row],
        contributions: [],
      };
      if (row !== undefined) {
        for (let entry = rows.offsets[row]; entry < rows.offsets[row + 1]; entry++) {
          const source = rows.entrySource[entry];
          let local = named.get(source);
          if (local === undefined) {
            local = named.size;
            named.set(source, local);
          }
          level.contributions.push({
            source: local,
            contribution: rows.entryContribution[entry],
            separation: { horizontal_km: rows.entryHorizontalKm[entry], vertical_m: rows.entryVerticalM[entry] },
          });
        }
      }
      levels.push(level);
    }
    const document: AnalysisContributions = {
      schema_version: 1,
      holding_id: holding.descriptor.holding_id,
      // The model run, from the header: the descriptor's run_id is the scenario's.
      run_id: header.run_id,
      variable: header.variable,
      correlation: header.correlation,
      column: {
        longitude: axisValueAt(grid.longitude, lonIndex),
        latitude: axisValueAt(grid.latitude, latIndex),
        longitude_index: lonIndex,
        latitude_index: latIndex,
      },
      sources: [...named.keys()].map((source) => header.sources[source]),
      levels,
    };
    return json(200, document);
  }
}

/** The row holding `cell`, by binary search over the ascending cell list; undefined when no source reaches it. */
function rowOf(cells: Uint32Array, cell: number): number | undefined {
  let low = 0;
  let high = cells.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (cells[mid] === cell) return mid;
    if (cells[mid] < cell) low = mid + 1;
    else high = mid - 1;
  }
  return undefined;
}
