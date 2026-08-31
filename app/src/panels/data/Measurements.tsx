/**
 * The measurements branch (feature 121, FR-07 to FR-09, FR-99): what the sensors have
 * reported, walked platform → datastream → history.
 *
 * The grouping is SensorThings' own — a Thing carries Datastreams, a Datastream carries
 * Observations — and this branch does not invent a second one. The tab's spine is by data
 * kind rather than by standard, which is a regrouping at the top level; regrouping again
 * *inside* a branch would leave the tree agreeing with nothing.
 *
 * A datastream's history is drawn **two ways behind two tabs**, a chart and a table, and
 * the fetch sits above both. Reported by the reader, and FR-99 had asked for the table
 * from the start — "with the observation table beside it" — which is the tree and the
 * record disagreeing in the direction this repository's first lesson warns about: the
 * requirement was the claim and the branch was the authority, and the branch had a chart
 * only. Sharing the fetch is the part worth stating: switching presentation asks the
 * store nothing, so the two views are the same observations by construction rather than
 * by two reads that could land either side of a publication and disagree.
 *
 * The chart is hand-rolled SVG. No charting library enters the tree for one chart, and
 * the geometry it needs is in `series.ts`, where it can be checked against values rather
 * than against a picture; the table's ordering is in `table.ts` for the same reason.
 */
import { useEffect, useState } from 'react';
import type { SeamValidator } from '../../seam/validate.js';
import { displayInstant } from '../../shell/display.js';
import { readObservations, type Datastream, type ObservationHistory, type Thing } from './read.js';
import { path, series, valueTicks } from './series.js';
import { observationRows, tableSummary, visibleRows } from './table.js';

const CHART = { width: 640, height: 220 };

/** Which presentation of one history is on screen. */
type Presentation = 'chart' | 'table';

const PRESENTATIONS: readonly { readonly id: Presentation; readonly label: string }[] = [
  { id: 'chart', label: 'Chart' },
  { id: 'table', label: 'Table' },
];

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
  /** Bumped by the tab's refresh control; the open history reads it as its cue to fetch. */
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
  /*
   * The presentation is held *here*, above the history, so that a reader who came for
   * numbers keeps them as they move from one datastream to the next. It is deliberately
   * not in the address (FR-98): the address names the node a link is about, and a reader
   * following a link to a datastream is owed that datastream, not a stranger's opinion
   * about how to look at it.
   */
  const [presentation, setPresentation] = useState<Presentation>('chart');

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
          <DatastreamHistory
            stream={chosen}
            presentation={presentation}
            onPresentation={setPresentation}
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

/**
 * One datastream's whole history, fetched once and presented as the reader asks.
 */
