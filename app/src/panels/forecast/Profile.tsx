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
 * and that is what the *figures* say: the sum is printed rather than normalised away, and where
 * it is not one the reader is looking at a served document that disagrees with itself.
 *
 * The *bar* is a second thing and the region says so. A drawn stack has to fit its box, so each
 * band's width is its share of the level's total magnitude — and where a band runs negative,
 * which is ordinary once the gain extrapolates, magnitudes sum past one and a band fills less of
 * the bar than the same figure would at a level where everything is positive. Widths compare
 * within a level, figures compare between them, and claiming the bar itself was unnormalised —
 * which an earlier draft of this comment did — was the picture flattering the arithmetic.
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
import { levelAtDepth, modelledRaysIn, paletteSlots, sourceLabels, type Ray, type RaySet } from './rays.js';
import { BACKGROUND_SOURCES, MEASUREMENT, instrumentAt, paletteExhausted, type SourceKey } from './shares.js';

export interface ProfileLevel {
  readonly depthM: number;
  readonly shares: Readonly<Record<SourceKey, number>>;
  /** True where the query for this depth was refused, so the row is a place-holder. */
  readonly refused?: boolean;
}

export interface ProfileProps {
  readonly longitude: number;
  readonly latitude: number;
  readonly levels: readonly ProfileLevel[];
  /**
   * The served contributions column; `'refused'` where the query was answered with a refusal,
   * and nothing where it has not arrived. Three facts, not two (FR-129).
   */
  readonly contributions: AnalysisContributions | 'refused' | undefined;
  /**
   * The ray set the map drew, passed in rather than derived again here. Two derivations of one
   * thing from the same two inputs agree only by inspection, and nothing asserted that the
   * widths on the map and the rows in the table below described the same rays.
   *
   * FR-125's named condition is read *off this set*, below, for the same reason. It used to
   * arrive as a second prop — `backgroundDrawn`, the datastream ids of `modelledRaysIn(rays)`
   * — computed in the parent and handed over beside the set it was computed from, which is the
   * duplication this docstring argues against, one line above where it does it.
   */
  readonly rays: RaySet | undefined;
  /**
   * Whether the map above is drawn. Only the sentence that says "the rays above" depends on it:
   * the table, the caption and FR-125's notice are the served document's own arithmetic and are
   * shown whether or not the field behind the rays could be fetched.
   */
  readonly mapped: boolean;
  /**
   * The depth in **metres** whose contributions the rays are weighted to, or nothing for the
   * whole column.
   *
   * Metres and never an index, and `onSelectLevel` below is named for it. It was `depthIndex`,
   * against a docstring that said the opposite and a caller that has always passed metres: a
   * caller written to the signature would have asked for level 1 and been given the level
   * nearest one metre, which is 0 m — the rays re-weighted to the surface, no row showing as
   * pressed, and a caption reading "re-weighted to 1 m". That is the fault T022l fixed in the
   * region, left standing in the type.
   *
   * This block was itself detached from the field it argues about when `mapped` was added above
   * it, so the warning sat over a boolean and `selectedLevel` had none — a correction that
   * survived as prose and was reattached to the wrong thing.
   */
  readonly selectedLevel: number | undefined;
  readonly onSelectLevel: (depthM: number | undefined) => void;
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
  labels: readonly string[],
  slots: ReturnType<typeof paletteSlots>,
): Band[] {
  // A refused depth has no reading at all, so it has no bands: the row states the refusal
  // rather than drawing a bar out of four unknowns.
  if (level.refused) return [];
  const bands: Band[] = [];
  // Over the entries themselves rather than over a list of keys that then has to be looked back
  // up in `SOURCES`: the lookup could not miss — every `SourceKey` is in `SOURCES` by
  // construction — so its `continue` was a branch no state selected, and the two lists had to be
  // kept in step by hand.
  for (const source of BACKGROUND_SOURCES) {
    bands.push({
      key: source.key,
      label: source.label,
      value: level.shares[source.key],
      hue: source.hue,
      // **The share's own hatch, which these bands did not carry.** `shares.ts` says "a profile
      // band carries its hatch angle" and `greyscale.test.ts` rests its cross-vocabulary check on
      // it, but only `kind: 'source'` bands were given an angle: the three background bands and
      // the earlier-cycles band were flat fills. Measured with the shell's own `contrast`, they
      // come to 1.067 (archive/departure), 1.185 (archive/model) and 1.265 (departure/model) —
      // one grey three times, in adjacent segments of one bar, which is exactly the defect that
      // cost the first instrument palette a rewrite. The angles exist on `SOURCES`; they were
      // reaching the map and not the profile.
      hatchAngle: source.angle,
      kind: 'background',
    });
  }

  // Matched on the depth the row is labelled with, never on its position in the list: the two
  // documents are filed on different axes and an index silently paired one depth's background
  // with another depth's contributions.
  const served = document ? levelAtDepth(document, level.depthM) : undefined;
  const omega = served?.observation_weight ?? 0;
  bands.push({
    key: 'earlier',
    // Named for what is actually known. With this cycle's ω in hand the band is the *earlier*
    // cycles' measurement; without it — no document, or a refusal — ω is nought and the band is
    // the whole cumulative share, which is not the same claim and must not wear the same label.
    label: served ? 'measurement, earlier cycles' : 'measurement, all cycles',
    // Cumulative, less this cycle's own addition. Where no document arrived, ω is nought and
    // this band is the whole measurement share — which is the honest reading of "we cannot say
    // how much of it is this cycle's".
    value: level.shares.measurement - omega,
    // From the list, with no fallback: a `?? '#199e70'` here was unreachable and was a second
    // copy of the measurement hue, free to drift from the one in `shares.ts` that every other
    // surface reads.
    hue: MEASUREMENT.hue,
    hatchAngle: MEASUREMENT.angle,
    kind: 'earlier',
  });

  if (served) {
    // **Ordered by source id, like the table five elements below.** These walked
    // `served.contributions` in the level's own array order — first encounter — so the bar's
    // figures ran `·1, ·1, ·2, ·2, ·3, ·3` while the FR-130 table under it, sorted by id, ran
    // `·3, ·2, ·1` for each instrument. Same screen, same six sources, opposite direction, and
    // `rays.ts` opens by arguing that a set ordered by what the holding listed first is stable
    // only by luck. The committed capture shows both orders at once.
    const ordered = [...served.contributions].sort((left, right) =>
      (document?.sources[left.source]?.source_id ?? '').localeCompare(document?.sources[right.source]?.source_id ?? ''),
    );
    for (const entry of ordered) {
      const source = document?.sources[entry.source];
      if (!source) continue;
      const hue = instrumentAt(slots.hue[entry.source] ?? 0).hue;
      const texture = instrumentAt(slots.texture[entry.source] ?? 0);
      bands.push({
        key: source.source_id,
        label: labels[entry.source],
        value: entry.contribution,
        // Labelled so two sources of one instrument are told apart (see `sourceLabels`).
        hue,
        hatchAngle: texture.angle,
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

/** A level's own statement when it carries no source: which of the facts it is. */
export function absenceOf(
  document: AnalysisContributions | 'refused' | undefined,
  depthM: number,
  refusedHere = false,
): string | undefined {
  if (refusedHere) return 'the query for this depth was refused, so this row is a place-holder and not a reading';
  if (document === 'refused') return 'the per-source column was refused, which is a different fact from its not having arrived: the refusal is named beneath';
  if (!document) return 'the contributions for this column have not arrived, so what made this level is not stated';
  const served = levelAtDepth(document, depthM);
  if (!served) return 'the analysis carries no level at this depth, so nothing here is read from it';
  if (!served.reached) {
    return 'no observation was within reach of this level: the correlation reaches exactly zero beyond twice its half-width, so this is a fact rather than a small number';
  }
  if (served.contributions.length === 0) {
    return 'observations reached this level and contributed nothing to it, which is a different fact from nothing having reached it';
  }
  return undefined;
}

export function Profile({
  longitude,
  latitude,
  levels,
  contributions,
  rays,
  mapped,
  selectedLevel,
  onSelectLevel,
}: ProfileProps) {
  const served = typeof contributions === 'object' ? contributions : undefined;
  // FR-125's named condition, read off the drawn set here rather than computed in the parent and
  // handed over beside it.
  const modelledDrawn = rays ? modelledRaysIn(rays).map((ray) => ray.datastreamId) : [];
  const labels = served ? sourceLabels(served.sources) : [];
  // The palette is the instrument's, not the served array's — see `Ray.paletteSlot`. Computed
  // once here and passed down rather than derived per band, so the bar and the swatch beside its
  // row cannot disagree about which colour a source has.
  const slots = paletteSlots(served?.sources ?? []);
  const exhausted = served ? paletteExhausted(served.sources.length) : false;

  return (
    <div className="forecast-column-readout" data-testid="column-profile">
      <p className="forecast-column-where">
        The column at {latitude.toFixed(2)}°N, {longitude.toFixed(2)}°E — every level, and what
        made it. The bands are the analysis’s own arithmetic: the background by where it came
        from, what earlier cycles’ measurements left in it, and this cycle’s contributions source
        by source. The <em>figures</em> sum to one because the gain says they do, and the printed
        sum is that sum rather than a normalisation. The <em>bar</em> is each band’s share of the
        level’s total magnitude, which is a different thing wherever a band runs negative: where
        the gain extrapolates, magnitudes exceed one and a band of a given size fills less of the
        bar than the same band at a level where everything is positive. Bar lengths are
        comparable within a level; the figures are comparable between them.
      </p>

      {/* `mapped` as well as `served`, because this sentence alone is about the map: with the
          area query refused there is a served column and no field to draw on, so it stated what
          "the rays above" showed over an empty space. Everything else below is the document's
          own arithmetic and does not wait on a field. */}
      {/* `!noSuchLevel` too: the sentence claims "the same sources at the same places, at that
          level's widths" about a level the document has not got, over a map drawing every ray at
          width nought, and the caption below then says there is no such level. The guard went on
          one of the two sentences. */}
      {served && rays && mapped && !rays.noSuchLevel && (
        <p className="forecast-column-selected" aria-live="polite">
          {selectedLevel === undefined ? (
            <>
              The rays above are the <strong>whole column</strong>: each source’s contribution
              summed over its levels. Choose a level to re-weight them.
            </>
          ) : (
            <>
              The rays above are re-weighted to <strong>{selectedLevel.toFixed(0)} m</strong>:
              the same sources at the same places, at that level’s widths. Widths are relative
              to the widest ray <em>at the level shown</em>
              {rays.widest > 0 ? ` — ${rays.widest.toFixed(4)} here` : ''}, so a ray is not
              comparable across levels and the figures below are what carry that.{' '}
              <button type="button" className="forecast-chip" onClick={() => onSelectLevel(undefined)}>
                back to the whole column
              </button>
            </>
          )}
        </p>
      )}

      {/* **FR-124, and it used to say FR-125's thing instead.** A modelled source is another
          party's model output *admitted as an observation* — the master's own words — so it
          contributes, it has a position, and the SRD says it is drawn as such. This paragraph
          declared it "the standing forecast's own origins … the baseline these bands sit on"
          while its band was drawn in the stack above and its figure printed in the table below,
          and the map had dropped its ray. The standing forecast is a different thing and is not
          in the source table at all: it never enters as an observation, which is why FR-125 needs
          no filter to keep it out of the rays. */}
      {modelledDrawn.length > 0 && (
        <p className="forecast-column-refused" data-testid="modelled-drawn">
          {modelledDrawn.join(', ')} {modelledDrawn.length === 1 ? 'is' : 'are'}{' '}
          <strong>modelled</strong>: another party’s model output, admitted as an observation and
          weighed by the gain like any other. Drawn and marked as such (FR-124) rather than passed
          off as the vessel’s own sensing. The standing forecast is not among these and never
          appears here — it does not enter as an observation at all, and is the baseline every band
          on this profile sits on.
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
          const bands = bandsFor(level, served, labels, slots);
          const magnitude = bands.reduce((sum, band) => sum + (Number.isFinite(band.value) ? Math.abs(band.value) : 0), 0);
          const total = bands.reduce((sum, band) => sum + (Number.isFinite(band.value) ? band.value : 0), 0);
          // A share the query never served is absent, and absent is not nought (FR-041): it is
          // left out of the bar and named in the figures, rather than drawn as a band of no
          // width that a reader would read as "this contributed nothing".
          const unserved = bands.filter((band) => !Number.isFinite(band.value));
          const absence = absenceOf(contributions, level.depthM, level.refused);
          const selected = selectedLevel === level.depthM;
          return (
            <li key={level.depthM} className={selected ? 'is-selected' : undefined}>
              <button
                type="button"
                className="forecast-column-level"
                aria-pressed={selected}
                data-depth={level.depthM.toFixed(0)}
                onClick={() => onSelectLevel(selected ? undefined : level.depthM)}
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
                        style={{
                          width: `${width}%`,
                          // `backgroundColor`, not the `background` shorthand: the shorthand
                          // writes `background-image: none` into the inline block, which beats
                          // the stylesheet, so the remainder band's stripe — the CSS comment's
                          // own carrier for "the one band that is not a place" — never drew.
                          backgroundColor: band.hue,
                          // **Drawn, not merely computed.** The angle was assigned to every band
                          // and read by nothing, while the palette's own comment claimed the
                          // hatch as the carrier that survives greyscale — which is the whole of
                          // what Q-01 asks about. A source band now carries its instrument's
                          // angle as a stripe over its hue, so six bands differ in direction as
                          // well as in colour.
                          backgroundImage:
                            band.hatchAngle === undefined
                              ? undefined
                              : `repeating-linear-gradient(${band.hatchAngle}deg, rgba(0,0,0,0.55) 0 2px, transparent 2px 5px)`,
                        }}
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
              {!level.refused && (
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
              )}
            </li>
          );
        })}
      </ol>

      {/* FR-130: the two numbers behind any contribution, stated in the region it is drawn in.
          Under the profile rather than in a tooltip, for the reason the map's readout is: it
          cannot be clipped at a phone's width, and a screen reader meets it in document order. */}
      {/* **Gated on the served column, not on the ray geometry.** These were `{rays && …}`, and
          `rays` is undefined whenever the *slab* is — so a reader who changed to a depth whose
          area query was refused lost the FR-130 table, the SC-001 caption and the FR-125 notice
          along with the map, silently: the only message on the page named the refused *field*,
          and none of these four surfaces reads the field. They are computed from the contributions
          document, which is still in hand and still drawing the bands one element above. Only the
          rays' geometry needs the slab, and the `raySet`/`rays` split in `ColumnProvenance` is
          what carries the distinction. */}
      {rays && rays.rays.length > 0 && (
        <table className="forecast-column-numbers" data-testid="contribution-numbers">
          <caption>
            What produced each width{selectedLevel === undefined ? ', over the whole column' : ` at ${selectedLevel.toFixed(0)} m`}. The
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
            {rays.rays.map((ray: Ray) => (
              <tr key={ray.sourceId}>
                <th scope="row">
                  <span
                    className="forecast-share-swatch"
                    style={{ background: instrumentAt(ray.paletteSlot).hue }}
                    aria-hidden="true"
                  />
                  {labels[ray.sourceIndex]}
                  <span className="forecast-column-kind"> ({ray.kind})</span>
                </th>
                <td className={ray.contribution < 0 ? 'is-negative' : undefined}>
                  {ray.reachedHere ? ray.contribution.toFixed(4) : 'not at this level'}
                </td>
                <td>
                  {/* A magnitude, said as one. The kernel stores `Math.abs(down)`, so the
                      document carries no direction — and the 50 m instruments are *above* a
                      200 m level, which the word "down" asserted of all three of them. */}
                  {ray.reachedHere
                    ? `${ray.separationKm.toFixed(1)} km${ray.separationM > 0 ? `, ${ray.separationM.toFixed(0)} m in depth` : ', same level'}`
                    : '—'}
                </td>
                <td>{ray.errorStd}</td>
                <td>{ray.backgroundErrorStd.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* **The caption states a fact about a level, so it does not state one about a level the
          document has not got.** With no level matched every figure sums to nought and this read
          "0 of this column's N sources reached that level, contributing 0.0000 … ω = 0.0000, the
          weight this cycle's observations added" — a positive claim, printed directly under the
          row's own sentence saying the analysis carries no such level. */}
      {rays?.noSuchLevel && (
        <p className="forecast-column-caption">
          The analysis carries no level at{' '}
          <strong>{selectedLevel === undefined ? 'that depth' : `${selectedLevel.toFixed(0)} m`}</strong>, so there is
          nothing here to sum: these are not zero contributions, they are no reading. The depths this cycle is filed at
          are the rows above.
        </p>
      )}
      {rays && !rays.noSuchLevel && (
        <p className="forecast-column-caption">
          {rays.reachedCount} of this column’s {rays.rays.length} source
          {rays.rays.length === 1 ? '' : 's'} reached {selectedLevel === undefined ? 'it' : 'that level'}, contributing{' '}
          {/* Summed over the rays themselves. This printed `ω − remainder`, which is the
              published weight rearranged: it agreed with the drawn set exactly when SC-001's
              identity held, so a surface that had lost a ray would have gone on printing a total
              that included it. Routing it through `contributionResidual` was the first
              correction and was worse — that function adds the remainder and this expression
              subtracted it again, machinery around a sum. */}
          {rays.rays.reduce((total, ray) => total + ray.contribution, 0).toFixed(4)} between them, with{' '}
          {rays.remainder.toFixed(4)} more from observations beyond its reach — coupling the gain
          carries through the inverse, which has no position and so is a band here and never a
          ray. Together they are ω = {rays.observationWeight.toFixed(4)}, the weight this cycle’s
          observations added, and the standing forecast is not among them: it is the background
          these sit on.
        </p>
      )}
    </div>
  );
}
