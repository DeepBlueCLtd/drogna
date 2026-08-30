/**
 * A coverage branch of the Data tab (feature 120, FR-10 to FR-14) — the Holdings tab as
 * it was, absorbed.
 *
 * Everything FR-46, FR-69 and FR-70 required of Holdings is carried here unchanged: the
 * inventory is presented as a timeline in simulation time with each holding drawn at the
 * interval its own manifest says it covers; selecting one opens its **embedded manifest
 * whole**; a forecast instance whose validity has elapsed offers the derived comparison
 * against the truth published for the same instant, with telemetry's own skill figure
 * beside it and not recomputed.
 *
 * The comparison keeps its three request URLs on screen, and it is the one place in this
 * tab that shows a URL at all. That is not an oversight in a rendered-only tab: ADR-0036
 * is right that a *derived* figure a reader cannot re-derive is an assertion, and the
 * comparison is the only figure here the shell computes rather than fetches. The rest of
 * the tab shows what the stores answered, which the stores can be asked for again.
 *
 * What is new is the volume (FR-13): the three spatial axes the Map's cube already
 * draws, with the holding's own declared time steps as a fourth.
 */
import type { CoverageHolding, TelemetryReport } from '../../generated/types.js';
import type { SeamValidator } from '../../seam/validate.js';
import { displayInstant } from '../../shell/display.js';
import { HoldingsTimeline } from './HoldingsTimeline.js';
import { Comparison } from './Comparison.js';
import { Volume } from './lazy.js';
import { announceHolding } from './announce.js';
import { analysisCycles, analysisFieldLabel, type Branch } from './tree.js';

export function CoverageBranch({
  branch,
  holdings,
  allHoldings,
  selected,
  onSelect,
  nowSimTime,
  telemetry,
  edrPrefix,
  validator,
  narrow,
  missing,
}: {
  readonly branch: Branch;
  /** The holdings of this branch's era. */
  readonly holdings: readonly CoverageHolding[];
  /** Every holding the store reports — the comparison needs the now-cast beside it. */
  readonly allHoldings: readonly CoverageHolding[];
  readonly selected?: string;
  readonly onSelect: (holdingId: string | undefined) => void;
  readonly nowSimTime?: string;
  readonly telemetry?: TelemetryReport;
  readonly edrPrefix: string;
  readonly validator: SeamValidator;
  readonly narrow: boolean;
  /** A node the address asked for that this branch does not hold (FR-03). */
  readonly missing?: string;
}) {
  const chosen = holdings.find((holding) => holding.holding_id === selected);
  const covered = narrow && chosen !== undefined;

  return (
    <div className="data-branch">
      <div className="data-branch-head">
        <h3>{branch.label}</h3>
        <p className="panel-footnote">{branch.caption}</p>
        {missing !== undefined && (
          <p className="shell-refusal" data-testid="node-missing">
            the address asked for “{missing}”, which this branch does not hold — the store may
            have replaced it since the link was written
          </p>
        )}
      </div>

      {holdings.length === 0 ? (
        // Not an empty timeline: an empty display is a claim, and the claim worth making
        // here is the specific one (FR-06, Constitution VII).
        <p className="panel-footnote" data-testid="branch-empty">
          the coverage store holds nothing in this era yet
          {branch.era === 'analysis' && ' — an assimilation cycle publishes the first one'}
          {branch.era === 'instance' && ' — the first forecast run publishes the first one'}
        </p>
      ) : (
        <div className="data-primary" data-region="timeline">
          <HoldingsTimeline holdings={holdings} selected={selected} onSelect={onSelect} />
        </div>
      )}

      {branch.era === 'analysis' && holdings.length > 0 && (
        // FR-11: a cycle published its three fields together, and they are presented
        // together. Naming them by era alone would collapse three fields onto one node.
        <div className="analysis-cycles" data-testid="analysis-cycles">
          {analysisCycles(holdings).map((cycle) => (
            <section key={cycle.id} className="analysis-cycle" data-cycle={cycle.id}>
              <h4>{cycle.id}</h4>
              <ul>
                {cycle.holdings.map((holding) => (
                  <li key={holding.holding_id}>
                    <button
                      type="button"
                      data-cycle-field={holding.holding_id}
                      aria-pressed={holding.holding_id === selected}
                      onClick={() => onSelect(holding.holding_id)}
                    >
                      {analysisFieldLabel(holding.holding_id)}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="data-detail">
        <div className="message-detail" data-covering={covered}>
          {chosen ? (
            <>
              {narrow && (
                <button type="button" className="message-back" onClick={() => onSelect(undefined)}>
                  ← back to the timeline
                </button>
              )}
              <div data-region="comparison">
                <Comparison
                  instance={chosen}
                  holdings={allHoldings}
                  nowSimTime={nowSimTime}
                  edrPrefix={edrPrefix}
                  validator={validator}
                  telemetry={telemetry}
                />
              </div>
              <div data-region="volume">
                <Volume holding={chosen} edrPrefix={edrPrefix} validator={validator} />
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
            holdings.length > 0 && (
              <p className="panel-footnote">
                select a holding — a bar in the timeline — to open its manifest and its
                volume, and, where it is a forecast instance whose validity has elapsed, to
                ask how it fared
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}
