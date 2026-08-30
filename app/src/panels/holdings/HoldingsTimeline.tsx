/**
 * The coverage store's timeline (feature 115, FR-69).
 *
 * Not a list in arrival order: a picture of the store *filling up*. Each holding is drawn
 * at the interval its own manifest says it covers, on a lane for its era — the archive as
 * a long band twenty years wide, the now-cast advancing on its cadence, instances as bars
 * spanning the validity they reach into.
 *
 * **This replaces the inventory table**, the one place in feature 115 where a table goes
 * rather than being kept beside a new display or deleted with its tab. Nothing stands
 * behind it to be a keyboard and screen-reader surface, so it is one: every holding is a
 * `<button>` in publication order, carrying an accessible name that announces everything
 * `coverage-holding.schema.json` declares about it (`announce.ts`). The check that says
 * so was written before this file existed, and the licence to remove the table was
 * conditional on it passing (`parity.test.ts`).
 *
 * The axis carries twenty years and six hours at once (`scale.ts`), and the panel states
 * which mapping it is using rather than letting a reader infer it from tick spacing.
 */
import type { CoverageHolding } from '../../generated/types.js';
import { schemaDocuments } from '../../generated/schema-documents.js';
import { announcementLabel } from './announce.js';
import { coverageInterval, type CoverageInterval } from './interval.js';
import { timeScaleFor } from './scale.js';

/**
 * The lanes, read from the `coverage-holding` master rather than typed here.
 *
 * This list used to be three literals, and it was already wrong when feature 118 found
 * it: feature 116 added the `analysis` era and this line did not follow, so an analysis
 * holding was drawn on no lane at all. The parity check did not catch it because the
 * fixtures it runs against hold no analysis — a store has none until a cycle turns —
 * which is precisely the case a hand-maintained list survives and a derived one cannot.
 * A new era now arrives on the timeline by being added to the master, which is the only
 * place it was ever declared.
 */
export const ERAS = ((schemaDocuments['coverage-holding'] as { properties: { era: { enum: string[] } } }).properties.era
  .enum) as readonly string[];

export const ERA_CAPTION: Record<string, string> = {
  archive: 'the historic archive, authored at provisioning',
  departure: 'the brief the vessel sailed with: persistence from the origin, never refreshed',
  nowcast: 'the now-cast, replaced on its cadence',
  analysis: 'the analysis an assimilation cycle published, with its error and provenance',
  instance: 'forecast instances, one per run the loop turned',
};

