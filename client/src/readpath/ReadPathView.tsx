/**
 * The read path, drawn from the traffic this browser genuinely produced.
 *
 * The query-side twin of the message inspector: 012 lets a viewer read the byte that
 * crossed a command boundary, and this pane lets the same viewer read the request that
 * just crossed the read path — coverage store to query layer to proxy to this browser —
 * with every edge labelled by the standard that governs it (FR-003). Selecting an edge
 * reveals the last crossing in full; the two server-side hops are drawn marked inferred,
 * with the marking saying what is actually known and from where (FR-004). A boundary
 * nothing has crossed says so, a failed read is shown as the failure it was, and the
 * bounded history is browsable backwards with its bound stated (FR-006, FR-009).
 *
 * Everything drawn here traces to a request the client made and a response it received,
 * delivered through `observedRead` and through nothing else. This component holds
 * selection state and words; it cannot cause a request (the re-ask press is handed to
 * the page, which asks through the same instrumented reader the loop uses), cannot light
 * a component, and renders absence as a sentence rather than as an empty panel.
 */
import { useState } from "react";

import { BOUNDARIES_BY_ID } from "../legibility/classification";

import { latestCrossing, READ_KIND_WORDS, RE_ASK_MINIMUM_INTERVAL_MS } from "./crossings";
import type { Crossing, ReadKind, ReadPathState, ReAskGate } from "./crossings";
import { knownAbout, READ_PATH_EDGES } from "./edges";
import type { ReadPathEdge } from "./edges";
import { STANDARDS } from "./standards";
import { StandardBadge } from "./StandardBadge";

/** What a press of the re-ask control would do right now, decided by the page. */
export interface ReAskOffer {
  /** The kind of read a press would issue, or null where nothing can be asked yet. */
  readonly kind: ReadKind | null;
  /** Why nothing can be asked, where kind is null. */
  readonly unavailableBecause: string | null;
  /** The rate and in-flight bounds, computed against the page's host instant. */
  readonly gate: ReAskGate;
}

export interface ReadPathViewProps {
  readonly state: ReadPathState;
  /** The site's standards root, from the served configuration document. */
  readonly standardsUrl: string | undefined;
  readonly reAsk: ReAskOffer;
  readonly onReAsk: () => void;
  /**
   * The edge open on first render, for a caller that starts on a selection — the same
   * idiom the map's `initialMode` established. Selection state; it cannot cause a read.
   */
  readonly initialEdge?: string;
}

const OUTCOME_WORDS: Readonly<Record<Crossing["outcome"], string>> = {
  answered: "answered",
  refused: "received, and refused",
  failed: "failed — no response arrived",
};

function CrossingFacts({ crossing, edge, standardsUrl }: { crossing: Crossing; edge: ReadPathEdge; standardsUrl: string | undefined }): JSX.Element {
  return (
    <>
      <dl className="message-facts">
        <dt>What was read</dt>
        <dd data-testid="crossing-kind">{READ_KIND_WORDS[crossing.kind]}</dd>
        <dt>Request</dt>
        <dd data-testid="crossing-request">
          <code>{crossing.requestLine}</code>
        </dd>
        <dt>Outcome</dt>
        <dd data-testid="crossing-outcome" data-outcome={crossing.outcome}>
          {OUTCOME_WORDS[crossing.outcome]}
          {crossing.status === null ? "" : ` (HTTP ${crossing.status})`}
        </dd>
        <dt>Declared type and size</dt>
        <dd data-testid="crossing-response-facts">
          {crossing.declaredType ?? "no content type declared"}
          {crossing.bodyBytes === null ? ", no body received" : `, ${crossing.bodyBytes} bytes`}
        </dd>
        <dt>Simulation time carried</dt>
        <dd data-testid="crossing-sim-time">
          {crossing.simTime ?? "none was recognised in the response"}
        </dd>
        <dt>Governing standard on this edge</dt>
        <dd data-testid="crossing-standard">
          {edge.standard} — {edge.governs}.{" "}
          <StandardBadge standard={STANDARDS[edge.standard]} standardsUrl={standardsUrl} />
        </dd>
      </dl>
      {crossing.failure === null ? null : (
        <p className="failure" data-testid="crossing-failure">
          What the client actually received: {crossing.failure}
        </p>
      )}
      {crossing.excerpt === null ? (
        <p data-testid="crossing-no-body">No response body arrived, so there is nothing to excerpt.</p>
      ) : (
        <>
          <pre data-testid="crossing-excerpt">{crossing.excerpt}</pre>
          {crossing.excerptDroppedBytes === 0 ? null : (
            <p className="schema-truncated" data-testid="crossing-truncated">
              Truncated: the response was {crossing.bodyBytes} bytes and the history retains
              the first {crossing.excerpt.length} characters of it. The facts above describe
              the whole response; only the stored excerpt is shortened.
            </p>
          )}
        </>
      )}
    </>
  );
}