function DatastreamHistory({
  stream,
  presentation,
  onPresentation,
  refreshToken,
  stPrefix,
  validator,
}: {
  readonly stream: Datastream;
  readonly presentation: Presentation;
  readonly onPresentation: (presentation: Presentation) => void;
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
    // twenty-six simulated minutes later. `presentation` is deliberately *not* here: a
    // reader turning the same history around is not asking the store a second question.
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

  const { history } = state;
  if (history.points.length === 0) {
    // Not empty axes and not an empty table: the store holds nothing for this datastream
    // and the reader is owed that sentence rather than a picture of it (FR-09).
    return (
      <section className="data-chart">
        <p className="panel-footnote" data-testid="chart-state">
          this datastream has reported no observation yet
        </p>
      </section>
    );
  }

  const panelId = `datastream-${presentation}`;
  return (
    <section className="data-chart" data-testid="datastream-history" data-datastream-history={stream.id}>
      <h4>
        {stream.name} <span className="stream-unit">({stream.unit.name})</span>
      </h4>
      {/*
        Two tabs over one history. The shell's own strip (`Stack.tsx`) is plain buttons in
        a tablist rather than the roving-tabindex pattern, and this follows it: with two
        tabs, every tab reachable by Tab is more forgiving than one reachable tab and two
        arrow keys, and one idiom in the tree beats two.
      */}
      <div className="history-tabs" role="tablist" aria-label="how this history is shown">
        {PRESENTATIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            id={`datastream-tab-${option.id}`}
            data-presentation={option.id}
            aria-selected={option.id === presentation}
            aria-controls={`datastream-${option.id}`}
            onClick={() => onPresentation(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={`datastream-tab-${presentation}`}>
        {presentation === 'chart' ? (
          <Chart stream={stream} history={history} />
        ) : (
          <Table stream={stream} history={history} />
        )}
      </div>
    </section>
  );
}

function Chart({
  stream,
  history,
}: {
  readonly stream: Datastream;
  readonly history: ObservationHistory;
}) {
  const plotted = series(history.points, CHART.width, CHART.height);
  if (!plotted) {
    // The store holds observations and the chart can place none of them. Saying so is
    // the whole of what this branch can do, and the table is where they can be read:
    // an axis drawn through nothing would claim the store was empty, which it is not.
    return (
      <p className="panel-footnote" data-testid="chart-state">
        the store reports {history.count} observation(s) for this datastream and none of them
        carries a readable instant and value — the table shows what it returned
      </p>
    );
  }

  const ticks = valueTicks(plotted);
  return (
    <div data-testid="datastream-chart" data-datastream-chart={stream.id}>
      <svg
        viewBox={`0 0 ${CHART.width + 70} ${CHART.height + 40}`}
        className="series-chart"
        role="img"
        aria-label={`${stream.name}: ${history.points.length} observation(s) from ${displayInstant(
          history.points[0].simTime,
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
          {displayInstant(history.points[0].simTime)}
        </text>
        <text x={CHART.width + 60} y={CHART.height + 32} textAnchor="end" className="series-tick">
          {displayInstant(history.points[history.points.length - 1].simTime)}
        </text>
      </svg>
      <p className="panel-footnote" data-testid="chart-summary">
        {history.points.length} observation(s) of {history.count} the store reports, in{' '}
        {stream.unit.symbol}, against simulation time.
        {history.truncated && ' The history was long enough to reach this tab’s paging ceiling, so what is drawn is the earliest part of it.'}
      </p>
    </div>
  );
}

/**
 * The same history, read rather than looked at.
 *
 * A chart answers "what has this instrument been doing"; a table answers "what exactly
 * did it say at 04:15", and the second question is the one a reader checking a residual
 * or quoting a figure is actually asking. The value is shown at the precision the store
 * served it at, not rounded to what the axis needed — rounding is a chart's compromise
 * with 640 pixels and has no business in the column that exists to be quoted.
 */
function Table({
  stream,
  history,
}: {
  readonly stream: Datastream;
  readonly history: ObservationHistory;
}) {
  const ordered = observationRows(history.points);
  const rows = visibleRows(ordered);
  return (
    <div data-testid="datastream-table" data-datastream-table={stream.id}>
      {/* `.table-scroll` is the shell's declared sideways scroller: a table is the one
          thing that will not fold, so it scrolls inside its own container and the page
          does not (feature 112, SC-001). The vertical cap beside it keeps the platform
          buttons within reach of the table rather than five hundred rows above it. */}
      <div className="table-scroll data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Simulation time</th>
              <th scope="col">Value ({stream.unit.symbol})</th>
              <th scope="col">Observation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.point.id} data-observation={row.point.id}>
                <td>
                  {row.at === undefined ? (
                    <span className="table-unreadable">
                      {row.point.simTime} — not a readable instant
                    </span>
                  ) : (
                    displayInstant(row.point.simTime)
                  )}
                </td>
                <td className="table-value">{row.point.result}</td>
                <td className="table-id">{row.point.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="panel-footnote" data-testid="table-summary">
        {tableSummary(rows.length, ordered.length, history.count, history.truncated)}
      </p>
    </div>
  );
}
