/**
 * The Messages tab (FR-23 seed, E4): live seam traffic, each received message
 * validated against the master its topic declares, with a running refusal count —
 * "0 refused by their schema" is itself a claim this display makes and the tests
 * check. The full topic-tree view lands at beat 103.
 *
 * Narrow (feature 112, FR-010, FR-011, FR-016): the primary surface is the list, which
 * is what the tab is for. Three columns at 390px are three columns of about 130px each.
 * The topic tree discloses; the selected document is shown *over* the list with a
 * control that goes back, rather than beside it. Nothing is removed — with the
 * disclosure open the panel offers what it offers at a desktop width.
 *
 * The panel measures its own root, so a panel docked narrow on a large display is
 * treated the same as a phone. It is told nothing about which presentation it is in.
 */
import { useEffect, useRef, useState } from 'react';
import type { PanelProps } from '../../shell/registry.js';
import { Disclosure } from '../../shell/Disclosure.js';
import { useIsNarrow } from '../../shell/viewport.js';
import { topicMatchesFilter } from './topic-match.js';
import { TopicTree } from './TopicTree.js';

interface Row {
  seq: number;
  topic: string;
  summary: string;
  refusals: readonly string[];
}

export function MessagesPanel({ params }: PanelProps) {
  const { config, client, validator } = params;
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [selected, setSelected] = useState<Row | undefined>();
  // Heartbeats and clock samples are most of the traffic and rarely what a reader
  // came for: both hidden from the list by default, each displayable by its own
  // toggle. Display only — every message, the suppressed kinds included, is still
  // received, validated and counted, so the refusal claim keeps its full coverage
  // whatever is showing.
  const [showHeartbeats, setShowHeartbeats] = useState(false);
  const [showClock, setShowClock] = useState(false);
  const counters = useRef({ received: 0, refused: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useIsNarrow(rootRef);
  // Narrow, the document covers the list; the list is still mounted and still where the
  // viewer left it, because going back to a list that has jumped to the top is going
  // back to a different list.
  const covered = narrow && selected !== undefined;

  useEffect(() => {
    return client.subscribe(config.topics.all, (message) => {
      counters.current.received += 1;
      const mapping = config.message_schemas.find((entry) =>
        topicMatchesFilter(entry.filter, message.topic),
      );
      const refusals = mapping
        ? validator.validate(mapping.schema, message.payload).refusals
        : [`no master declared for topic '${message.topic}'`];
      if (refusals.length > 0) counters.current.refused += 1;
      const row: Row = {
        seq: counters.current.received,
        topic: message.topic,
        summary: JSON.stringify(message.payload),
        refusals,
      };
      setRows((previous) => {
        const next = [row, ...previous];
        return next.length > config.messages.buffer ? next.slice(0, config.messages.buffer) : next;
      });
    });
  }, [client, config, validator]);

  return (
    <div className="panel messages-panel" ref={rootRef} data-narrow={narrow}>
      <p className="messages-counters" data-testid="refusal-counter">
        {counters.current.received} received · {counters.current.refused} refused by their schema
        <label className="messages-suppression-toggle">
          <input
            type="checkbox"
            checked={showHeartbeats}
            onChange={(event) => setShowHeartbeats(event.target.checked)}
          />{' '}
          show heartbeats
        </label>
        <label className="messages-suppression-toggle">
          <input
            type="checkbox"
            checked={showClock}
            onChange={(event) => setShowClock(event.target.checked)}
          />{' '}
          show clock
        </label>
        <span className="messages-suppression-note">(counted and validated either way)</span>
      </p>
      <div className="messages-split">
        <Disclosure label="topic tree" narrow={narrow} className="messages-tree-disclosure">
          <TopicTree client={client} />
        </Disclosure>
        <div className="messages-list-scroll">
        <table className="messages-list" aria-hidden={covered || undefined}>
          <tbody>
            {rows
              .filter(
                (row) =>
                  (showHeartbeats || !topicMatchesFilter(config.topics.heartbeat, row.topic)) &&
                  (showClock || !topicMatchesFilter(config.topics.clock, row.topic)),
              )
              .map((row) => (
                <tr
                  key={row.seq}
                  className={row.refusals.length > 0 ? 'message-refused' : ''}
                  onClick={() => setSelected(row)}
                >
                  <td className="message-seq">{row.seq}</td>
                  <td className="message-topic">{row.topic}</td>
                  <td className="message-summary">{row.summary}</td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
        <div className="message-detail" data-covering={covered}>
          {selected ? (
            <>
              {narrow && (
                <button type="button" className="message-back" onClick={() => setSelected(undefined)}>
                  ← back to the list
                </button>
              )}
              <h3>{selected.topic}</h3>
              {selected.refusals.length > 0 && (
                <p className="shell-refusal">{selected.refusals.join('; ')}</p>
              )}
              <pre>{JSON.stringify(JSON.parse(selected.summary), null, 2)}</pre>
            </>
          ) : (
            <p className="panel-footnote">select a message to inspect it</p>
          )}
        </div>
      </div>
    </div>
  );
}
