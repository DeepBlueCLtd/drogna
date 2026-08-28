/**
 * The map region: what is drawn, what is not, and which of those two a viewer is looking at.
 *
 * This is the surface feature 012 assumed and feature 003 did not deliver. Its obligations
 * are unusual for a map and they are the point of the feature:
 *
 * - **It renders before it can draw.** The region, its statements and its readiness
 *   attributes are in the document whether or not a drawing context was obtained, so the
 *   shell-first ordering feature 003 established survives a browser with no GPU. The canvas
 *   is mounted last and only where a context exists.
 * - **It states absence rather than showing an empty rectangle.** Three different absences,
 *   three different sentences, all from `absence.ts` so the flat view and the volume cannot
 *   drift apart in what they say about the same nothing.
 * - **It draws nothing it was not given.** Every layer is built from a fetched cube, a
 *   published plan, or the extent's own geometry. There is no branch here that produces
 *   content in the absence of data (Constitution VII).
 * - **It says what it reduced.** The stride and the stated resolution come from feature
 *   012's `drawnField`, and the sentence beside the field is 012's `resolutionWords`.
 *
 * The mode — flat or volume — is held here, because entering the volume must fetch nothing
 * (FR-006). It reads a second time from the cube the flat view already drew, so there is
 * nothing for a mode switch to ask for.
 */
import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";

import { DEFAULT_MAXIMUM_DRAWN_CELLS, drawnField, resolutionWords } from "../uncertainty/UncertaintyLayer";
import { routeLayerInputs } from "../route/RouteLayer";
import { NO_EXTENT_DECLARED, NO_FIELD_RECEIVED, NO_PLAN_RECEIVED, noDrawingSurface } from "./absence";
import { canvasWidth, extentWords, fitView, graticule } from "./extent";
import { sliceAt } from "./fieldCube";
// One line, because `scripts/check_no_literal_paths.py` recognises a module specifier by
// the line it starts on: a wrapped import leaves `} from "./layers"` on a line of its own,
// which the gate reads as a relative path in source rather than as a name in the build graph.
import { DEPTH_AXIS_LABEL, FLAT_VIEW, VOLUME_VIEW, drawnVolume, fieldLayer, frameLayer, graticuleLayer, pickedCellLayer, routeLayers, volumeBoxLayer, volumeLayers, volumeWords } from "./layers";
import { exposeMapReadiness, readinessAttributes } from "./mapReadiness";
import { pickedCell, pickedWords } from "./selection";
import { renderingCapability } from "./renderingCapability";
import { rampWords } from "./shading";
import { VolumeToggle } from "./VolumeToggle";

import type { Layer } from "@deck.gl/core";
import type { RouteDisplay } from "../route/RouteLayer";
import type { TrajectoryResult } from "../route/trajectoryQuery";
import type { FieldCell } from "../uncertainty/UncertaintyLayer";
import type { DerivedExtent } from "./extent";
import type { FieldCube } from "./fieldCube";
import type { MapMode, MapReadiness } from "./mapReadiness";
import type { PickedCell } from "./selection";
import type { RenderingCapability } from "./renderingCapability";

/** What the page holds about the field: one fetched cube, or the reason there is none. */
export interface MapFieldState {
  readonly cube: FieldCube | null;
  /** Why there is no cube. Null before any run has been announced. */
  readonly because: string | null;
  /** True while the fetch one announcement caused has not finished. */
  readonly awaiting: boolean;
}

export const NO_FIELD: MapFieldState = { cube: null, because: null, awaiting: false };

export interface MapSurfaceProps {
  readonly extent: DerivedExtent;
  readonly field: MapFieldState;
  readonly route: RouteDisplay | null;
  readonly conditions: TrajectoryResult | null;
  readonly selectedVertex: number;
  readonly onSelectVertex: (sequence: number) => void;
  /** The drawing budget from the served document, or 012's own where none was served. */
  readonly maximumDrawnCells?: number | undefined;
  /**
   * The graticule spacing the destination declared, or undefined to choose one.
   *
   * Honoured where it is served, because a destination that states a spacing has said
   * something about how it wants its own scenario read, and a served value the client
   * quietly ignored would be configuration that does nothing.
   */
  readonly graticuleSpacingDegrees?: number | undefined;
  /**
   * Whether this browser can draw, injectable so a test can assert both paths.
   *
   * Under Node there is no document and so no context, which means the honest-degradation
   * path is the one every test here takes by default rather than the one nothing reaches.
   */
  readonly capability?: RenderingCapability;
  /**
   * How tall the canvas is drawn. Its width follows the extent's own shape.
   *
   * A test may state it, so a fit can be asserted against a viewport rather than against
   * whatever the page happened to be.
   */
  readonly height?: number;
  /** The canvas width, where a caller would rather state one than derive it. */
  readonly width?: number;
  /**
   * Which presentation the surface opens in.
   *
   * The flat map, unless something says otherwise. It exists so that a test can assert
   * what the volume renders without a browser to press the toggle in; it is an initial
   * value and not a controlled one, so the viewer's own choice still wins from the first
   * interaction onwards.
   */
  readonly initialMode?: MapMode;
}

