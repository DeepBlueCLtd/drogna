/**
 * Components that are alive and are not in the drawing.
 *
 * A heartbeat carrying an id the layout does not know is the most interesting message
 * this page can receive: something is running that the picture does not account for.
 * Dropping it would be the display hiding a genuinely live component in order to keep
 * its own diagram tidy, which is precisely the failure Constitution VII exists to
 * prevent. So it is shown here, in words, with the id exactly as it arrived.
 */
import type { ComponentView } from "../liveness/view";
import { ILLUMINATION, statusWords } from "./states";

export function UnmappedComponents({
  views,
}: {
  readonly views: readonly ComponentView[];
}): JSX.Element {
  return (
    <section className="panel" data-testid="unmapped-components">
      <h2>Heard from, not in the drawing</h2>
      {views.length === 0 ? (
        <p>
          Nothing. Every component heard from has a box above. If something publishes a heartbeat
          under an id this layout does not know, it appears here rather than being discarded.
        </p>
      ) : (
        <ul>
          {views.map((view) => (
            <li key={view.componentId} data-testid={`unmapped-${view.componentId}`}>
              <span className="figure">{view.componentId}</span>{" "}
              {ILLUMINATION[view.illumination].label}
              {/*
                The simulation time the heartbeat carried, not a host duration since it
                arrived: FR-009 keeps host time out of the rendered output so a capture
                at a pinned rate is stable between frames.
              */}
              {view.reported === null
                ? ""
                : `, ${statusWords(view.reported.status)}, at ${view.reported.simTime}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
