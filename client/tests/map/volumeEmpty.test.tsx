/**
 * With no field received, the volume says exactly what the flat map says.
 *
 * Story 3's third acceptance scenario asks for that word — *exactly* — and the reason is
 * worth stating. Two views describing the same nothing in two different sentences leave a
 * reader unable to tell whether the views are looking at different data or at the same data
 * described differently, and that ambiguity is precisely what a display of absence exists
 * to remove.
 *
 * So the assertion is on identity rather than on similarity: both render the constant that
 * `absence.ts` holds, and the test compares the rendered sentence against that constant
 * rather than against a sentence written here. A reworded absence changes both views at
 * once or fails this.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NO_FIELD_RECEIVED } from "../../src/map/absence";
import { MapSurface, NO_FIELD } from "../../src/map/MapSurface";
import { chooseExtent, extentFromDeclaration } from "../../src/map/extent";

import type { MapMode } from "../../src/map/mapReadiness";

import { DECLARED_MAP } from "../runtimeConfig";

const EXTENT = chooseExtent(null, extentFromDeclaration(DECLARED_MAP.extent, DECLARED_MAP.vertical));

function render(initialMode: MapMode): string {
  return renderToStaticMarkup(
    <MapSurface
      extent={EXTENT}
      field={NO_FIELD}
      route={null}
      conditions={null}
      selectedVertex={0}
      onSelectVertex={() => undefined}
      initialMode={initialMode}
    />,
  );
}

/**
 * The text of one element, by its test identifier.
 *
 * Read from the element rather than from the whole page, and that is the point. Written
 * first as a scan of the whole rendered markup, this test passed against a version whose
 * volume said something entirely different — because the flat map's own statement is on the
 * page as well and carried the sentence being looked for. A check that cannot fail on the
 * thing it describes is worth nothing, and this one was watched failing after the change.
 */
function textOf(markup: string, testid: string): string {
  const pattern = new RegExp(`<[^>]*data-testid="${testid}"[^>]*>([\\s\\S]*?)</`, "u");
  const found = pattern.exec(markup);
  expect(found, `${testid} is not in the rendered markup`).not.toBeNull();
  return (found?.[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

describe("volume mode with nothing to draw", () => {
  const volume = textOf(render("volume"), "map-volume-words");
  const flat = textOf(render("flat"), "map-field-state");

  it("states the empty case in the same sentence the flat map states it in", () => {
    expect(volume).toBe(NO_FIELD_RECEIVED);
    expect(flat).toBe(NO_FIELD_RECEIVED);
    expect(volume).toBe(flat);
  });

  it("draws no node at all, and says so in the readiness the page publishes", () => {
    expect(render("volume")).toContain('data-map-drawn-cells="0"');
    expect(render("volume")).toContain('data-map-run=""');
  });

  it("still says which mode it is in, so the toggle is not a mystery", () => {
    expect(render("volume")).toContain('data-map-mode="volume"');
    expect(render("volume")).toContain('data-testid="map-mode-toggle"');
  });

  it("offers no depth control, because there are no depths to choose between", () => {
    expect(render("volume")).not.toContain('data-testid="map-depth-control"');
  });
});