/** How tall the canvas is drawn, and how wide it may become when the extent is broad. */
const DEFAULT_HEIGHT = 440;
const WIDEST = 1000;

/** Which vertices the trajectory response declined, so the route draws them as declined. */
function declinedVertices(conditions: TrajectoryResult | null): ReadonlySet<number> {
  const declined = new Set<number>();
  if (conditions === null) {
    return declined;
  }
  for (const entry of conditions.conditions) {
    if (entry.declined) {
      declined.add(entry.sequence);
    }
  }
  return declined;
}

export function MapSurface({
  extent,
  field,
  route,
  conditions,
  selectedVertex,
  onSelectVertex,
  maximumDrawnCells,
  graticuleSpacingDegrees,
  capability,
  height = DEFAULT_HEIGHT,
  width,
  initialMode = "flat",
}: MapSurfaceProps): JSX.Element {
  const [mode, setMode] = useState<MapMode>(initialMode);
  const [depthIndex, setDepthIndex] = useState(0);
  const [picked, setPicked] = useState<PickedCell | null>(null);

  const surface = capability ?? renderingCapability();
  const budget = maximumDrawnCells ?? DEFAULT_MAXIMUM_DRAWN_CELLS;
  const cube = field.cube;
  // The instant is the cube's first, because the request asked for one instant and this is
  // it. Stated rather than assumed: a display that showed the first of several while
  // looking like "the forecast" would answer a question nobody asked.
  const timeIndex = 0;
  const depth = cube === null ? 0 : Math.min(depthIndex, cube.depths.length - 1);

  const slice = useMemo(() => (cube === null ? null : sliceAt(cube, timeIndex, depth)), [cube, depth]);
  const drawn = slice !== null && slice.ok ? drawnField(slice.grid, budget) : null;
  const volume = useMemo(
    () => (cube === null || mode !== "volume" ? null : drawnVolume(cube, timeIndex, budget)),
    [cube, mode, budget],
  );
  const lines =
    extent.extent === null ? null : graticule(extent.extent, graticuleSpacingDegrees);
  const routeInputs = route === null ? null : routeLayerInputs(route);
  const declined = declinedVertices(conditions);

  const readiness: MapReadiness = {
    renderable: surface.available,
    extentSource: extent.source,
    fieldRunId: drawn?.runId ?? null,
    drawnCells: mode === "volume" ? (volume?.points.length ?? 0) : (drawn?.cells.length ?? 0),
    stride: (mode === "volume" ? volume?.stride : drawn?.stride) ?? 1,
    routePlanId: route?.planId ?? null,
    mode,
    drawn: !field.awaiting,
    emptyBecause:
      drawn !== null ? null : (field.because ?? (cube === null ? NO_FIELD_RECEIVED : null)),
  };

  useEffect(() => {
    exposeMapReadiness(readiness);
  });

  const layers: Layer[] = [];
  if (surface.available && extent.extent !== null && lines !== null) {
    if (mode === "flat") {
      layers.push(frameLayer(extent.extent, lines), graticuleLayer(lines));
      if (drawn !== null) {
        layers.push(
          fieldLayer({
            extent: extent.extent,
            field: drawn,
            onPick: (cell: FieldCell) => {
              setPicked(cube === null ? null : pickedCell(cube, timeIndex, depth, cell));
            },
          }),
        );
      }
      if (picked !== null) {
        layers.push(pickedCellLayer(picked.longitude, picked.latitude));
      }
      if (routeInputs !== null) {
        layers.push(
          ...routeLayers({
            route: routeInputs,
            declined,
            selected: selectedVertex,
            onPick: (vertex) => {
              onSelectVertex(vertex.sequence);
            },
          }),
        );
      }
    } else {
      // The box is drawn whether or not there is anything in it, for the same reason the
      // graticule is: an empty box with a labelled depth axis says "nothing has been
      // published", and a blank rectangle says nothing at all.
      layers.push(...(volume === null ? [volumeBoxLayer()] : volumeLayers(volume)));
    }
  }

  const drawnWidth =
    width ?? (extent.extent === null ? WIDEST : canvasWidth(extent.extent, height, 320, WIDEST));
  const fit = extent.extent === null ? null : fitView(extent.extent, drawnWidth, height);

  return (
    <section
      className="panel map-surface"
      data-testid="map-surface"
      {...readinessAttributes(readiness)}
    >
      <h2>The map</h2>
      <p className="map-extent" data-testid="map-extent">
        {extent.extent === null ? NO_EXTENT_DECLARED : extentWords(extent)}
      </p>
      {lines === null ? null : (
        <p className="map-graticule" data-testid="map-graticule-words">
          The graticule is drawn every {lines.spacingDegrees}°, from{" "}
          {lines.lines.filter((line) => line.axis === "meridian").length} meridians and{" "}
          {lines.lines.filter((line) => line.axis === "parallel").length} parallels. It is
          geometry derived from the extent, not anything that was measured.
        </p>
      )}
      {surface.available ? null : (
        <p className="map-unavailable" data-testid="map-no-drawing-surface">
          {noDrawingSurface(surface.because ?? "the reason was not reported")}
        </p>
      )}
      {surface.available && fit !== null ? (
        <div className="map-canvas" data-testid="map-canvas" style={{ width: drawnWidth, height }}>
          <DeckGL
            views={mode === "flat" ? FLAT_VIEW : VOLUME_VIEW}
            initialViewState={
              mode === "flat"
                ? { longitude: fit.longitude, latitude: fit.latitude, zoom: fit.zoom }
                : { target: [0, 0, -30], rotationX: 30, rotationOrbit: 20, zoom: 1 }
            }
            controller={true}
            layers={layers}
            width={drawnWidth}
            height={height}
          />
        </div>
      ) : null}
      {mode === "flat" ? (
        <FieldStatement
          field={field}
          drawn={drawn}
          sliceReason={slice !== null && !slice.ok ? slice.reason : null}
        />
      ) : null}
      {cube === null || drawn === null ? null : (
        <>
          <p className="map-legend" data-testid="map-legend">
            {rampWords([
              Math.min(...drawn.cells.map((cell) => cell.spread)),
              Math.max(...drawn.cells.map((cell) => cell.spread)),
            ])}
          </p>
          <DepthControl
            cube={cube}
            depthIndex={depth}
            onChoose={(index) => {
              setDepthIndex(index);
              setPicked(null);
            }}
          />
        </>
      )}
      <VolumeToggle
        mode={mode}
        onChoose={(next) => {
          setMode(next);
        }}
      />
      {mode === "volume" ? (
        <>
          <p className="map-volume" data-testid="map-volume-words">
            {volume === null ? NO_FIELD_RECEIVED : volumeWords(volume)}
          </p>
          <p className="map-volume" data-testid="map-depth-axis">
            {DEPTH_AXIS_LABEL}
            {volume === null
              ? extent.extent?.minimumDepthM === null || extent.extent === null
                ? ""
                : ` The box is drawn for ${extent.extent.minimumDepthM} m to ${extent.extent.maximumDepthM} m, which is the range the extent states; nothing inside it is drawn.`
              : ` This volume spans ${volume.depthRange[0]} m to ${volume.depthRange[1]} m, as the run's own vertical axis states.`}
          </p>
        </>
      ) : null}
      <p className="map-route" data-testid="map-route-state">
        {route === null
          ? NO_PLAN_RECEIVED
          : route.vertices.length === 0
            ? "The planner recommended no route, so none is drawn. The reason it gave is beside the recommendation."
            : `The recommended route is drawn with ${route.vertices.length} vertices, one per published waypoint. It is a recommendation, and this page offers nothing that would make it more than one.`}
      </p>
      {picked === null ? (
        <p className="map-picked" data-testid="map-picked-none">
          No cell has been picked. Selecting one reports its value, position, depth and the
          simulation time it belongs to, from the response that carried it.
        </p>
      ) : (
        <p className="map-picked" data-testid="map-picked">
          {pickedWords(picked)}
        </p>
      )}
    </section>
  );
}

