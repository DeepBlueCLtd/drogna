/**
 * The depth profile: what each level of a column was made from, source by source
 * (SRD-v2 FR-127 to FR-130).
 *
 * **The stack is an identity, not an arrangement.** Because H selects a cell, the analysis is
 * exactly xᵃ = (I − KH)xᵇ + Ky, so every level's value is its background scaled by 1 − ω plus
 * each observation's gain — and the analyst's four shares are read off that same line: every
 * prior share is scaled by 1 − ω and ω is credited to measurement. Put together, a level's
 * composition is
 *
 *     archive + departure + model            the background, by where the background came from
 *   + (measurement share − ω)                what earlier cycles' observations left in it
 *   + Σ this cycle's per-source contributions
 *   + remainder                              coupling from beyond this cell's reach
 *   = 1
 *
 * and that is the bar. Nothing is normalised to make it come out; the sum is printed, and where
 * it is not one the reader is looking at a served document that disagrees with itself.
 *
 * The two middle terms are the ones a first draft gets wrong, so they are worth naming. The
 * measurement share is **cumulative** — it carries every cycle's observations, diluted as each
 * forecast ages — while ω is **this cycle's** addition alone. Drawing the per-source
 * contributions as a breakdown of the measurement share would therefore claim that this cycle's
 * casts explain what a cast three cycles ago left behind. They are separate bands, and the
 * earlier one says so in words.
 *
 * **The remainder is a band and never a ray.** It has no position to be drawn from — the
 * support bounds the covariance and not the gain, so it is what observations outside this
 * cell's reach did to it through their coupling with ones inside — and a band can state that
 * where a line cannot.
 *
 * **Absent, null and declined are three facts** (FR-129). A level no source reached says so; a
 * level that was reached and whose contributions summed to nothing says that instead; and a
 * level whose document never arrived says the third thing. None of them is drawn as an empty
 * bar, which would claim the first while meaning any of the three.
 */
import type { AnalysisContributions } from '../../generated/types.js';
import { raysFor, sourceLabels, type Ray } from './rays.js';
import { BACKGROUND_KEYS, SOURCES, instrumentAt, paletteExhausted, type SourceKey } from './shares.js';

export interface ProfileLevel {
  readonly depthM: number;
  readonly shares: Readonly<Record<SourceKey, number>>;
}

export interface ProfileProps {
  readonly longitude: number;
  readonly latitude: number;
  readonly levels: readonly ProfileLevel[];
  /** The served contributions column, or nothing where it has not arrived or was refused. */
  readonly contributions: AnalysisContributions | undefined;
  /** Which level's rays are drawn: a depth index, or nothing for the whole column. */
  readonly selectedLevel: number | undefined;
  readonly onSelectLevel: (depthIndex: number | undefined) => void;
}

/** One drawn band of the stack. */
interface Band {
  readonly key: string;
  readonly label: string;
  readonly value: number;
  readonly hue: string;
  readonly hatchAngle?: number;
  readonly kind: 'background' | 'earlier' | 'source' | 'remainder';
}

function bandsFor(
  level: ProfileLevel,
  document: AnalysisContributions | undefined,
  index: number,
  labels: readonly string[],
): Band[] {
  const bands: Band[] = [];
  for (const key of BACKGROUND_KEYS) {
    const source = SOURCES.find((candidate) => candidate.key === key);
    if (!source) continue;
    bands.push({ key, label: source.label, value: level.shares[key], hue: source.hue, kind: 'background' });
  }

  const measurement = SOURCES.find((candidate) => candidate.key === 'measurement');
  const served = document?.levels.find((candidate) => candidate.depth_index === index);
  const omega = served?.observation_weight ?? 0;
  bands.push({
    key: 'earlier',
    label: 'measurement, earlier cycles',
    // Cumulative, less this cycle's own addition. Where no document arrived, ω is nought and
    // this band is the whole measurement share — which is the honest reading of "we cannot say
    // how much of it is this cycle's".
    value: level.shares.measurement - omega,
    hue: measurement?.hue ?? '#199e70',
    kind: 'earlier',
  });

  if (served) {
    for (const entry of served.contributions) {
      const source = document?.sources[entry.source];
      if (!source) continue;
      const position = document?.sources.indexOf(source) ?? 0;
      const instrument = instrumentAt(position);
      bands.push({
        key: source.source_id,
        label: labels[position] ?? source.datastream_id,
        value: entry.contribution,
        // Labelled so two sources of one instrument are told apart (see `sourceLabels`).
        hue: instrument.hue,
        hatchAngle: instrument.angle,
        kind: 'source',
      });
    }
    bands.push({
      key: 'remainder',
      label: 'beyond this cell’s reach',
      value: served.remainder,
      hue: '#8a949e',
      kind: 'remainder',
    });
  }
  return bands;
}

