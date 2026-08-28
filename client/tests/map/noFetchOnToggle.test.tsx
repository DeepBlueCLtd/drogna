/**
 * Looking at the data differently is not a reason to ask for it again.
 *
 * FR-006 and SC-006: entering volume mode and leaving it completes without a fetch, and
 * story 3's second scenario puts it more strongly — "no additional data is fetched by the
 * act of looking". That is a promise about a whole interaction, and the cheapest way to
 * break it is the obvious implementation: a volume that asks for the depths the flat map
 * did not need.
 *
 * Asserted three ways, because one of them alone would miss the others.
 *
 * The behavioural one replaces the page's own fetch with something that fails loudly, and
 * renders the surface in both modes with a cube already in hand. Anything reaching for the
 * network during either render throws rather than being counted, so the assertion cannot
 * pass by counting wrongly.
 *
 * The structural one says the volume is derived from the same cube by a pure function, so
 * there is nothing for it to ask for even in principle.
 *
 * The third reads the source of every map module for a fetch. It is blunt and it is the one
 * that would catch a request added tomorrow through some other door.
 *
 * **Watched failing** against a version whose volume mode read the cube through a fetch
 * before drawing it: the behavioural assertion threw with "the map asked the network".
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { drawnVolume } from "../../src/map/layers";
import { readFieldCube, sliceAt } from "../../src/map/fieldCube";
import { MapSurface } from "../../src/map/MapSurface";
import { chooseExtent, extentFromDeclaration } from "../../src/map/extent";

import type { MapMode } from "../../src/map/mapReadiness";

import { CUBE_PARAMETER, cubeResponse } from "./cubeResponse";
import { DECLARED_MAP } from "../runtimeConfig";

const ASKED = { runId: "run-0007", collection: "uncertainty-run-0007", parameter: CUBE_PARAMETER };
const READ = readFieldCube(cubeResponse(), ASKED);
if (!READ.ok) {
  throw new Error(READ.reason);
}
const CUBE = READ;
const EXTENT = chooseExtent(null, extentFromDeclaration(DECLARED_MAP.extent, DECLARED_MAP.vertical));

function render(initialMode: MapMode): string {
  return renderToStaticMarkup(
    <MapSurface
      extent={EXTENT}
      field={{ cube: CUBE, because: null, awaiting: false }}
      route={null}
      conditions={null}
      selectedVertex={0}
      onSelectVertex={() => undefined}
      initialMode={initialMode}
    />,
  );
}

describe("rendering either mode with the cube already in hand", () => {
  const original = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = (() => {
      throw new Error("the map asked the network");
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = original;
  });

  it("draws the flat map without asking the network", () => {
    const markup = render("flat");
    expect(markup).toContain('data-map-mode="flat"');
    expect(markup).toContain('data-map-drawn-cells="9"');
  });

  it("draws the volume without asking the network", () => {
    const markup = render("volume");
    expect(markup).toContain('data-map-mode="volume"');
    expect(markup).toContain('data-map-drawn-cells="18"');
    expect(markup).toContain("positive downwards");
  });

  it("goes back to the flat map without asking the network", () => {
    expect(render("volume")).toContain('data-map-mode="volume"');
    expect(render("flat")).toContain('data-map-mode="flat"');
  });

  it("shows the same run in both, so the two views cannot disagree about which it is", () => {
    expect(render("flat")).toContain('data-map-run="run-0007"');
    expect(render("volume")).toContain('data-map-run="run-0007"');
  });
});

describe("where the volume's data comes from", () => {
  it("is the cube the flat map's slice came from, read a second time", () => {
    const slice = sliceAt(CUBE, 0, 0);
    const volume = drawnVolume(CUBE, 0, 4096);
    if (!slice.ok) {
      throw new Error(slice.reason);
    }
    const shallowest = (volume?.points ?? []).filter((point) => point.depthM === 0);
    expect(shallowest.map((point) => point.value)).toEqual(slice.grid.cells.map((c) => c.spread));
  });

  it("is a pure function of that cube, so there is nothing for it to ask for", () => {
    expect(drawnVolume(CUBE, 0, 4096)).toEqual(drawnVolume(CUBE, 0, 4096));
    expect(drawnVolume.length).toBe(3);
  });
});

describe("the map's own source", () => {
  const mapRoot = fileURLToPath(new URL("../../src/map", import.meta.url));

  it("reaches the network from nowhere at all", () => {
    const files = readdirSync(mapRoot).filter((name) => /\.tsx?$/.test(name));
    expect(files.length).toBeGreaterThan(5);
    for (const name of files) {
      const text = readFileSync(join(mapRoot, name), "utf8");
      expect(/\bfetch\s*\(/.test(text), name).toBe(false);
      expect(/XMLHttpRequest|EventSource|WebSocket/.test(text), name).toBe(false);
    }
  });
});
