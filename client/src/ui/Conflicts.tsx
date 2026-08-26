/**
 * Two processes publishing the same component id.
 *
 * The client cannot tell which of them is the one the drawing means, and choosing would
 * mean hiding a live thing. So both are reported, by run id and configuration digest,
 * and the conflict is left visible for someone to resolve where it can actually be
 * resolved.
 */
import type { ComponentView } from "../liveness/view";

export function Conflicts({ views }: { readonly views: readonly ComponentView[] }): JSX.Element | null {
  const conflicted = views.filter((view) => view.conflicting.length > 1);
  if (conflicted.length === 0) {
    return null;
  }
  return (
    <section className="panel warning" data-testid="identity-conflicts">
      <h2>Same id, two publishers</h2>
      <ul>
        {conflicted.map((view) => (
          <li key={view.componentId} data-testid={`conflict-${view.componentId}`}>
            <span className="figure">{view.componentId}</span> is being published by{" "}
            {view.conflicting.length} processes at once:{" "}
            {view.conflicting
              .map((identity) => `${identity.runId ?? "no run id"} / ${identity.configDigest ?? "no digest"}`)
              .join("; ")}
            . Both are shown as one box, because the client cannot tell them apart on the wire.
          </li>
        ))}
      </ul>
    </section>
  );
}