/** A level's own statement when it carries no source: which of the three facts it is. */
export function absenceOf(document: AnalysisContributions | undefined, index: number): string | undefined {
  if (!document) return 'the contributions for this column have not arrived, so what made this level is not stated';
  const served = document.levels.find((candidate) => candidate.depth_index === index);
  if (!served) return 'the served column carries no entry for this level at all';
  if (!served.reached) {
    return 'no observation was within reach of this level: the correlation reaches exactly zero beyond twice its half-width, so this is a fact rather than a small number';
  }
  if (served.contributions.length === 0) {
    return 'observations reached this level and contributed nothing to it, which is a different fact from nothing having reached it';
  }
  return undefined;
}

export function Profile({ longitude, latitude, levels, contributions, selectedLevel, onSelectLevel }: ProfileProps) {
  const set = contributions ? raysFor(contributions, selectedLevel) : undefined;
  const labels = contributions ? sourceLabels(contributions.sources) : [];
  const exhausted = contributions ? paletteExhausted(contributions.sources.length) : false;

  return (
    <div className="forecast-column-readout" data-testid="column-profile">
      <p className="forecast-column-where">
        The column at {latitude.toFixed(2)}°N, {longitude.toFixed(2)}°E — every level, and what
        made it. The bands are the analysis’s own arithmetic: the background by where it came
        from, what earlier cycles’ measurements left in it, and this cycle’s contributions source
        by source. They sum to one because the gain says they do, not because they were scaled.
      </p>

      {contributions && (
        <p className="forecast-column-selected" aria-live="polite">
          {selectedLevel === undefined ? (
            <>
              The rays above are the <strong>whole column</strong>: each source’s contribution
              summed over its levels. Choose a level to re-weight them.
            </>
          ) : (
            <>
              The rays above are re-weighted to{' '}
              <strong>{levels[selectedLevel]?.depthM.toFixed(0) ?? '—'} m</strong>: the same
              sources at the same places, at that level’s widths.{' '}
              <button type="button" className="forecast-chip" onClick={() => onSelectLevel(undefined)}>
                back to the whole column
              </button>
            </>
          )}
        </p>
      )}

      {exhausted && (
        <p className="forecast-column-refused">
          this column carries more sources than the palette has distinct entries, so two of them
          share a colour and a hatch. The figures beneath each level are what separates them, and
          this notice is here rather than a quiet repetition.
        </p>
      )}

      <ol className="forecast-column-levels">
        {levels.map((level, index) => {
          const bands = bandsFor(level, contributions, index, labels);
          const magnitude = bands.reduce((sum, band) => sum + (Number.isFinite(band.value) ? Math.abs(band.value) : 0), 0);
          const total = bands.reduce((sum, band) => sum + (Number.isFinite(band.value) ? band.value : 0), 0);
          // A share the query never served is absent, and absent is not nought (FR-041): it is
          // left out of the bar and named in the figures, rather than drawn as a band of no
          // width that a reader would read as "this contributed nothing".
          const unserved = bands.filter((band) => !Number.isFinite(band.value));
          const absence = absenceOf(contributions, index);
          const selected = selectedLevel === index;
          return (
            <li key={level.depthM} className={selected ? 'is-selected' : undefined}>
              <button
                type="button"
                className="forecast-column-level"
                aria-pressed={selected}
                data-depth={level.depthM.toFixed(0)}
                onClick={() => onSelectLevel(selected ? undefined : index)}
              >
                <span className="forecast-column-depth">{level.depthM.toFixed(0)} m</span>
                <span className="forecast-column-stack" aria-hidden="true">
                  {bands.map((band) => {
                    if (!Number.isFinite(band.value)) return null;
                    const width = magnitude > 0 ? (Math.abs(band.value) / magnitude) * 100 : 0;
                    if (width <= 0) return null;
                    return (
                      <span
                        key={band.key}
                        className={`forecast-column-segment is-${band.kind}${band.value < 0 ? ' is-negative' : ''}`}
                        style={{ width: `${width}%`, background: band.hue }}
                        data-band={band.key}
                      />
                    );
                  })}
                </span>
              </button>

              {/* The absence note sits *beside* the figures rather than instead of them, and
                  the first draft had it the other way round. What is absent at a level nothing
                  reached is the observational part; the background's own composition is known
                  and printed, and replacing it with a sentence would hide a fact in order to
                  state one. */}
              {absence && (
                <p className="forecast-column-absent" data-testid={`level-absent-${index}`}>
                  {absence}
                </p>
              )}
              <span className="forecast-column-figures">
                  {bands.map((band) => (
                    <span key={band.key} className={band.value < 0 ? 'is-negative' : undefined}>
                      {band.label}{' '}
                      {Number.isFinite(band.value) ? `${(band.value * 100).toFixed(1)}%` : 'not served'}
                    </span>
                  ))}
                  <span className="forecast-column-sum">
                    sums to {(total * 100).toFixed(1)}%
                    {unserved.length > 0 ? ` of what was served; ${unserved.length} share(s) were not` : ''}
                  </span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* FR-130: the two numbers behind any contribution, stated in the region it is drawn in.
          Under the profile rather than in a tooltip, for the reason the map's readout is: it
          cannot be clipped at a phone's width, and a screen reader meets it in document order. */}
      {set && set.rays.length > 0 && (
        <table className="forecast-column-numbers" data-testid="contribution-numbers">
          <caption>
            What produced each width{selectedLevel === undefined ? ', over the whole column' : ` at ${levels[selectedLevel]?.depthM.toFixed(0)} m`}. The
            separation is what the taper was evaluated on, cell centre to cell centre; the two
            errors are what the gain weighed against each other.
          </caption>
          <thead>
            <tr>
              <th scope="col">source</th>
              <th scope="col">contribution</th>
              <th scope="col">separation</th>
              <th scope="col">its error</th>
              <th scope="col">background’s</th>
            </tr>
          </thead>
          <tbody>
            {set.rays.map((ray: Ray, index: number) => (
              <tr key={ray.sourceId}>
                <th scope="row">
                  <span
                    className="forecast-share-swatch"
                    style={{ background: instrumentAt(contributions?.sources.findIndex((s) => s.source_id === ray.sourceId) ?? index).hue }}
                    aria-hidden="true"
                  />
                  {labels[contributions?.sources.findIndex((s) => s.source_id === ray.sourceId) ?? index] ?? ray.datastreamId}
                  <span className="forecast-column-kind"> ({ray.kind})</span>
                </th>
                <td className={ray.contribution < 0 ? 'is-negative' : undefined}>{ray.contribution.toFixed(4)}</td>
                <td>
                  {ray.separationKm.toFixed(1)} km
                  {ray.separationM > 0 ? `, ${ray.separationM.toFixed(0)} m down` : ', same level'}
                </td>
                <td>{ray.errorStd}</td>
                <td>{ray.backgroundErrorStd.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {set && (
        <p className="forecast-column-caption">
          {set.rays.length} source
          {set.rays.length === 1 ? '' : 's'} reached this column, contributing{' '}
          {(set.observationWeight - set.remainder).toFixed(4)} between them, with{' '}
          {set.remainder.toFixed(4)} more from observations beyond its reach — coupling the gain
          carries through the inverse, which has no position and so is a band here and never a
          ray. Together they are ω = {set.observationWeight.toFixed(4)}, the weight this cycle’s
          observations added, and the standing forecast is not among them: it is the background
          these sit on.
        </p>
      )}
    </div>
  );
}
