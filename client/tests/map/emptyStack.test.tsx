/**
 * The map against a stack that has published nothing, which is the state it must be
 * demonstrable in.
 *
 * Story 1's fourth acceptance scenario, and it is the one that decides whether this feature
 * is honest. A surface that renders a blank rectangle when nothing has been published reads
 * as a healthy map of an empty ocean; a surface that renders nothing at all reads as a
 * broken page. Neither is what happened. What happened is that the destination said where
 * the scenario is and nobody has published a forecast in it yet, and that is what the
 * region says, with the extent and the graticule drawn around the space where a field would
 * go.
 *
 * The other half is FR-008 and Constitution VII: not one drawn cell in that state. The
 * readiness attributes carry the count, so the assertion is on the page's own claim about
 * itself rather than on a reading of the source.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NO_EXTENT_DECLARED, NO_FIELD_RECEIVED, NO_PLAN_RECEIVED } from "../../src/map/absence";
import { MapSurface, NO_FIELD } from "../../src/map/MapSurface";
import { chooseExtent, extentFromDeclaration } from "../../src/map/extent";

import { DECLARED_MAP } from "../runtimeConfig";

const DECLARED = chooseExtent(null, extentFromDeclaration(DECLARED_MAP.extent, DECLARED_MAP.vertical));
const NOTHING = chooseExtent(null, null);

function render(extent = DECLARED): string {
  return renderToStaticMarkup(
    <MapSurface
      extent={extent}
      field={NO_FIELD}
      route={null}
      conditions={null}
      selectedVertex={0}
      onSelectVertex={() => undefined}
    />,
  );
}

describe("a map with an extent and no field", () => {
  const markup = render();

  it("is in the document, so the region is missing nothing but its content", () => {
    expect(markup).toContain('data-testid="map-surface"');
  });

  it("draws the extent, and says the extent is the destination's declaration", () => {
    expect(markup).toContain("6°W to 3°W");
    expect(markup).toContain("48°N to 50°N");
    expect(markup).toContain("This extent is declared");
  });

  it("draws a graticule, and says it is geometry rather than anything measured", () => {
    expect(markup).toContain('data-testid="map-graticule-words"');
    expect(markup).toContain("meridians");
    expect(markup).toContain("not anything that was measured");
  });

  it("states that no field has been received, in the words absence.ts holds", () => {
    expect(markup).toContain('data-field="none"');
    expect(markup).toContain(NO_FIELD_RECEIVED.slice(0, 60));
  });

  it("states that no plan has been published, which is a different absence", () => {
    expect(markup).toContain(NO_PLAN_RECEIVED.slice(0, 60));
  });

  it("draws no cell at all, and says so in the readiness the page publishes", () => {
    expect(markup).toContain('data-map-drawn-cells="0"');
    expect(markup).toContain('data-map-run=""');
    expect(markup).toContain('data-map-plan=""');
    expect(markup).toContain('data-map-extent-source="declared"');
  });

  it("offers the volume mode, which is reachable in one interaction (SC-006)", () => {
    expect(markup).toContain('data-testid="map-mode-volume"');
    expect(markup).toContain('data-mode="flat"');
  });

  it("says no cell has been picked, rather than showing a value for none", () => {
    expect(markup).toContain('data-testid="map-picked-none"');
    expect(markup).not.toContain('data-testid="map-picked"');
  });
});

describe("a map with no extent from either source", () => {
  const markup = render(NOTHING);

  it("draws no frame, and says why a frame would be an invention", () => {
    expect(markup).toContain(NO_EXTENT_DECLARED.slice(0, 60));
    expect(markup).toContain("inventing geography");
    expect(markup).not.toContain('data-testid="map-graticule-words"');
    expect(markup).toContain('data-map-extent-source="none"');
  });

  it("still renders the region, so the page is missing a panel and is not broken", () => {
    expect(markup).toContain('data-testid="map-surface"');
    expect(markup).toContain("<h2>The map</h2>");
  });
});

describe("the whole rendered surface, read for words it must not carry", () => {
  const markup = [render(), render(NOTHING)].join("\n");

  /**
   * The same scans `route/noInstruction.test.tsx` runs over feature 012's panels, run again
   * over the map's — because a command anywhere on the page is a command, and the map is
   * new page. Kept here rather than added to 012's list so that this feature's surface is
   * checked by this feature's tests.
   */
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

  // harness:allow-forbidden-vocabulary the prohibition has to be named where it is asserted; this is the list the rendered map is scanned for, not vocabulary the map uses
  const FORBIDDEN_NOUNS = [/\btracked[\s_-]+entit(y|ies)\b/i, /\btracklets?\b/i, /\bcontacts?\b/i, /\bdetections?\b/i];

  it("carries no verb that would make a recommendation an instruction", () => {
    for (const pattern of COMMANDING) {
      expect(pattern.test(markup), `${pattern}`).toBe(false);
    }
  });

  it("carries none of the nouns Constitution V forbids", () => {
    for (const pattern of FORBIDDEN_NOUNS) {
      expect(pattern.test(markup), `${pattern}`).toBe(false);
    }
  });
});
