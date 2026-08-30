/**
 * The shore-updates branch (feature 118, FR-15, FR-16): advice from shore, drawn.
 *
 * Advisories have had a store, a publisher and a Features collection since feature 108
 * and have never been drawn anywhere. What they have instead of a picture is a document
 * with no free text in it — every field an enum, a bounded pattern or a timestamp, so
 * that no field is capable of naming an entity — which makes them exactly the thing a
 * canvas serves better than a list: a region, a kind, and a window of validity.
 *
 * A lapsed advisory stays on the canvas, drawn spent. What shore has said is a record,
 * and dropping an advisory when its validity ran out would answer "has anything been
 * advised here?" with "no" when the truth is "yes, and it has expired".
 */
import DeckGL from '@deck.gl/react';
import { PolygonLayer } from '@deck.gl/layers';
import { displayInstant } from '../../shell/display.js';
import {
  KIND_LABEL,
  advisoryRegions,
  fillFor,
  outlineFor,
  standingLabel,
  type AdvisoryRegion,
} from './advisories.js';
import type { FeaturesResponseFeatureCollection } from '../../generated/types.js';

/** One colour per kind, so a reader following one kind follows one hue as it expires. */
const KIND_COLOUR: Record<string, [number, number, number]> = {
  'sound-speed-outlook': [64, 132, 214],
  'sampling-window': [86, 176, 128],
  'caution-region': [214, 132, 64],
};
const UNSTATED: [number, number, number] = [150, 150, 160];

export function ShoreUpdates({
  advisories,
  refusal,
  nowSimTime,
  selected,
  onSelect,
  missing,
}: {
  readonly advisories?: FeaturesResponseFeatureCollection;
  readonly refusal?: string;
  readonly nowSimTime?: string;
  readonly selected?: string;
  readonly onSelect: (advisoryId: string | undefined) => void;
  readonly missing?: string;
}) {
  const { regions, unreadable } = advisories
    ? advisoryRegions(advisories, nowSimTime)
    : { regions: [], unreadable: 0 };
  const chosen = regions.find((region) => region.id === selected);

  const bounds = regions.reduce(
    (box, region) => ({
      west: Math.min(box.west, region.bbox[0]),
      south: Math.min(box.south, region.bbox[1]),
      east: Math.max(box.east, region.bbox[2]),
      north: Math.max(box.north, region.bbox[3]),
    }),
    { west: 180, south: 90, east: -180, north: -90 },
  );

  return (
    <div className="data-branch" data-region="advisories">
      <div className="data-branch-head">
        <h3>Shore updates</h3>
        <p className="panel-footnote">advice sent from shore: where it applies, and for how long</p>
        {missing !== undefined && (
          <p className="shell-refusal" data-testid="node-missing">
            the address asked for “{missing}”, which the advisory store does not hold
          </p>
        )}
      </div>

      {refusal !== undefined ? (
        <p className="shell-refusal" data-testid="branch-refusal">
          {refusal}
        </p>
      ) : regions.length === 0 ? (
        // The collection is present-and-stating-empty before any advisory exists, and the
        // branch says that in those terms rather than drawing an empty sea (FR-16).
        <p className="panel-footnote" data-testid="branch-empty">
          the advisory collection is present and states that it holds nothing yet — shore has
          sent no advice in this run so far
        </p>
      ) : (
        <>
          <div className="advisory-canvas">
            <DeckGL
              initialViewState={{
                longitude: (bounds.west + bounds.east) / 2,
                latitude: (bounds.south + bounds.north) / 2,
                zoom: 5.2,
              }}
              controller
              layers={[
                new PolygonLayer<AdvisoryRegion>({
                  id: 'advisory-regions',
                  data: regions as AdvisoryRegion[],
                  getPolygon: (region) => region.ring as [number, number][],
                  getFillColor: (region) => fillFor(KIND_COLOUR[region.kind] ?? UNSTATED, region.standing),
                  getLineColor: (region) => outlineFor(KIND_COLOUR[region.kind] ?? UNSTATED, region.standing),
                  getLineWidth: 1.5,
                  lineWidthUnits: 'pixels',
                  stroked: true,
                  filled: true,
                  pickable: true,
                  onClick: (info) => onSelect(info.object ? (info.object as AdvisoryRegion).id : undefined),
                }),
              ]}
            />
          </div>

          <ul className="advisory-list" data-testid="advisory-list">
            {regions.map((region) => (
              <li key={region.id}>
                <button
                  type="button"
                  data-advisory={region.id}
                  data-standing={region.standing}
                  aria-pressed={region.id === selected}
                  onClick={() => onSelect(region.id === selected ? undefined : region.id)}
                >
                  <span className="advisory-kind" data-kind={region.kind}>
                    {KIND_LABEL[region.kind] ?? region.kind}
                  </span>
                  <span className="advisory-standing">{standingLabel(region.standing)}</span>
                  <span className="advisory-window">
                    {displayInstant(region.validFrom)} → {displayInstant(region.validTo)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {unreadable > 0 && (
            <p className="shell-refusal" data-testid="advisory-unreadable">
              {unreadable} advisory document(s) could not be read as a region and are not drawn
            </p>
          )}
        </>
      )}

      {chosen && (
        <section className="advisory-detail" data-testid="advisory-detail">
          <h4>{chosen.id}</h4>
          <p className="panel-footnote">
            {KIND_LABEL[chosen.kind] ?? chosen.kind}, {standingLabel(chosen.standing)} —{' '}
            {displayInstant(chosen.validFrom)} to {displayInstant(chosen.validTo)}
          </p>
          {/* The guidance document whole. Every field is an enum, a number or a
              timestamp by construction, so there is nothing here to summarise away. */}
          <pre data-testid="advisory-json">{JSON.stringify(chosen.properties, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}
