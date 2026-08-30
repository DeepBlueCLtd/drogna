/**
 * The Holdings tab (FR-46, extended by feature 115's FR-69 and FR-70): what the coverage
 * store holds, fetched through the seam and the release gate as a genuine GET against the
 * configured relative path. Refreshed when the store announces a publication on its
 * declared topic; nothing polls.
 *
 * Feature 115 replaces the inventory table with **the store's timeline** — the one place
 * in that feature where a table goes rather than being kept beside a new display or
 * deleted with its tab. The reason is that the two things a table cannot show are the two
 * things worth seeing here: accumulation over time, and whether the forecast was any good.
 * A table of five columns showed a four-dimensional synthetic ocean as twelve characters
 * of a SHA-256.
 *
 * The licence to remove the table was conditional, and the condition was a check written
 * *before* the display: every property `coverage-holding.schema.json` declares is either
 * announced by the timeline or exempted with a reason, and every holding is reachable by
 * keyboard in publication order (`parity.test.ts`, `announce.ts`). Nothing stands behind
 * the timeline to be the keyboard and screen-reader surface, so the timeline is one.
 *
 * Selecting a holding still opens its embedded manifest whole (FR-46) — the ground truth
 * AT-01 and AT-03 score against, never summarised — and, for a forecast instance whose
 * validity has elapsed, offers the derived comparison of FR-70.
 *
 * Narrow (feature 112, FR-010, FR-016): the timeline is the primary surface and keeps all
 * three era lanes at every width; the manifest and the comparison are shown over it with
 * a control that goes back, rather than in a 130px column beside it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelProps } from '../../shell/registry.js';
import { useIsNarrow } from '../../shell/viewport.js';
import type {
  Clock,
  CoverageHolding,
  HoldingsInventory,
  TelemetryReport,
} from '../../generated/types.js';
import { displayInstant } from '../../shell/display.js';
import { HelpButton } from '../../shell/walkthrough/HelpButton.js';
import { holdingsTour } from '../../shell/walkthrough/tour.js';
import { HoldingsTimeline } from './HoldingsTimeline.js';
import { Comparison } from './Comparison.js';
import { announceHolding } from './announce.js';
import './holdings.css';

/**
 * The regions this panel declares, and the authority its tour is held to (FR-75). The
 * bound is this list rather than a number typed into a test, so a region added here with
 * no step is named by the check (CLAUDE.md, lesson 2).
 */
export const HOLDINGS_REGIONS = [
  { id: 'timeline', label: 'the timeline', element: '[data-region="timeline"]' },
  { id: 'manifest', label: 'the ground-truth manifest', element: '[data-region="manifest"]' },
  { id: 'comparison', label: 'forecast against truth', element: '[data-region="comparison"]' },
] as const;

export function HoldingsPanel({ params }: PanelProps) {
  const { config, client, validator } = params;
  const [holdings, setHoldings] = useState<readonly CoverageHolding[]>([]);
  const [refusal, setRefusal] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | undefined>();
  const [nowSimTime, setNowSimTime] = useState<string | undefined>();
  const [telemetry, setTelemetry] = useState<TelemetryReport | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useIsNarrow(rootRef);

  const refresh = useCallback(async () => {
    const response = await fetch(config.endpoints.holdings);
    if (!response.ok) {
      setRefusal(`the inventory answered ${response.status}`);
      return;
    }
    const body = (await response.json()) as unknown;
    const verdict = validator.validate('holdings-inventory', body);
    if (!verdict.ok) {
      setRefusal(`inventory refused by its master: ${verdict.refusals[0]}`);
      return;
    }
    setRefusal(undefined);
    setHoldings((body as HoldingsInventory).holdings);
  }, [config.endpoints.holdings, validator]);

  /**
   * Telemetry's own report, shown beside the comparison and never recomputed (FR-70).
   * Fetched on the same announcement the inventory is: a run publishing is the event
   * after which both have something new to say.
   */
  const refreshTelemetry = useCallback(async () => {
    const response = await fetch(config.endpoints.telemetry);
    if (!response.ok) return;
    const body = (await response.json()) as unknown;
    if (validator.validate('telemetry-report', body).ok) setTelemetry(body as TelemetryReport);
  }, [config.endpoints.telemetry, validator]);

  useEffect(() => {
    void refresh();
    void refreshTelemetry();
    return client.subscribe(config.topics.holdings, () => {
      void refresh();
      void refreshTelemetry();
    });
  }, [client, config.topics.holdings, refresh, refreshTelemetry]);

  // Whether an instance's validity has elapsed is a question about simulation time, and
  // the clock component is the only thing that answers it. No host clock takes part.
  useEffect(() => {
    return client.subscribe(config.topics.clock, (message) => {
      setNowSimTime((message.payload as Clock).sim_time);
    });
  }, [client, config.topics.clock]);

  const chosen = holdings.find((holding) => holding.holding_id === selected);
  const covered = narrow && chosen !== undefined;

  return (
    <div className="panel holdings-panel" ref={rootRef} data-narrow={narrow}>
      <div className="panel-head">
        <p className="messages-counters" data-testid="holdings-count">
          {holdings.length} holding(s) in the coverage store
          {refusal && <span className="shell-refusal"> · {refusal}</span>}
        </p>
        <HelpButton tour={holdingsTour()} />
      </div>

      {/* The timeline takes the whole width and the detail sits beneath it, rather than
          the two sharing a row as the table and the manifest did. An axis carrying twenty
          years is an axis that wants the width — squeezed into half of it the instances
          were a few pixels wide, which the first capture of this display showed. */}
      <div className="holdings-primary" data-region="timeline">
        {/* Where the inventory is refused or fails its master the panel states the
            refusal and draws nothing: an empty timeline is a claim the shell is not
            entitled to make (FR-46, Constitution VII). */}
        {refusal === undefined && (
          <HoldingsTimeline holdings={holdings} selected={selected} onSelect={setSelected} />
        )}
      </div>

      <div className="holdings-detail">
        <div className="message-detail" data-covering={covered}>
          {chosen ? (
            <>
              {narrow && (
                <button type="button" className="message-back" onClick={() => setSelected(undefined)}>
                  ← back to the timeline
                </button>
              )}
              <div data-region="comparison">
                <Comparison
                  instance={chosen}
                  holdings={holdings}
                  nowSimTime={nowSimTime}
                  edrPrefix={config.endpoints.edr}
                  validator={validator}
                  telemetry={telemetry}
                />
              </div>
              <div data-region="manifest">
                <h3>{chosen.holding_id} — ground-truth manifest</h3>
                {/* What the timeline announced about this holding, written out: the
                    accessible name a screen reader hears is not a thing a sighted reader
                    can see, and both are owed the same facts. */}
                <dl className="holding-facts" data-testid="holding-facts">
                  {announceHolding(chosen).map((entry) => (
                    <div key={entry.property} data-announced={entry.property}>
                      <dt>{entry.label}</dt>
                      <dd>{entry.text}</dd>
                    </div>
                  ))}
                </dl>
                <p className="panel-footnote">
                  Published {displayInstant(chosen.published_at.sim_time)}. The manifest
                  below is sufficient on its own: with the generator version it names, the
                  field can be reconstructed at any point without the stored bytes.
                </p>
                <pre data-testid="manifest-json">{JSON.stringify(chosen.manifest, null, 2)}</pre>
              </div>
            </>
          ) : (
            <p className="panel-footnote">
              select a holding — a bar in the timeline — to open its manifest, and, where it
              is a forecast instance whose validity has elapsed, to ask how it fared
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