/** What the page has of the field, and why it has no more than that. */
function FieldStatement({
  field,
  drawn,
  sliceReason,
}: {
  readonly field: MapFieldState;
  readonly drawn: ReturnType<typeof drawnField> | null;
  readonly sliceReason: string | null;
}): JSX.Element {
  if (drawn !== null) {
    return (
      <p className="map-field" data-testid="map-field-state" data-field="drawn">
        {resolutionWords(drawn)}
      </p>
    );
  }
  if (sliceReason !== null) {
    return (
      <p className="map-field" data-testid="map-field-state" data-field="refused">
        {sliceReason}
      </p>
    );
  }
  if (field.awaiting) {
    return (
      <p className="map-field" data-testid="map-field-state" data-field="awaiting">
        A run has been announced and its field is being read. Nothing is drawn until the
        response arrives; what would be drawn in the meantime is not data.
      </p>
    );
  }
  return (
    <p className="map-field" data-testid="map-field-state" data-field="none">
      {field.because ?? NO_FIELD_RECEIVED}
    </p>
  );
}

/** Which depth the flat map is showing, out of the depths the cube carries. */
function DepthControl({
  cube,
  depthIndex,
  onChoose,
}: {
  readonly cube: FieldCube;
  readonly depthIndex: number;
  readonly onChoose: (index: number) => void;
}): JSX.Element {
  return (
    <div className="map-depths" data-testid="map-depth-control">
      <p>
        Showing {cube.depths[depthIndex]} m below the surface, of {cube.depths.length} depths
        this run carries. Depth is positive downwards.
      </p>
      <ol role="group" aria-label="Choose a depth to show">
        {cube.depths.map((metres, index) => (
          <li key={metres}>
            <button
              type="button"
              data-testid={`map-depth-${index}`}
              data-selected={String(index === depthIndex)}
              aria-pressed={index === depthIndex}
              onClick={() => {
                onChoose(index);
              }}
            >
              {metres} m
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
