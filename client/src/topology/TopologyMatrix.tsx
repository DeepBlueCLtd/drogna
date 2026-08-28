/**
 * Who may say what to whom, drawn from the artefact and lit only by real traffic.
 *
 * The structural companion to the loop view's temporal picture: components against
 * topics, a mark where the access control list permits a publish, another where it
 * permits a subscription, and the forbidden region — the broker's default refusal —
 * visibly distinct from cells that are permitted and merely quiet (FR-007). Every
 * structural mark is read from `contracts/topology.json`, the generated and gated
 * artefact; none from a value written in this source (SC-004).
 *
 * Lighting is the other source and it never mixes with the first: a row lights because a
 * message genuinely arrived on this page's own subscription, with the count that says how
 * many, and it flashes on the frame the loop view drew that arrival's transit — the same
 * batch, so the two pictures agree about what just happened. Lighting is per topic
 * because MQTT does not carry the sender; the dot on a cell whose component names the
 * topic in its own source is the artefact's narrowing, and the legend says exactly that
 * rather than letting a lit cell read as "this component spoke".
 *
 * The deliberate geometry the spec wants visible falls straight out of the two layers:
 * the sensors' row is empty across the control topics (ADR-0012 confines them to the
 * observation branch plus heartbeat and clock), and the observation branch is read by
 * ingest, monitor and planner on purpose. Selecting a cell opens the same message
 * inspector 012 delivered — not a second implementation — on that topic's last real
 * payload, or on its stated absence.
 */
import { useState } from "react";

import { mostRecent } from "../data/buffers";
import type { LoopState } from "../data/controlSubscription";
import { MessageInspector } from "../inspector/MessageInspector";
import { INDEX_STANDARD } from "../readpath/standards";
import { StandardBadge } from "../readpath/StandardBadge";

import { TOPOLOGY } from "./artefact";
import { matrixRows, matrixTraffic, trafficFor } from "./matrix";

export interface TopologyMatrixProps {
  readonly loop: LoopState;
  /** The site's standards root, for this pane's own delivery badge. */
  readonly standardsUrl: string | undefined;
}

const ROWS = matrixRows(TOPOLOGY);

export function TopologyMatrix({ loop, standardsUrl }: TopologyMatrixProps): JSX.Element {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const traffic = matrixTraffic(TOPOLOGY, loop.buffers);
  const flashing = new Set(loop.lastFrame.transits.flatMap((transit) => transit.topics));
  const components = TOPOLOGY.components;
  return (
    <details className="topology" data-testid="topology-matrix">
      <summary>
        Who may say what to whom — the topology, lit only by traffic this page received
      </summary>
      <p>
        The structure below — every mark, and the forbidden region — is read from{" "}
        <code>{TOPOLOGY.generator}</code>&apos;s generated artefact, which a drift gate
        holds current against the tree. The marks are the broker&apos;s <em>permissions</em>,
        not behaviour: a row lights only when a message genuinely arrives on this
        page&apos;s subscription, and the page cannot see who published it — the dot marks
        the components whose own source names the topic, which is the artefact&apos;s
        narrowing, not an observation.{" "}
        <StandardBadge standard={INDEX_STANDARD} standardsUrl={standardsUrl} />
      </p>
      <div className="topology-scroll">
        <table className="topology-table">
          <thead>
            <tr>
              <th scope="col">topic</th>
              <th scope="col">heard</th>
              {components.map((component) => (
                <th key={component.id} scope="col">
                  <span className="topology-component">{component.id}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const heard = trafficFor(traffic, row.topic.topic);
              const lit = heard.received > 0;
              const flash = heard.topics.some((topic) => flashing.has(topic));
              return (
                <tr
                  key={row.topic.topic}
                  data-testid={`topology-row-${row.topic.topic}`}
                  data-lit={String(lit)}
                  data-flash={String(flash)}
                >
                  <th scope="row">
                    <code>{row.topic.topic}</code>
                  </th>
                  <td className="topology-heard" data-testid={`topology-heard-${row.topic.topic}`}>
                    {lit ? `${heard.received} received` : "quiet since load"}
                  </td>
                  {row.cells.map((cell) => (
                    <td
                      key={cell.component}
                      className={cell.forbidden ? "topology-forbidden" : lit ? "topology-lit" : "topology-quiet"}
                      data-testid={`topology-cell-${row.topic.topic}-${cell.component}`}
                      data-forbidden={String(cell.forbidden)}
                    >
                      {cell.forbidden ? (
                        <span aria-label="refused by the access control list">·</span>
                      ) : (
                        <button
                          type="button"
                          className="topology-cell-button"
                          onClick={() => {
                            setSelectedTopic(heard.lastTopic ?? row.topic.topic);
                          }}
                        >
                          {cell.mayPublish ? "P" : ""}
                          {cell.maySubscribe ? "S" : ""}
                          {cell.namesIt ? "•" : ""}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {traffic.undeclared.map((entry) => (
              <tr
                key={entry.topic}
                className="topology-undeclared"
                data-testid={`topology-undeclared-${entry.topic}`}
              >
                <th scope="row">
                  <code>{entry.topic}</code> — undeclared
                </th>
                <td className="topology-heard">{entry.received} received</td>
                <td colSpan={components.length}>
                  <button
                    type="button"
                    className="topology-cell-button"
                    onClick={() => {
                      setSelectedTopic(entry.topic);
                    }}
                  >
                    Traffic arrived on a topic the artefact does not declare. The tree is
                    the authority and the artefact is a claim about it; this contradiction
                    is shown, not dropped, and the drift gate makes it transient.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="legend topology-legend">
        <dt>P / S</dt>
        <dd>
          the access control list permits this component&apos;s role to publish / subscribe
          here. A permission, never a claim that anything was sent.
        </dd>
        <dt>•</dt>
        <dd>
          this component&apos;s own source names the topic — the artefact&apos;s narrowing
          of a coarse permission, with file and line recorded in the artefact.
        </dd>
        <dt>·</dt>
        <dd>
          forbidden: the list grants this component neither direction, and the broker
          denies by default. Visibly not the same as permitted-but-quiet.
        </dd>
        <dt>lit row</dt>
        <dd>
          traffic genuinely received on this page&apos;s subscription since it loaded, with
          the count; a row this page is not permitted to hear stays honest by staying quiet.
        </dd>
      </dl>
      {selectedTopic === null ? (
        <p data-testid="topology-unselected">
          Select a cell to open its topic in the message inspector: the governing schema
          beside the last real payload, or the stated absence of one.
        </p>
      ) : (
        <MessageInspector boundary={selectedTopic} message={mostRecent(loop.buffers, selectedTopic)} />
      )}
    </details>
  );
}
