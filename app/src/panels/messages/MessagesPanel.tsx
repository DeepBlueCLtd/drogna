/**
 * The Messages tab (FR-23 seed, E4): live seam traffic, each received message
 * validated against the master its topic declares, with a running refusal count —
 * "0 refused by their schema" is itself a claim this display makes and the tests
 * check. The full topic-tree view lands at beat 103.
 */
import { useEffect, useRef, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import type { PanelParams } from '../../shell/Shell.js';
import { topicMatchesFilter } from './topic-match.js';
import { TopicTree } from './TopicTree.js';

interface Row {
  seq: number;
  topic: string;
  summary: string;
  refusals: readonly string[];
}

export function MessagesPanel({ params }: IDockviewPanelProps<PanelParams>) {
  const { config, client, validator } = params;
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [selected, setSelected] = useState<Row | undefined>();
  const counters = useRef({ received: 0, refused: 0 });

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
    <div className="panel messages-panel">
      <p className="messages-counters" data-testid="refusal-counter">
        {counters.current.received} received · {counters.current.refused} refused by their schema
      </p>
      <div className="messages-split">
        <TopicTree client={client} />
        <table className="messages-list">
          <tbody>
            {rows.map((row) => (
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
        <div className="message-detail">
          {selected ? (
            <>
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
