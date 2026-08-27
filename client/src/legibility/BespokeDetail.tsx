/**
 * What is bespoke, named — and what is merely well chosen, said so.
 *
 * SRD §2.2 asks the display to make the distinction visible rather than hiding it, and
 * FR-017 makes it specific: a component claimed as bespoke has to name the logic that
 * makes it so. An unnamed claim of novelty is exactly the sort of thing this repository
 * exists not to make, and a display that asserted "bespoke" against fourteen boxes with
 * nothing behind it would claim far more than drogna built.
 *
 * FR-018 is the constraint this component is written against. It takes the illumination
 * as a prop and passes it through untouched: there is no path here that could light a
 * component, no default that could stand in for a heartbeat, and nothing that changes
 * with classification except the words and the appearance. A bespoke component whose
 * heartbeat stops greys out exactly as any other does.
 */
import type { Illumination } from "../liveness/types";
import { ILLUMINATION } from "../ui/states";

import { CONCERN_WORDS, concernsFor } from "./classification";
import type { ComponentKind } from "./classification";

export interface BespokeDetailProps {
  readonly componentId: string;
  readonly name: string;
  readonly kind: ComponentKind;
  /**
   * Whatever the liveness reducer decided, passed through.
   *
   * A prop rather than something this component works out, because working it out is the
   * one thing FR-018 forbids: classification changes appearance, and only liveness
   * changes illumination.
   */
  readonly illumination: Illumination;
}

const KIND_WORDS: Readonly<Record<ComponentKind, string>> = {
  bespoke: "bespoke core",
  plumbing: "well-chosen plumbing",
};

export function BespokeDetail({
  componentId,
  name,
  kind,
  illumination,
}: BespokeDetailProps): JSX.Element {
  const concerns = concernsFor(componentId);
  const appearance = ILLUMINATION[illumination];
  return (
    <section
      className={`bespoke-detail kind-${kind} ${appearance.className}`}
      data-testid={`bespoke-detail-${componentId}`}
      data-kind={kind}
      data-illumination={illumination}
    >
      <h3>
        {name} — {KIND_WORDS[kind]}
      </h3>
      <p className="illumination" data-testid={`bespoke-illumination-${componentId}`}>
        <span aria-hidden="true">{appearance.glyph} </span>
        {appearance.label}. Classification says what this is; only a heartbeat says whether it
        is running, and this line comes from the heartbeat.
      </p>
      {kind === "bespoke" ? (
        <>
          <p>What was written for drogna here:</p>
          <ul data-testid={`bespoke-concerns-${componentId}`}>
            {concerns.map((concern) => (
              <li key={concern} data-concern={concern}>
                {CONCERN_WORDS[concern]}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p data-testid={`plumbing-note-${componentId}`}>
          A standard part used as intended, or the scaffolding around one. Chosen, not
          invented, and claimed as nothing more.
        </p>
      )}
    </section>
  );
}
