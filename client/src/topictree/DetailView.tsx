/**
 * The selected node, accounted for (022 US3): the last payload as it came, the
 * simulation-time stats with the acceleration factor shown by the panel header, the
 * roles that would hear a message here with the access each holds — the exploitation
 * story made concrete — and the master governing the payloads. Facts not observed are
 * written as not observed; a blank would read as zero and a zero would be invented.
 */
import type { SelectionDetail } from "./detail";

const TIER_SENTENCES: Readonly<Record<SelectionDetail["tier"], string>> = {
  declared: "Declared: this topic is a row of the derived topology.",
  "observed-under-declaration":
    "Observed under a declared wildcard; the deployed configuration does not name it.",
  undeclared:
    "Undeclared: no declared filter covers this topic. That is a finding about the " +
    "topology, shown rather than absorbed.",
};

export function DetailView({ detail }: { readonly detail: SelectionDetail }): JSX.Element {
  return (
    <div className="tt-detail" data-testid="tt-detail">
      <h3>
        <code>{detail.path}</code>
      </h3>
      <p className="tt-detail-tier">{TIER_SENTENCES[detail.tier]}</p>
      <dl>
        <dt>Last arrival (simulation time)</dt>
        <dd data-testid="tt-detail-arrival">
          {detail.arrivals === 0
            ? "not yet observed"
            : (detail.lastArrivalSimTime ?? "arrived before any clock sample was heard")}
        </dd>
        <dt>Arrivals this session</dt>
        <dd data-testid="tt-detail-count">
          {detail.arrivals === 0 ? "not yet observed" : detail.arrivals}
        </dd>
        <dt>Recent rate</dt>
        <dd data-testid="tt-detail-rate">
          {detail.ratePerSimulationSecond === null
            ? "not statable yet — too few simulation-stamped arrivals, or a stopped clock"
            : `${detail.ratePerSimulationSecond.toPrecision(3)} per simulation second`}
        </dd>
        <dt>Roles holding a matching filter</dt>
        <dd data-testid="tt-detail-roles">
          {detail.roles.length === 0 ? (
            "none — no declared filter matches this topic"
          ) : (
            <ul>
              {detail.roles.map((entry) => (
                <li key={`${entry.role}:${entry.filter}:${entry.access}`}>
                  <code>{entry.role}</code> — <code>{entry.access}</code> on{" "}
                  <code>{entry.filter}</code>
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>Governing schema</dt>
        <dd data-testid="tt-detail-schema">
          {detail.schema === null
            ? "none declared"
            : detail.schemaInherited
              ? `${detail.schema} (the covering branch's master, lent)`
              : detail.schema}
        </dd>
        <dt>Last payload</dt>
        <dd data-testid="tt-detail-payload">
          {detail.payload.kind === "unobserved" ? (
            "not yet observed"
          ) : (
            <>
              {detail.payload.kind === "raw" ? (
                <p className="tt-payload-reason">{detail.payload.reason}</p>
              ) : null}
              <pre className="tt-payload">
                {detail.payload.kind === "json" ? detail.payload.pretty : detail.payload.shown}
              </pre>
            </>
          )}
        </dd>
      </dl>
    </div>
  );
}
