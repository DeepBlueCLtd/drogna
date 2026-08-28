/**
 * A browser that cannot draw, and a page that still works.
 *
 * The specification's first edge case, and it preserves the shell-first ordering feature 003
 * established: where the rendering machinery is unavailable, every other panel renders
 * normally and the map region says what is missing and why, rather than presenting a blank
 * or broken page.
 *
 * The statement is careful about whose fault it is. "No field has been received" is a claim
 * about the harness; "this browser would not give the page a drawing context" is a claim
 * about the machine the page is being read on, and confusing the two would tell a viewer the
 * system is empty when their graphics stack is the thing that is missing.
 *
 * Under Node there is no document, so the probe answers unavailable without being told to —
 * which means this is the path every other test in this directory takes as well, and the
 * branch that is hardest to reach in a browser is the best-covered one here rather than the
 * worst.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AVAILABLE, renderingCapability } from "../../src/map/renderingCapability";
import { MapSurface, NO_FIELD } from "../../src/map/MapSurface";
import { chooseExtent, extentFromDeclaration } from "../../src/map/extent";

import { DECLARED_MAP } from "../runtimeConfig";

const EXTENT = chooseExtent(null, extentFromDeclaration(DECLARED_MAP.extent, DECLARED_MAP.vertical));

function render(capability: ReturnType<typeof renderingCapability>): string {
  return renderToStaticMarkup(
    <MapSurface
      extent={EXTENT}
      field={NO_FIELD}
      route={null}
      conditions={null}
      selectedVertex={0}
      onSelectVertex={() => undefined}
      capability={capability}
    />,
  );
}

describe("the probe", () => {
  it("answers unavailable where there is no document, with the reason", () => {
    const capability = renderingCapability();
    expect(capability.available).toBe(false);
    expect(capability.because).toContain("not running in a browser document");
  });

  it("answers unavailable where the browser refuses a context, with the reason", () => {
    const refusing = { createElement: () => ({ getContext: () => null }) };
    const capability = renderingCapability(refusing);
    expect(capability.available).toBe(false);
    expect(capability.because).toContain("would not give this page a webgl2 context");
  });

  it("answers unavailable rather than throwing where the probe itself raises", () => {
    const throwing = {
      createElement: () => {
        throw new Error("no canvas here");
      },
    };
    const capability = renderingCapability(throwing);
    expect(capability.available).toBe(false);
    expect(capability.because).toContain("no canvas here");
  });

  it("answers available where a context comes back", () => {
    const working = { createElement: () => ({ getContext: () => ({}) }) };
    expect(renderingCapability(working)).toEqual(AVAILABLE);
  });
});

describe("the map region where nothing can be drawn", () => {
  const markup = render(renderingCapability());

  it("renders, so the shell is missing one panel's content and nothing else", () => {
    expect(markup).toContain('data-testid="map-surface"');
    expect(markup).toContain("<h2>The map</h2>");
  });

  it("says what is missing and why, and says it is about the browser", () => {
    expect(markup).toContain('data-testid="map-no-drawing-surface"');
    expect(markup).toContain("not running in a browser document");
    expect(markup).toContain("a statement about the browser this page is being read in");
  });

  it("mounts no canvas at all, rather than an empty one", () => {
    expect(markup).not.toContain('data-testid="map-canvas"');
    expect(markup).toContain('data-map-renderable="false"');
  });

  it("still states the extent, which is known whether or not it can be drawn", () => {
    expect(markup).toContain("This extent is declared");
  });
});
