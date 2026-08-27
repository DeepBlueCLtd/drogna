/**
 * A forecast that is not earning its compute says so, in words, with the arithmetic.
 *
 * FR-023 and Constitution IX. A skill score of −0.35 rendered as a number is a fact
 * nobody reads; the same fact in a sentence is a fact somebody acts on. And the sentence
 * without the sample count and the two mean-square errors beside it is a claim to be
 * believed rather than checked, which is the thing Principle IX exists to prevent.
 *
 * Staleness is the second half and the more dangerous one. A figure that stopped moving
 * an hour of simulated time ago, rendered as though current, is the most confident kind
 * of wrong a display can be.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QualityStatement } from "../../src/uncertainty/QualityStatement";

import { forecastSkill } from "../control";

describe("a forecast not beating persistence", () => {
  const markup = renderToStaticMarkup(<QualityStatement skill={forecastSkill()} />);

  it("says so in plain words rather than only as a negative number", () => {
    expect(markup).toContain('data-skill-state="not-beating-persistence"');
    expect(markup).toContain("not beating a persistence reference");
  });

  it("shows the sample count beside the claim", () => {
    expect(markup).toContain('data-testid="skill-sample-count"');
    expect(markup).toContain("120");
  });

  it("shows both mean-square errors, so the score can be recomputed", () => {
    expect(markup).toContain("4.2");
    expect(markup).toContain("3.1");
    expect(markup).toContain('data-testid="skill-model-error"');
    expect(markup).toContain('data-testid="skill-persistence-error"');
  });

  it("shows the formula telemetry applied rather than one assumed here", () => {
    expect(markup).toContain("1 - model_mean_square_error / persistence_mean_square_error");
  });

  it("uses telemetry's own sentence, so every consumer says the same thing", () => {
    expect(markup).toContain(forecastSkill().statement);
  });
});

describe("a forecast beating persistence", () => {
  it("says so, and still shows the evidence", () => {
    const skill = forecastSkill({
      state: "beating-persistence",
      model_mean_square_error: 1.2,
      persistence_mean_square_error: 3.1,
      skill_score: 0.61,
      statement: "The forecast is beating a persistence reference over these samples.",
    });
    const markup = renderToStaticMarkup(<QualityStatement skill={skill} />);
    expect(markup).toContain('data-skill-state="beating-persistence"');
    expect(markup).toContain("0.61");
    expect(markup).toContain("120");
  });
});

describe("a stale statistic", () => {
  const stale = forecastSkill({
    freshness: "stale",
    last_updated_sim_time: "2026-08-26T00:02:00.000000Z",
  });
  const markup = renderToStaticMarkup(<QualityStatement skill={stale} />);

  it("is rendered as stale, not as a current value", () => {
    expect(markup).toContain('data-freshness="stale"');
    expect(markup).toContain('data-testid="skill-stale"');
    expect(markup).toContain("It is not a current value");
  });

  it("carries the simulation time of its last real update", () => {
    expect(markup).toContain("2026-08-26T00:02:00.000000Z");
  });

  it("says nothing about staleness when the figure is fresh", () => {
    const fresh = renderToStaticMarkup(<QualityStatement skill={forecastSkill()} />);
    expect(fresh).toContain('data-freshness="fresh"');
    expect(fresh).not.toContain('data-testid="skill-stale"');
  });
});

describe("with no score to give", () => {
  it("says nothing has arrived rather than showing a zero", () => {
    const markup = renderToStaticMarkup(<QualityStatement skill={null} />);
    expect(markup).toContain('data-skill-state="unheard"');
    expect(markup).toContain("does not guess");
  });

  it("shows a null score as not reported, never as zero", () => {
    const insufficient = forecastSkill({
      state: "insufficient-samples",
      sample_count: 4,
      skill_score: null,
      model_mean_square_error: null,
      persistence_mean_square_error: null,
      statement: "Too few measurements have been scored to publish a skill figure.",
    });
    const markup = renderToStaticMarkup(<QualityStatement skill={insufficient} />);
    expect(markup).toContain("not reported");
    expect(markup).toContain('data-skill-state="insufficient-samples"');
    expect(markup).toContain("no score below 30");
  });
});

describe("the display's own stability", () => {
  it("renders identically twice from the same report, so a capture is stable", () => {
    const skill = forecastSkill();
    const draw = () => renderToStaticMarkup(<QualityStatement skill={skill} />);
    expect(draw()).toBe(draw());
  });

  it("draws no host-derived quantity", () => {
    const markup = renderToStaticMarkup(<QualityStatement skill={forecastSkill({ freshness: "stale" })} />);
    expect(markup).not.toMatch(/\d+\s*s ago/);
    expect(markup).not.toMatch(/min ago/);
  });
});
