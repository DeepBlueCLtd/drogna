/**
 * The route recommends. There is no control anywhere that could make it an order.
 *
 * Constitution VIII, FR-028 and SC-012, asserted by an interaction and vocabulary test
 * rather than by review. Two halves, and the second is the one that catches the drift: a
 * feature added later that means well — "confirm route", "send to platform", "approve" —
 * would pass a review that was looking at something else, and fails here.
 *
 * The vocabulary scan covers the whole rendered surface of this feature, not only the
 * route panel, because a command anywhere on the page is a command.
 *
 * Constitution V is here too. The sampling platform is a coordinate and a sampler, and the
 * six nouns the constitution forbids must not reach the screen. Naming them is unavoidable
 * in the test that asserts their absence — the prohibition has to be stated where it is
 * checked — so the list below carries an exemption marker with that as its reason, in the
 * same way the store migrations carry one for stating the rule beside the columns.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { drawFrame, emptyLoop, messageOn, receiveControl } from "../../src/data/controlSubscription";
import { DIVERGENCE_TOPIC } from "../../src/data/topics";
import { MessageInspector } from "../../src/inspector/MessageInspector";
import { boundaryId } from "../../src/legibility/classification";
import { CycleView } from "../../src/loop/CycleView";
import { ArrivalTimeControl } from "../../src/route/ArrivalTimeControl";
import { RecommendationLabel } from "../../src/route/RecommendationLabel";
import { routeDisplay } from "../../src/route/RouteLayer";
import { QualityStatement } from "../../src/uncertainty/QualityStatement";

import { divergenceEvent, forecastSkill, samplingRecommendation, wire } from "../control";

const ROUTE = routeDisplay(samplingRecommendation());
const boundary = boundaryId("monitor", "scheduler");
const LOOP = drawFrame(receiveControl(emptyLoop(), DIVERGENCE_TOPIC, wire(divergenceEvent())));

/** Everything this feature draws, as one document to read for words and for controls. */
const WHOLE_SURFACE = [
  renderToStaticMarkup(<RecommendationLabel route={ROUTE} />),
  renderToStaticMarkup(
    <ArrivalTimeControl route={ROUTE} conditions={null} selected={0} onSelect={() => undefined} />,
  ),
  renderToStaticMarkup(<CycleView loop={LOOP} status="turning" progress={0.5} />),
  renderToStaticMarkup(<MessageInspector boundary={boundary} message={messageOn(LOOP, boundary)} />),
  renderToStaticMarkup(<QualityStatement skill={forecastSkill()} />),
].join("\n");

/** Verbs that would make a recommendation an instruction. */
const COMMANDING = [
  /\baccept(s|ed|ing)?\b/i,
  /\btask(s|ed|ing)?\b/i,
  /\bexecut(e|es|ed|ing|ion)\b/i,
  /\border(s|ed|ing)?\b/i,
  /\bdispatch(es|ed|ing)?\b/i,
  /\bcommand(s|ed|ing)?\b/i,
  /\bapprove(s|d)?\b/i,
  /\bconfirm(s|ed)?\b/i,
  /\bengage(s|d)?\b/i,
  /\bdeploy(s|ed|ing)?\b/i,
];

/**
 * Vocabulary Constitution V forbids outright.
 *
 * The same six nouns `scripts/check_forbidden_vocabulary.py` reads the source for, applied
 * here to the *rendered output* instead — because the gate reads what the source says and
 * this reads what a viewer sees, and a word can reach a screen from a payload the source
 * never spells. Two words a wider list would catch are deliberately absent: here
 * "classification" is SRD §2.2's bespoke-or-plumbing reading, and "accepted" appears in
 * prose about a schema accepting a payload. Neither is about an entity, and reaching for
 * them would make this a spell-checker rather than a principle.
 */
// harness:allow-forbidden-vocabulary the prohibition has to be named where it is asserted; this is the list the rendered page is scanned for, not vocabulary this page uses
const FORBIDDEN_NOUNS = [/\btracked[\s_-]+entit(y|ies)\b/i, /\btracks?\b/i, /\btracking\b/i, /\btracklets?\b/i, /\bcontacts?\b/i, /\bdetections?\b/i];

describe("the route's label", () => {
  it("calls it a recommendation, in words a viewer reads", () => {
    const markup = renderToStaticMarkup(<RecommendationLabel route={ROUTE} />);
    expect(markup).toContain("This is a recommendation");
    expect(markup).toContain('data-state="recommended"');
  });

  it("says it is advice with no addressee, without reciting the verbs it denies", () => {
    const markup = renderToStaticMarkup(<RecommendationLabel route={ROUTE} />);
    expect(markup).toContain("advice and not an instruction");
    expect(markup).toContain("no addressee");
    // A denial that spells the words out puts them on the screen, where a reader skimming
    // and a vocabulary scan both have to work out which sense is meant.
    expect(markup).not.toMatch(/\baccepts\b/i);
  });
});

describe("what the interface offers", () => {
  it("offers no button that accepts, tasks, executes or orders", () => {
    const buttons = WHOLE_SURFACE.match(/<button[^>]*>[^<]*<\/button>/g) ?? [];
    for (const button of buttons) {
      for (const verb of COMMANDING) {
        expect(verb.test(button), `a button reads: ${button}`).toBe(false);
      }
    }
  });

  it("offers no form, no submit and no destination to send a route to", () => {
    expect(/<form/i.test(WHOLE_SURFACE)).toBe(false);
    expect(/type="submit"/i.test(WHOLE_SURFACE)).toBe(false);
    expect(/<input/i.test(WHOLE_SURFACE)).toBe(false);
  });

  it("offers only buttons that change what is read, never what is done", () => {
    // The route's own controls move the viewer along the route. Selecting a vertex reads;
    // it commands nothing, and there is nothing for it to command.
    const control = renderToStaticMarkup(
      <ArrivalTimeControl route={ROUTE} conditions={null} selected={1} onSelect={() => undefined} />,
    );
    expect(control).toContain('data-testid="route-vertex-1" data-selected="true"');
    expect(control).toContain('data-testid="route-vertex-0" data-selected="false"');
    for (const verb of COMMANDING) {
      expect(verb.test(control), `${verb} appears in the arrival control`).toBe(false);
    }
  });
});

describe("the vocabulary of the whole surface", () => {
  it("uses no commanding verb anywhere it draws the route", () => {
    // Scoped to the route's own surface. Elsewhere "accepted" is prose about a schema
    // accepting a payload, which is the ordinary word for the ordinary thing; the
    // prohibition is on a route being accepted, and this is where that could happen.
    const routeSurface = [
      renderToStaticMarkup(<RecommendationLabel route={ROUTE} />),
      renderToStaticMarkup(
        <ArrivalTimeControl route={ROUTE} conditions={null} selected={0} onSelect={() => undefined} />,
      ),
    ].join("\n");
    for (const verb of COMMANDING) {
      expect(verb.test(routeSurface), `${verb} appears on the route surface`).toBe(false);
    }
    expect(routeSurface.length).toBeGreaterThan(800);
  });

  it("presents none of the six nouns Constitution V forbids", () => {
    for (const forbidden of FORBIDDEN_NOUNS) {
      expect(forbidden.test(WHOLE_SURFACE), `${forbidden} appears in the rendered page`).toBe(false);
    }
  });

  it("has a surface worth reading, so the scans above are not scanning nothing", () => {
    expect(WHOLE_SURFACE.length).toBeGreaterThan(2000);
    expect(WHOLE_SURFACE).toContain("recommendation");
  });
});