export function HoldingsTimeline({
  holdings,
  selected,
  onSelect,
}: {
  readonly holdings: readonly CoverageHolding[];
  readonly selected?: string;
  readonly onSelect: (holdingId: string) => void;
}) {
  const placed: { holding: CoverageHolding; interval: CoverageInterval | undefined }[] =
    holdings.map((holding) => ({
      holding,
      interval: coverageInterval(holding.manifest.grid.time),
    }));
  const scale = timeScaleFor(
    placed.flatMap((entry) => (entry.interval ? [entry.interval] : [])),
  );
  // Publication order is the keyboard order (SC-03): a reader tabbing through the
  // timeline walks the store's history in the order it happened.
  const inPublicationOrder = [...placed].sort(
    (a, b) => a.holding.published_at.tick - b.holding.published_at.tick,
  );
  const unplaceable = placed.filter((entry) => entry.interval === undefined);

  return (
    <section className="holdings-timeline" data-testid="holdings-timeline" aria-label="the coverage store in simulation time">
      {scale === undefined ? (
        <p className="panel-footnote" data-testid="timeline-empty">
          {holdings.length === 0
            ? 'the store has announced no holdings yet — the timeline grows when it announces one on its declared topic, and never polls'
            : 'no holding states a time axis that can be read, so no interval is drawn: an axis over intervals nobody stated would be an invention'}
        </p>
      ) : (
        <>
          <div className="timeline-lanes">
            {ERAS.map((era) => (
              <div className="timeline-row" key={era}>
                <span className="timeline-lane-name" title={ERA_CAPTION[era]}>
                  {era}
                </span>
                {(() => {
                  // A run publishes its forecast and its uncertainty field over exactly
                  // the same interval, so two bars land on the same pixels and the second
                  // hides the first entirely — watched happening in the first capture of
                  // this display, where four holdings drew as three. Overlapping bars are
                  // therefore stacked into tracks within the lane.
                  const bars = inPublicationOrder.filter(
                    (entry) => entry.holding.era === era && entry.interval,
                  );
                  const tracks = trackFor(bars.map((entry) => entry.interval as CoverageInterval));
                  const depth = Math.max(1, ...tracks.map((track) => track + 1));
                  return (
                    <span
                      className="timeline-lane"
                      data-era-lane={era}
                      data-tracks={depth}
                      style={{ height: `${4 + depth * 20}px` }}
                    >
                      {bars.map(({ holding, interval }, index) => (
                        <Bar
                          key={holding.holding_id}
                          holding={holding}
                          interval={interval as CoverageInterval}
                          place={scale.place}
                          track={tracks[index]}
                          selected={holding.holding_id === selected}
                          onSelect={onSelect}
                        />
                      ))}
                    </span>
                  );
                })()}
              </div>
            ))}
            <span className="timeline-axis" data-testid="timeline-axis">
              {scale.ticks.map((tick) => (
                <i key={tick.instant} style={{ left: `${tick.place * 100}%` }}>
                  {axisLabel(tick.instant)}
                </i>
              ))}
            </span>
          </div>
          <p className="panel-footnote" data-testid="timeline-scale">
            {/* The scale is stated, never inferred from tick spacing (FR-69). */}
            Scale: {scale.description}.
          </p>
        </>
      )}
      {unplaceable.length > 0 && (
        <p className="shell-refusal" data-testid="timeline-unplaced">
          {unplaceable.length} holding(s) state a time axis this display could not read and
          are not drawn on the axis:{' '}
          {unplaceable.map((entry) => entry.holding.holding_id).join(', ')}. They are still
          selectable below — a holding left out of the picture with nothing said would be
          the display hiding what it could not draw.
        </p>
      )}
      {unplaceable.length > 0 && (
        <ul className="timeline-unplaced-list">
          {unplaceable.map(({ holding }) => (
            <li key={holding.holding_id}>
              <button
                type="button"
                aria-label={announcementLabel(holding)}
                aria-pressed={holding.holding_id === selected}
                data-holding={holding.holding_id}
                onClick={() => onSelect(holding.holding_id)}
              >
                {holding.holding_id}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * An axis label. Deliberately shorter than the wire instant and shorter than
 * `displayInstant`: four full ISO instants across a 600-pixel axis print over each other,
 * which the first capture of this display showed at a glance. The date and the minute are
 * what a reader is placing a bar by; the seconds are noise on an axis that spans years.
 */
function axisLabel(instant: string): string {
  return `${instant.slice(0, 10)} ${instant.slice(11, 16)}`;
}

/**
 * One holding, drawn at the interval it covers. A bar narrower than a hairline is still
 * given a hairline's width: a holding drawn as nothing is a holding a reader cannot see
 * or click, and the axis's job is to place it, not to decide whether it is worth drawing.
 */
function Bar({
  holding,
  interval,
  place,
  track,
  selected,
  onSelect,
}: {
  holding: CoverageHolding;
  interval: CoverageInterval;
  place: (millis: number) => number;
  /** Which row within the lane, so two holdings over one interval are both visible. */
  track: number;
  selected: boolean;
  onSelect: (holdingId: string) => void;
}) {
  const left = place(interval.startMillis) * 100;
  const right = place(interval.endMillis) * 100;
  const width = Math.max(right - left, 0.8);
  return (
    <button
      type="button"
      className={selected ? 'timeline-bar timeline-bar-selected' : 'timeline-bar'}
      style={{ left: `${left}%`, width: `${width}%`, top: `${2 + track * 20}px` }}
      data-holding={holding.holding_id}
      data-era={holding.era}
      aria-pressed={selected}
      aria-label={announcementLabel(holding)}
      onClick={() => onSelect(holding.holding_id)}
    >
      {/* The label only where it fits. A forty-five-minute instance against a twenty-year
          archive is a bar under two per cent of the width, and a truncated identifier
          reading "loite" is worse than none — watched happening in the first capture of
          this display. The accessible name is unaffected: it is on the button, and it
          announces everything the master declares whatever the bar's width. */}
      {width >= 6 && <span aria-hidden="true">{holding.holding_id}</span>}
    </button>
  );
}

/**
 * Which row within its lane each bar takes: the first row that nothing already in it
 * overlaps. Greedy, and in the order the bars are drawn, so the arrangement is stable
 * between renders — a bar that hopped rows as the store grew would be a bar a reader was
 * still looking for.
 */
function trackFor(intervals: readonly CoverageInterval[]): number[] {
  const rows: { start: number; end: number }[][] = [];
  return intervals.map((interval) => {
    const index = rows.findIndex((row) =>
      row.every((taken) => interval.startMillis > taken.end || interval.endMillis < taken.start),
    );
    const chosen = index >= 0 ? index : rows.length;
    (rows[chosen] ??= []).push({ start: interval.startMillis, end: interval.endMillis });
    return chosen;
  });
}
