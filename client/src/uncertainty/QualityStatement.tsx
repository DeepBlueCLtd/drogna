/**
 * Forecast skill, said in words, with the arithmetic beside it.
 *
 * Constitution IX and SRD FR-38: a score is published with the numbers behind it so a
 * reader can recompute it rather than believe it. FR-023 makes this display's half of
 * that explicit — where telemetry reports the model is not beating its persistence
 * reference, this says so in plain words, with the sample count and both mean-square
 * errors. A skill score of −0.2 rendered as a number is a fact nobody reads; "the model
 * is doing worse than assuming nothing changes" is the same fact, read.
 *
 * The sentence itself comes from the message. Telemetry emits `statement` precisely so
 * that every consumer says the same thing about a model that is not earning its compute,
 * and a second sentence assembled here would be a second opinion about the same figures.
 * What this component adds is the evidence beside it, and the staleness treatment.
 *
 * Staleness is rendered as staleness, with the simulation time of the last real update —
 * never as a current value. A stale figure shown as current is the most confident kind of
 * wrong a display can be.
 */
import type { ForecastSkill } from "../generated/messages/telemetry";

export interface QualityStatementProps {
  /** The most recent forecast-skill report received, or null before any arrived. */
  readonly skill: ForecastSkill | null;
}

const STATE_MARKS: Readonly<Record<ForecastSkill["state"], string>> = {
  "beating-persistence": "✓",
  "not-beating-persistence": "✗",
  "insufficient-samples": "?",
  "insufficient-reference": "?",
  // The degenerate case: the reference reproduced every measurement exactly, so the
  // formula's denominator is zero and there is no score. Marked as no score rather than
  // as a failure, because it is neither.
  "reference-without-error": "?",
  "no-forecast": "○",
};

function figure(value: number | null): string {
  return value === null ? "not reported" : String(value);
}

export function QualityStatement({ skill }: QualityStatementProps): JSX.Element {
  if (skill === null) {
    return (
      <section className="panel quality" data-testid="quality-statement" data-skill-state="unheard">
        <h2>Forecast quality</h2>
        <p>
          No skill report has arrived. The page does not know whether the forecast is
          beating a persistence reference, and does not guess.
        </p>
      </section>
    );
  }
  const stale = skill.freshness === "stale";
  return (
    <section
      className={`panel quality ${stale ? "stale" : "fresh"}`}
      data-testid="quality-statement"
      data-skill-state={skill.state}
      data-freshness={skill.freshness}
    >
      <h2>Forecast quality</h2>
      <p className="skill-statement" data-testid="skill-statement">
        <span aria-hidden="true">{STATE_MARKS[skill.state]} </span>
        {skill.statement}
      </p>
      {stale ? (
        <p className="skill-stale" data-testid="skill-stale">
          Stale. This figure was last updated at simulation time{" "}
          {skill.last_updated_sim_time ?? "an instant telemetry did not report"}, and is shown as it
          stood then. It is not a current value.
        </p>
      ) : null}
      <dl className="skill-evidence" data-testid="skill-evidence">
        <dt>Measurements scored</dt>
        <dd data-testid="skill-sample-count">
          {skill.sample_count} (telemetry publishes no score below {skill.minimum_sample_count})
        </dd>
        <dt>Model mean-square error</dt>
        <dd data-testid="skill-model-error">{figure(skill.model_mean_square_error)}</dd>
        <dt>Persistence mean-square error</dt>
        <dd data-testid="skill-persistence-error">{figure(skill.persistence_mean_square_error)}</dd>
        <dt>Skill score</dt>
        <dd data-testid="skill-score">{figure(skill.skill_score)}</dd>
        <dt>From</dt>
        <dd data-testid="skill-formula">{skill.formula}</dd>
      </dl>
      {skill.reference_changed ? (
        <p className="skill-reference-changed" data-testid="skill-reference-changed">
          The reference moved with the latest publication, so this is the first score against
          run {skill.reference_run_id ?? "an unnamed reference"}.
        </p>
      ) : null}
    </section>
  );
}
