/**
 * Truth against forecast (feature 115, FR-70, ADR-0036).
 *
 * Three genuine EDR area queries at one instant and one depth — the instance, the
 * now-cast covering that instant, and the persistence reference held constant from the
 * instance's own initial step — differenced here, in the shell, and **labelled as
 * derived**.
 *
 * That labelling is the whole of ADR-0036 made visible. Feature 113 fixed three kinds of
 * figure: declared, reported, observed. This is a fourth, and it is drawn distinctly from
 * all three because the rule that admits it is narrow: *the shell may transform documents
 * that crossed the seam; it may not invent a figure no document contains.* Two things
 * follow, and both are on screen rather than in this comment:
 *
 *   - **The three request URLs are copyable.** They are constitutive of the display, not
 *     a convenience: a derived figure a reader cannot re-derive is an assertion with an
 *     arithmetic-shaped alibi. SC-04 fetches what the panel shows and checks it comes
 *     back.
 *   - **Telemetry's own skill figure sits beside the picture, unrecomputed.** Telemetry
 *     scores skill at the observations over a run's whole validity and publishes it; this
 *     draws a field-wide difference at one instant. Different questions, and the panel
 *     says which is which — a second implementation of skill in the shell would be free
 *     to disagree with the component that owns it.
 *
 * Constitution IX travels with the derivation: there is no path here that draws forecast
 * error alone, because a picture of forecast error alone is a skill claim and the
 * principle admits none without a persistence reference.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CoverageHolding, TelemetryReport } from '../../generated/types.js';
import type { SeamValidator } from '../../seam/validate.js';
import { displayInstant } from '../../shell/display.js';
import type { GridCoverage } from '../map/map-data.js';
import {
  compareFields,
  counterpartFor,
  format,
  isComparison,
  isCounterpart,
  type Comparison as ComparisonFigures,
  type Counterpart,
  type DifferenceField,
} from './compare.js';

/** One query the panel made, kept so the reader can make it again. */
interface AskedQuery {
  readonly role: 'the instance' | 'the truth' | 'persistence';
  readonly url: string;
  readonly note: string;
}

interface Fetched {
  readonly figures?: ComparisonFigures;
  readonly refusal?: string;
  readonly asked: readonly AskedQuery[];
  readonly at?: string;
  readonly depthM?: number;
}

