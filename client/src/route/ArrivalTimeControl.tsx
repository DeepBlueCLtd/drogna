/**
 * Moving along the route, and reading the conditions forecast for the moment of arrival.
 *
 * FR-026, and the whole point of the trajectory query. The control steps from vertex to
 * vertex; at each one it shows the arrival instant, the depth, and the conditions the EDR
 * trajectory response gave *for that instant*. Where the response answered a different
 * moment — which is what losing the per-vertex time produces, silently, with HTTP 200 —
 * this says there is no forecast for the moment of arrival rather than showing the value
 * it has (FR-027).
 *
 * The control moves through the route's own vertices rather than through a continuum,
 * because a vertex is where the planner stated an arrival instant and anything between two
 * of them would be an interpolation the planner did not publish. Same argument as
 * FR-022's, applied to the route rather than to the field.
 *
 * There is no control here to accept, task, execute or order anything (FR-028). Selecting
 * a vertex changes what is read; it commands nothing, and there is nothing for it to
 * command.
 */
import type { RouteDisplay, RouteVertex } from "./RouteLayer";
import { conditionsAtArrival, noConditionsWords } from "./trajectoryQuery";
import type { TrajectoryResult } from "./trajectoryQuery";

export interface ArrivalTimeControlProps {
  readonly route: RouteDisplay;
  /** The trajectory response for this route, or null before one has been read. */
  readonly conditions: TrajectoryResult | null;
  /** Which vertex the viewer is looking at. */
  readonly selected: number;
  readonly onSelect: (sequence: number) => void;
}

function Conditions({
  vertex,
  conditions,
}: {
  readonly vertex: RouteVertex;
  readonly conditions: TrajectoryResult | null;
}): JSX.Element {
  if (conditions === null) {
    return (
      <p data-testid="arrival-unqueried">
        No trajectory response has been read for this route, so no conditions are shown. The
        route itself is the planner's; the conditions along it come from the forecast.
      </p>
    );
  }
  const answered = conditionsAtArrival(conditions, vertex);
  if (answered === null || answered.declined) {
    return (
      <p data-testid="arrival-no-forecast" data-declined={String(answered?.declined ?? false)}>
        {noConditionsWords(vertex, answered)}
      </p>
    );
  }
  return (
    <dl data-testid="arrival-conditions">
      <dt>Forecast for</dt>
      <dd data-testid="arrival-answered-for">{answered.forSimTime}</dd>
      {Object.entries(answered.values).map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd data-testid={`arrival-value-${name}`}>{value === null ? "not reported" : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ArrivalTimeControl({
  route,
  conditions,
  selected,
  onSelect,
}: ArrivalTimeControlProps): JSX.Element {
  const vertex = route.vertices[selected] ?? route.vertices[0] ?? null;
  return (
    <section className="panel arrival-control" data-testid="arrival-time-control">
      <h2>Along the route</h2>
      {vertex === null ? (
        <p data-testid="arrival-empty-route">
          The recommended route has no vertices, so there is nowhere along it to move to.
        </p>
      ) : (
        <>
          <ol className="route-vertices" role="group" aria-label="Move along the recommended route">
            {route.vertices.map((candidate) => (
              <li key={candidate.sequence}>
                <button
                  type="button"
                  data-testid={`route-vertex-${candidate.sequence}`}
                  data-selected={String(candidate.sequence === vertex.sequence)}
                  aria-pressed={candidate.sequence === vertex.sequence}
                  onClick={() => {
                    onSelect(candidate.sequence);
                  }}
                >
                  {candidate.arrivalSimTime} · {candidate.depthM} m
                </button>
              </li>
            ))}
          </ol>
          <p className="arrival-vertex" data-testid="arrival-vertex">
            Vertex {vertex.sequence}: {vertex.latitude}, {vertex.longitude} at {vertex.depthM} m
            below the surface, reached at simulation time {vertex.arrivalSimTime}. Conditions
            below are those forecast for that moment, not for the moment of asking.
          </p>
          <Conditions vertex={vertex} conditions={conditions} />
        </>
      )}
    </section>
  );
}
