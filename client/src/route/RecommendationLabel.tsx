/**
 * The route is a recommendation, and the page says so where a viewer will read it.
 *
 * Constitution VIII and FR-028. Rendering a recommendation is explicitly permitted;
 * commanding is not, and the interface offers no way to. There is no button here, no
 * form, no verb in the imperative and nothing addressed to anybody. That is not an
 * oversight to be corrected later — the harness is headless with respect to decisions,
 * and a control to accept a route would be the one thing in this client that made a
 * decision on somebody's behalf.
 *
 * The planner's own message carries the same guarantee structurally: every string property
 * in it is an enumeration, a constant, an identifier or an instant, so there is nowhere a
 * sentence addressed to a person could be written. This label is the display's half.
 *
 * An empty route is rendered with the reason the planner gave (FR-029). A planner that
 * always recommends motion is a planner nobody can trust when it recommends motion, so an
 * empty route is a result, and the reason is the interesting part of it.
 */
import type { RouteDisplay } from "./RouteLayer";

/**
 * The label, worded without reciting the verbs it denies.
 *
 * "Nothing here accepts, tasks or executes anything" would be true and would put those
 * words on the screen, where the vocabulary test that guards this cannot tell a denial
 * from an offer — and neither, at a glance, can a reader skimming. So the sentence says
 * what is true positively: it is advice, it is addressed to nobody, and no control exists
 * to make it more than that.
 */
export const RECOMMENDATION_WORDS =
  "This is a recommendation. It is where sampling would most reduce uncertainty, given the " +
  "uncertainty field the planner read and the budget it was given. It is advice and not an " +
  "instruction: it has no addressee, nothing on this page can turn it into one, and nothing " +
  "downstream is waiting to be told.";

/** The planner's reasons for an empty route, in words a viewer reads. */
export const EMPTY_REASON_WORDS: Readonly<Record<string, string>> = {
  "no-field": "no uncertainty field had been published, so there was nothing to plan against.",
  "budget-too-small": "the traversal budget was too small to reach anything worth sampling.",
  "nothing-worth-sampling":
    "nothing in the domain was uncertain enough to be worth sampling under this budget.",
};

export function RecommendationLabel({ route }: { readonly route: RouteDisplay | null }): JSX.Element {
  if (route === null) {
    return (
      <section className="panel recommendation" data-testid="recommendation-label" data-state="unheard">
        <h2>Recommended sampling route</h2>
        <p data-testid="no-plan">
          No plan has been published. Nothing is drawn on the map in its place: a straight
          line between two points would be this page inventing a recommendation, which is the
          one thing it must not do.
        </p>
      </section>
    );
  }
  const empty = route.vertices.length === 0;
  return (
    <section
      className="panel recommendation"
      data-testid="recommendation-label"
      data-state={empty ? "empty" : "recommended"}
      data-plan={route.planId}
    >
      <h2>Recommended sampling route</h2>
      <p className="recommendation-words" data-testid="recommendation-words">
        {RECOMMENDATION_WORDS}
      </p>
      {empty ? (
        <p data-testid="empty-route-reason">
          The planner recommends no route:{" "}
          {route.emptyReason === null
            ? `it reported the state "${route.state}" and gave no reason.`
            : (EMPTY_REASON_WORDS[route.emptyReason] ?? route.emptyReason)}{" "}
          An empty route is a result, not a failure to produce one.
        </p>
      ) : (
        <dl data-testid="route-summary">
          <dt>Vertices</dt>
          <dd data-testid="route-vertex-count">{route.vertices.length}</dd>
          <dt>Cells considered</dt>
          <dd data-testid="route-candidates">
            {route.candidateCellCount}, of which {route.visitedCellCount} were chosen
          </dd>
          <dt>Value</dt>
          <dd data-testid="route-value">
            {route.value} (collapse-aware: what earlier visits resolve is already inside this
            number, and must not be added again)
          </dd>
          <dt>Budget</dt>
          <dd data-testid="route-budget">
            {route.consumedSeconds} s of simulation time consumed, of {route.budgetSeconds} s
          </dd>
          <dt>Distance</dt>
          <dd data-testid="route-distance">{route.distanceM} m, horizontally</dd>
          <dt>Planning resolution</dt>
          <dd data-testid="route-resolution">H3 resolution {route.h3Resolution}</dd>
        </dl>
      )}
      {route.supersedes === null ? null : (
        <p data-testid="route-supersedes">
          This recommendation replaces plan {route.supersedes}.
        </p>
      )}
    </section>
  );
}