export function Comparison({
  instance,
  holdings,
  nowSimTime,
  edrPrefix,
  validator,
  telemetry,
}: {
  readonly instance: CoverageHolding;
  readonly holdings: readonly CoverageHolding[];
  readonly nowSimTime: string | undefined;
  readonly edrPrefix: string;
  readonly validator: SeamValidator;
  /** Telemetry's own report, shown beside the picture and never recomputed. */
  readonly telemetry: TelemetryReport | undefined;
}) {
  const [depthM, setDepthM] = useState(() => instance.manifest.grid.depth.minimum);
  const [state, setState] = useState<Fetched | undefined>();
  const [asking, setAsking] = useState(false);

  const result = counterpartFor(instance, holdings, nowSimTime);
  // Split rather than narrowed in place: `run` closes over this and TypeScript will not
  // carry a narrowing across the closure, so the two states are two values.
  const counterpart: Counterpart | undefined = isCounterpart(result) ? result : undefined;
  // The variable to difference is the one both manifests declare, chosen by
  // `counterpartFor` from the documents rather than named here (`compare.ts`).
  const parameter = counterpart?.parameter;

  const run = useCallback(async () => {
    if (!counterpart || !parameter) return;
    setAsking(true);
    const grid = instance.manifest.grid;
    const ring = [
      [grid.longitude.minimum, grid.latitude.minimum],
      [grid.longitude.maximum, grid.latitude.minimum],
      [grid.longitude.maximum, grid.latitude.maximum],
      [grid.longitude.minimum, grid.latitude.maximum],
      [grid.longitude.minimum, grid.latitude.minimum],
    ];
    const wkt = `POLYGON((${ring.map(([lon, lat]) => `${lon} ${lat}`).join(', ')}))`;
    const url = (collection: string, datetime: string) =>
      `${edrPrefix}/collections/${collection}/area?${new URLSearchParams({
        coords: wkt,
        z: String(depthM),
        datetime,
        'parameter-name': parameter,
      }).toString()}`;

    // The three, and the reason each is asked. Note the third: the *instance's own*
    // collection at its *first* step. Persistence is not a fourth document somebody
    // publishes — it is the forecast's own starting field, held still, which is exactly
    // what "the model did nothing" would have produced.
    const asked: AskedQuery[] = [
      {
        role: 'the instance',
        url: url(counterpart.instance.holding_id, counterpart.atSimTime),
        note: 'what the forecast said would be there',
      },
      {
        // Now-cast holdings are served under their era by convention (FR-29), which is
        // how the collection id comes to be a word rather than an identifier.
        role: 'the truth',
        url: url('nowcast', counterpart.atSimTime),
        note: `what the now-cast ${counterpart.truth.holding_id} published for the same instant`,
      },
      {
        role: 'persistence',
        url: url(counterpart.instance.holding_id, counterpart.persistenceSimTime),
        note: `the instance's own initial step at ${displayInstant(counterpart.persistenceSimTime)}, held constant — what doing nothing would have said`,
      },
    ];

    const coverages: GridCoverage[] = [];
    for (const query of asked) {
      const response = await fetch(query.url);
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        setState({
          refusal: `${query.role}: ${(body as { refused?: string }).refused ?? `the area query answered ${response.status}`}`,
          asked,
        });
        setAsking(false);
        return;
      }
      const verdict = validator.validate('coveragejson', body);
      if (!verdict.ok) {
        setState({ refusal: `${query.role} was refused by its master: ${verdict.refusals[0]}`, asked });
        setAsking(false);
        return;
      }
      coverages.push(body as GridCoverage);
    }

    const [forecast, truth, persistence] = coverages;
    if (!forecast || !truth || !persistence) {
      setState({ refusal: 'one of the three queries returned nothing to difference', asked });
      setAsking(false);
      return;
    }
    const differenced = compareFields(forecast, truth, persistence, parameter);
    setState(
      isComparison(differenced)
        ? { figures: differenced, asked, at: counterpart.atSimTime, depthM }
        : { refusal: differenced.refusal, asked },
    );
    setAsking(false);
  }, [counterpart, depthM, edrPrefix, instance, parameter, validator]);

  // A change of depth invalidates what is drawn: a picture answering one depth left on
  // screen while the control says another is a picture that has quietly stopped
  // answering the question beside it.
  useEffect(() => {
    setState(undefined);
  }, [depthM, instance.holding_id]);

  if (!counterpart) {
    return (
      <section className="comparison" data-testid="comparison" data-offered="false">
        <h4>Forecast against truth</h4>
        {/* Never nothing: "no comparison is offered" and "no comparison is possible, and
            here is why" are different statements, and a reader is owed the second. */}
        <p className="shell-refusal" data-testid="comparison-refusal">
          {isCounterpart(result) ? 'no counterpart was found' : result.refusal}
        </p>
      </section>
    );
  }

  const depths = axisValues(instance.manifest.grid.depth);
  return (
    <section className="comparison" data-testid="comparison" data-offered="true">
      <h4>Forecast against truth, at {displayInstant(counterpart.atSimTime)}</h4>
      <p className="panel-footnote">
        {counterpart.instance.holding_id}&rsquo;s validity has elapsed, and{' '}
        {counterpart.truth.holding_id} — written by{' '}
        {counterpart.truth.manifest.generator.name}, not by the model runner — covers the
        instant it forecast. Three area queries through the seam, on{' '}
        <b>{counterpart.parameter}</b>, the variable both manifests declare. Differenced
        here, in the shell.
      </p>
      <div className="comparison-controls">
        <label>
          depth{' '}
          <select
            value={depthM}
            data-testid="comparison-depth"
            onChange={(event) => setDepthM(Number(event.target.value))}
          >
            {depths.map((depth) => (
              <option key={depth} value={depth}>
                {depth} m
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void run()} data-testid="comparison-run" disabled={asking}>
          {asking ? 'asking…' : state ? 'ask again' : 'ask the three queries'}
        </button>
      </div>

      {state?.refusal && (
        <p className="shell-refusal" data-testid="comparison-refusal">
          {state.refusal}
        </p>
      )}

      {state?.figures && (
        <>
          <div className="comparison-fields">
            <DifferencePlot
              label="forecast − truth"
              field={state.figures.forecast}
              scale={state.figures.scale}
              testId="difference-forecast"
            />
            <DifferencePlot
              label="persistence − truth"
              field={state.figures.persistence}
              scale={state.figures.scale}
              testId="difference-persistence"
            />
            <div className="comparison-figures">
              <Derived
                label="the instance against the truth"
                value={`${format(state.figures.forecast.rms)}${state.figures.unit ? ` ${state.figures.unit}` : ''} RMS`}
              />
              <Derived
                label="persistence against the truth"
                value={`${format(state.figures.persistence.rms)}${state.figures.unit ? ` ${state.figures.unit}` : ''} RMS`}
              />
              <p
                className={state.figures.forecastIsCloser ? 'comparison-verdict' : 'comparison-verdict comparison-verdict-unflattering'}
                data-testid="comparison-verdict"
              >
                {state.figures.verdict}
              </p>
              <p className="panel-footnote">
                Both fields are drawn on one shared scale, ±{format(state.figures.scale)}
                {state.figures.unit ? ` ${state.figures.unit}` : ''}, so the two are
                comparable by eye rather than each flattering itself.
              </p>
              <TelemetrySkill telemetry={telemetry} />
            </div>
          </div>

          <div className="comparison-urls" data-testid="comparison-urls">
            <p className="panel-footnote">
              The three requests this picture was drawn from. A derived figure a reader
              cannot re-derive is an assertion (ADR-0036).
            </p>
            <ul>
              {state.asked.map((query) => (
                <li key={query.role}>
                  <b>{query.role}</b> — {query.note}
                  <br />
                  <code data-comparison-url={query.role}>{query.url}</code>{' '}
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(query.url)}
                  >
                    copy
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

/** A figure the shell computed from documents that crossed the seam (ADR-0036). */
function Derived({ label, value }: { label: string; value: string }) {
  return (
    <span className="flow-figure flow-figure-derived" data-figure-kind="derived">
      <span className="flow-figure-label">derived</span>
      <span className="flow-figure-value">{value}</span>
      <span className="flow-figure-caption">{label}</span>
    </span>
  );
}

/**
 * Telemetry's own skill figure, beside the picture and never recomputed. The sentence
 * matters as much as the number: these answer different questions, and a reader shown
 * two figures with no statement of the difference will read them as the same one
 * disagreeing with itself.
 */
function TelemetrySkill({ telemetry }: { telemetry: TelemetryReport | undefined }) {
  const skill = telemetry?.skill;
  return (
    <p className="comparison-telemetry" data-testid="comparison-telemetry">
      {skill && skill.skill_score !== null ? (
        <>
          <span className="flow-figure flow-figure-reported" data-figure-kind="reported">
            <span className="flow-figure-label">reported</span>
            <span className="flow-figure-value">skill {format(skill.skill_score)}</span>
          </span>
          {/* The component's own sentence, in its own words — including the unflattering
              one. Paraphrasing it here would be the shell deciding how telemetry's
              finding should sound. */}
          <span className="comparison-telemetry-statement">{skill.statement}</span>
          <span className="panel-footnote">
            Telemetry&rsquo;s figure, scored at the observations over the run&rsquo;s
            whole validity against a persistence reference. It answers a different
            question from the picture above, which is one field-wide difference at one
            instant and one depth — so this panel shows telemetry&rsquo;s number rather
            than computing a second one that would be free to disagree with the component
            that owns it.
          </span>
        </>
      ) : (
        <span className="panel-footnote">
          Telemetry has published no skill figure yet: the loop has not produced enough
          scored samples. Nothing is drawn in its place — a zero here would be a claim
          about a model nobody has scored.
        </span>
      )}
    </p>
  );
}

/**
 * A difference field, drawn as a grid of cells on a diverging ramp about zero. Blue where
 * the field was under the truth, warm where it was over, and the same scale for both
 * plots — which is the point of drawing them side by side at all.
 */
function DifferencePlot({
  label,
  field,
  scale,
  testId,
}: {
  label: string;
  field: DifferenceField;
  scale: number;
  testId: string;
}) {
  const columns = new Set(field.cells.map((cell) => cell.bounds[0])).size;
  return (
    <figure className="difference-plot" data-testid={testId} data-cells={field.cells.length}>
      <figcaption>{label}</figcaption>
      <div
        className="difference-grid"
        style={{ gridTemplateColumns: `repeat(${Math.max(columns, 1)}, 1fr)` }}
        role="img"
        aria-label={`${label}: ${field.cells.length} cells, from ${format(field.minimum)} to ${format(field.maximum)}, root mean square ${format(field.rms)}`}
      >
        {/* Row-major, south to north as the coverage states it — reversed so that north
            is at the top, which is the one convention a map reader has without being
            told. */}
        {[...field.cells]
          .sort((a, b) => b.bounds[1] - a.bounds[1] || a.bounds[0] - b.bounds[0])
          .map((cell) => (
            <span
              key={`${cell.bounds[0]},${cell.bounds[1]}`}
              style={{ background: divergingColour(cell.value, scale) }}
            />
          ))}
      </div>
      <p className="panel-footnote">
        {format(field.minimum)} to {format(field.maximum)}
      </p>
    </figure>
  );
}

/** Blue below, warm above, pale at zero. Legible in greyscale by lightness alone. */
function divergingColour(value: number, scale: number): string {
  const t = Math.max(-1, Math.min(1, value / (scale || 1)));
  return t < 0
    ? `rgb(${Math.round(40 + 170 * (1 + t))},${Math.round(90 + 140 * (1 + t))},${Math.round(180 + 55 * (1 + t))})`
    : `rgb(${Math.round(215 - 5 * t)},${Math.round(220 - 130 * t)},${Math.round(215 - 150 * t)})`;
}

/** The values a manifest axis holds. The same reading `cube.ts` makes of a depth axis. */
function axisValues(axis: { minimum: number; count: number; spacing: number }): number[] {
  const values: number[] = [];
  for (let index = 0; index < axis.count; index++) {
    values.push(Math.round((axis.minimum + index * axis.spacing) * 1000) / 1000);
  }
  return values;
}
