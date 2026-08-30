/**
 * The measurements branch (feature 120, FR-07 to FR-09): what the sensors have reported,
 * walked platform → datastream → chart.
 *
 * The grouping is SensorThings' own — a Thing carries Datastreams, a Datastream carries
 * Observations — and this branch does not invent a second one. The tab's spine is by data
 * kind rather than by standard, which is a regrouping at the top level; regrouping again
 * *inside* a branch would leave the tree agreeing with nothing.
 *
 * The chart is hand-rolled SVG. No charting library enters the tree for one chart, and
 * the geometry it needs is in `series.ts`, where it can be checked against values rather
 * than against a picture.
 */
import { useEffect, useState } from 'react';
import type { SeamValidator } from '../../seam/validate.js';
import { displayInstant } from '../../shell/display.js';
import { readObservations, type Datastream, type ObservationHistory, type Thing } from './read.js';
import { path, series, valueTicks } from './series.js';

const CHART = { width: 640, height: 220 };

export function Measurements({
  things,
  datastreams,
  refreshToken,
  refusal,
  selected,
  onSelect,
  stPrefix,
  validator,
  missing,
}: {
  readonly things: readonly Thing[];
  readonly datastreams: readonly Datastream[];
  /** Bumped by the tab's refresh control; the open chart reads it as its cue to fetch. */
  readonly refreshToken: number;
  /** Why the branch has nothing, where it has nothing (FR-06). */
  readonly refusal?: string;
  /** The datastream key, `<thing>/<datastream>`. */
  readonly selected?: string;
  readonly onSelect: (datastreamId: string | undefined) => void;
  readonly stPrefix: string;
  readonly validator: SeamValidator;
  readonly missing?: string;
}) {
  const chosen = datastreams.find((stream) => stream.id === selected);

  return (
    <div className="data-branch">
      <div className="data-branch-head">
        <h3>Measurements</h3>
        <p className="panel-footnote">
          what the sensors have reported, by platform and by datastream
        </p>
        {missing !== undefined && (
          <p className="shell-refusal" data-testid="node-missing">
            the address asked for “{missing}”, which no datastream answers to — the sensor may
            not have reported yet
          </p>
        )}
      </div>

      {refusal !== undefined ? (
        <p className="shell-refusal" data-testid="branch-refusal">
          {refusal}
        </p>
      ) : things.length === 0 ? (
        <p className="panel-footnote" data-testid="branch-empty">
          no platform has reported yet — a datastream appears when its first observation
          reaches the store
        </p>
      ) : (
        <div className="measurement-platforms">
          {things.map((thing) => {
            const streams = datastreams.filter((stream) => stream.thingId === thing.id);
            return (
              <section key={thing.id} className="measurement-platform" data-thing={thing.id}>
                <h4>{thing.name}</h4>
                <p className="panel-footnote">{thing.description}</p>
                {streams.length === 0 ? (
                  <p className="panel-footnote">this platform has reported no datastream yet</p>
                ) : (
                  <ul className="measurement-streams">
                    {streams.map((stream) => (
                      <li key={stream.id}>
                        <button
                          type="button"
                          data-datastream={stream.id}
                          aria-pressed={stream.id === selected}
                          onClick={() => onSelect(stream.id === selected ? undefined : stream.id)}
                        >
                          {/* The datastream's own id, not its observed property. A
                              platform carries the same property at more than one depth —
                              temperature at 50 m and at 200 m — and labelling by property
                              drew two buttons a reader could not tell apart, which the
                              first capture of this branch showed. */}
                          {stream.id.split('/')[1] ?? stream.id}
                          <span className="stream-unit"> ({stream.unit.symbol})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div data-region="chart">
        {chosen && (
          <DatastreamChart
            stream={chosen}
            refreshToken={refreshToken}
            stPrefix={stPrefix}
            validator={validator}
          />
        )}
      </div>
    </div>
  );
}

type HistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly history: ObservationHistory }
  | { readonly status: 'refused'; readonly refusal: string };

function DatastreamChart({
  stream,
  refreshToken,
  stPrefix,
  validator,
}: {
  readonly stream: Datastream;
  readonly refreshToken: number;
  readonly stPrefix: string;
  readonly validator: SeamValidator;
}) {
  const [state, setState] = useState<HistoryState>({ status: 'loading' });

  useEffect(() => {
    let abandoned = false;
    setState({ status: 'loading' });
    void (async () => {
      const answer = await readObservations(stPrefix, stream.id, validator);
      if (abandoned) return;
      setState(answer.ok ? { status: 'loaded', history: answer.value } : { status: 'refused', refusal: answer.refusal });
    })();
    return () => {
      abandoned = true;
    };
    // `refreshToken` is the dependency that was missing. Keyed on the datastream alone,
    // this effect fetched once and never again: the chart a reader was watching was the
    // one thing in the tab that could not change, while the clock ran on. Reported
    // against the built page, and reproduced at ×600 — 66 points, and still 66 points
    // twenty-six simulated minutes later.
  }, [refreshToken, stPrefix, stream.id, validator]);

  if (state.status === 'refused') {
    return (
      <section className="data-chart">
        <p className="shell-refusal" data-testid="chart-refusal">
          {state.refusal}
        </p>
      </section>
    );
  }
  if (state.status === 'loading') {
    return (
      <section className="data-chart">
        <p className="panel-footnote" data-testid="chart-state">
          reading this datastream’s history…
        </p>
      </section>
    );
  }

  const plotted = series(state.history.points, CHART.width, CHART.height);
  if (!plotted) {
    // Not empty axes: the store either holds nothing for this datastream or held
    // something unreadable, and the reader is owed which (FR-09).
    return (
      <section className="data-chart">
        <p className="panel-footnote" data-testid="chart-state">
          {state.history.count === 0
            ? 'this datastream has reported no observation yet'
            : `the store reports ${state.history.count} observation(s) for this datastream and none of them carries a readable instant and value`}
        </p>
      </section>
    );
  }

  const ticks = valueTicks(plotted);
  return (
    <section className="data-chart" data-testid="datastream-chart" data-datastream-chart={stream.id}>
      <h4>
        {stream.name} <span className="stream-unit">({stream.unit.name})</span>
      </h4>
      <svg
        viewBox={`0 0 ${CHART.width + 70} ${CHART.height + 40}`}
        className="series-chart"
        role="img"
        aria-label={`${stream.name}: ${state.history.points.length} observation(s) from ${displayInstant(
          state.history.points[0].simTime,
        )}, ranging ${plotted.value.minimum.toFixed(2)} to ${plotted.value.maximum.toFixed(
          2,
        )} ${stream.unit.symbol}`}
      >
        <g transform="translate(60, 10)">
          {ticks.map((tick) => (
            <g key={tick.value} transform={`translate(0, ${tick.y * CHART.height})`}>
              <line x1={0} x2={CHART.width} y1={0} y2={0} className="series-gridline" />
              <text x={-8} y={4} textAnchor="end" className="series-tick">
                {tick.value.toFixed(2)}
              </text>
            </g>
          ))}
          <polyline className="series-line" points={path(plotted.plotted)} />
        </g>
        <text x={60} y={CHART.height + 32} className="series-tick">
          {displayInstant(state.history.points[0].simTime)}
        </text>
        <text x={CHART.width + 60} y={CHART.height + 32} textAnchor="end" className="series-tick">
          {displayInstant(state.history.points[state.history.points.length - 1].simTime)}
        </text>
      </svg>
      <p className="panel-footnote" data-testid="chart-summary">
        {state.history.points.length} observation(s) of {state.history.count} the store reports,
        in {stream.unit.symbol}, against simulation time.
        {state.history.truncated && ' The history was long enough to reach this tab’s paging ceiling, so what is drawn is the earliest part of it.'}
      </p>
    </section>
  );
}