function EdgeDetail({ edge, state, shown, onShow, standardsUrl }: {
  readonly edge: ReadPathEdge;
  readonly state: ReadPathState;
  /** The sequence of the crossing being read, or null for the most recent. */
  readonly shown: number | null;
  readonly onShow: (sequence: number | null) => void;
  readonly standardsUrl: string | undefined;
}): JSX.Element {
  const classification = BOUNDARIES_BY_ID.get(edge.id);
  const latest = latestCrossing(state);
  const crossing =
    shown === null ? latest : (state.crossings.find((entry) => entry.sequence === shown) ?? latest);
  return (
    <div className="read-path-detail" data-testid="read-path-detail" data-edge={edge.id}>
      {classification === undefined ? null : (
        <p className="boundary-classification" data-testid="read-path-classification" data-kind={classification.kind}>
          {classification.from} → {classification.to}. Classified{" "}
          <strong>{classification.kind === "bespoke" ? "bespoke core" : "well-chosen plumbing"}</strong>:{" "}
          {classification.because}.
        </p>
      )}
      {crossing === null ? (
        <p data-testid="read-path-empty">
          Nothing has crossed this boundary since the page loaded: the client has issued no
          read, so there is no crossing to show. This is the absence of traffic, not the
          absence of a display. The re-ask control below can produce a genuine one once a
          route or a run gives it something to ask about.
        </p>
      ) : (
        <>
          <p className="read-path-witness" data-testid="read-path-witness" data-witness={edge.witness}>
            <strong>{edge.witness === "witnessed" ? "Witnessed" : "Inferred, not witnessed"}.</strong>{" "}
            {knownAbout(edge, crossing)}
          </p>
          <CrossingFacts crossing={crossing} edge={edge} standardsUrl={standardsUrl} />
          <div className="read-path-history" data-testid="read-path-history">
            <p>
              History on this edge: {state.crossings.length} crossing
              {state.crossings.length === 1 ? "" : "s"} retained of {state.recorded} recorded
              since the page loaded, oldest evicted first beyond the bound of {state.depth};{" "}
              {state.evicted} evicted so far.
            </p>
            {state.crossings.length < 2 ? null : (
              <nav aria-label="Browse this edge's earlier crossings">
                {state.crossings.map((entry) => (
                  <button
                    key={entry.sequence}
                    type="button"
                    data-testid={`crossing-${entry.sequence}`}
                    data-selected={String(entry.sequence === crossing.sequence)}
                    aria-pressed={entry.sequence === crossing.sequence}
                    onClick={() => {
                      onShow(entry.sequence === latest?.sequence ? null : entry.sequence);
                    }}
                  >
                    #{entry.sequence} {entry.kind} {OUTCOME_WORDS[entry.outcome]}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ReadPathView({ state, standardsUrl, reAsk, onReAsk, initialEdge }: ReadPathViewProps): JSX.Element {
  const [selectedEdge, setSelectedEdge] = useState<string | null>(initialEdge ?? null);
  const [shownSequence, setShownSequence] = useState<number | null>(null);
  const edge = READ_PATH_EDGES.find((candidate) => candidate.id === selectedEdge) ?? null;
  const disabled = reAsk.kind === null || !reAsk.gate.allowed;
  const disabledBecause =
    reAsk.kind === null
      ? reAsk.unavailableBecause
      : reAsk.gate.allowed
        ? null
        : reAsk.gate.because;
  return (
    <section className="inspector read-path" data-testid="read-path">
      <h2>The read path</h2>
      <p>
        Reads are served only through published standards — that is the architecture's
        central bet, and this pane is its window. Three boundaries, each labelled by the
        standard that governs it; every crossing drawn below traces to a request this
        browser genuinely made and the response it genuinely received. Select a boundary
        to read the last crossing in full.
      </p>
      <nav className="boundary-picker" aria-label="Choose a read-path boundary to inspect">
        {READ_PATH_EDGES.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            data-testid={`read-path-edge-${candidate.id}`}
            data-selected={String(candidate.id === selectedEdge)}
            data-witness={candidate.witness}
            aria-pressed={candidate.id === selectedEdge}
            onClick={() => {
              setSelectedEdge(candidate.id === selectedEdge ? null : candidate.id);
              setShownSequence(null);
            }}
          >
            {candidate.title} — {candidate.standard}
            {candidate.witness === "inferred" ? " (inferred)" : ""}
          </button>
        ))}
      </nav>
      {edge === null ? (
        <p data-testid="read-path-unselected">
          No boundary selected. Each hop above is drawn from the same recorded crossings;
          the two server-side hops are marked inferred because this browser cannot witness
          them, and selecting one says exactly what is known instead.
        </p>
      ) : (
        <EdgeDetail
          edge={edge}
          state={state}
          shown={shownSequence}
          onShow={setShownSequence}
          standardsUrl={standardsUrl}
        />
      )}
      <div className="read-path-reask" data-testid="read-path-reask">
        <button type="button" data-testid="reask-button" disabled={disabled} onClick={onReAsk}>
          Ask again
        </button>
        <p data-testid="reask-words">
          {reAsk.kind === null
            ? `Nothing can be re-asked yet: ${reAsk.unavailableBecause ?? "the client has no read to repeat"}.`
            : `Pressing this issues one genuine request the client already makes — ${READ_KIND_WORDS[reAsk.kind]} — and draws the crossing from the real response. Never a replay.`}{" "}
          At most one re-ask per {Math.round(RE_ASK_MINIMUM_INTERVAL_MS / 1000)} seconds, and
          never while one is in flight.
          {disabledBecause === null || reAsk.kind === null ? "" : ` Disabled now: ${disabledBecause}.`}
        </p>
      </div>
    </section>
  );
}
