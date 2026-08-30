/**
 * The Messages tab (FR-23, FR-24, and feature 114's FR-66 to FR-68): live seam traffic,
 * every received message validated against the master its topic declares, with a running
 * refusal count — "0 refused by their schema" is itself a claim this display makes and
 * the tests check.
 *
 * Feature 114 reorders the tab into **motion, tree, inspector**, in that order down the
 * page. The traffic display leads because it is what reads from across a room: stop the
 * sensors from Operator and the observation lane drains while the clock lane goes on
 * beating, with nothing refreshed and no number read. The topic tree comes out of the
 * disclosure it spent three features behind and becomes a primary region, and selecting
 * a node filters both the traffic display and the list to that subtree. The inspector
 * renders a payload against its master rather than as a blob, marking a refusal on the
 * field that caused it.
 *
 * **The list stays.** Messages does not exercise feature 114's table-replacement licence:
 * the traffic display shows *that* and *where*, and the list shows *what*, and neither is
 * the other's fallback. Every message the panel receives is still validated and still
 * counted, the kinds suppressed from the list included, so the refusal claim keeps its
 * full coverage whatever is showing (FR-23).
 *
 * Narrow (feature 112, FR-010, FR-011, FR-016): the traffic display is the primary
 * surface and keeps its full lane set at every width — folding a lane would be the
 * narrow presentation changing *whether* a namespace is drawn, which FR-50 forbids. The
 * tree and the list disclose beneath it, and a selected document is shown *over* the list
 * with a control that goes back.
 *
 * The panel measures its own root, so a panel docked narrow on a large display is
 * treated the same as a phone. It is told nothing about which presentation it is in.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PanelProps } from '../../shell/registry.js';
import { Disclosure } from '../../shell/Disclosure.js';
import { useIsNarrow } from '../../shell/viewport.js';
import { HelpButton } from '../../shell/walkthrough/HelpButton.js';
import { messagesTour } from '../../shell/walkthrough/tour.js';
import { topology } from '../../generated/topology.js';
import { schemaDocuments } from '../../generated/schema-documents.js';
import { topicMatchesFilter } from './topic-match.js';
import { TopicTree } from './TopicTree.js';
import { TrafficDisplay } from './TrafficDisplay.js';
import {
  declaredNamespaces,
  declaredTopics,
  laneIdFor,
  underFilter,
  type TrafficMark,
} from './traffic.js';
import { documentFaults, inspectFields, type SchemaNode } from './inspect.js';
import './messages.css';

interface Row {
  seq: number;
  topic: string;
  payload: unknown;
  summary: string;
  /** The master the topic declares, or undefined where none is declared. */
  schema?: string;
  refusals: readonly string[];
  faults: readonly { readonly path: string; readonly message: string }[];
}

/**
 * The regions this panel declares, and the authority its tour is held to (FR-70). A
 * region added here with no step is named by `missingSteps`; a step naming a region that
 * is not here is named too. The bound is this list rather than a number typed into a
 * test, so a fifth region cannot arrive unstepped (CLAUDE.md, lesson 2).
 */
export const MESSAGES_REGIONS = [
  { id: 'traffic', label: 'the traffic display', element: '[data-region="traffic"]' },
  { id: 'tree', label: 'the topic tree', element: '[data-region="tree"]' },
  { id: 'list', label: 'the list', element: '[data-region="list"]' },
  { id: 'inspector', label: 'the inspector', element: '[data-region="inspector"]' },
] as const;

export function MessagesPanel({ params }: PanelProps) {
  const { config, client, validator } = params;
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [marks, setMarks] = useState<readonly TrafficMark[]>([]);
  const [selectedSeq, setSelectedSeq] = useState<number | undefined>();
  const [filter, setFilter] = useState<string | undefined>();
  const [showRaw, setShowRaw] = useState(false);
  // Heartbeats and clock samples are most of the traffic and rarely what a reader
  // came for: both hidden from the *list* by default, each displayable by its own
  // toggle. Display only — every message, the suppressed kinds included, is still
  // received, validated and counted, so the refusal claim keeps its full coverage
  // whatever is showing. The traffic display draws them either way: a lane that
  // hid the clock would be the one lane whose stillness meant nothing.
  const [showHeartbeats, setShowHeartbeats] = useState(false);
  const [showClock, setShowClock] = useState(false);
  const counters = useRef({ received: 0, refused: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const narrow = useIsNarrow(rootRef);
  const selected = rows.find((row) => row.seq === selectedSeq);
  // Narrow, the document covers the list; the list is still mounted and still where the
  // viewer left it, because going back to a list that has jumped to the top is going
  // back to a different list.
  const covered = narrow && selected !== undefined;
  const namespaces = useMemo(() => declaredNamespaces(topology.topics), []);
  // The places the artefact declares, so a topic nobody declared lands in an undeclared
  // lane rather than passing as ordinary traffic in a namespace somebody did declare.
  const places = useMemo(() => declaredTopics(topology.topics), []);

  useEffect(() => {
    return client.subscribe(config.topics.all, (message) => {
      counters.current.received += 1;
      const seq = counters.current.received;
      const mapping = config.message_schemas.find((entry) =>
        topicMatchesFilter(entry.filter, message.topic),
      );
      const verdict = mapping
        ? validator.validate(mapping.schema, message.payload)
        : {
            ok: false,
            refusals: [`no master declared for topic '${message.topic}'`],
            faults: [{ path: '', message: `no master declared for topic '${message.topic}'` }],
          };
      if (!verdict.ok) counters.current.refused += 1;
      const row: Row = {
        seq,
        topic: message.topic,
        payload: message.payload,
        summary: JSON.stringify(message.payload),
        schema: mapping?.schema,
        refusals: verdict.refusals,
        faults: verdict.faults,
      };
      setRows((previous) => {
        const next = [row, ...previous];
        return next.length > config.messages.buffer ? next.slice(0, config.messages.buffer) : next;
      });
      setMarks((previous) => {
        const next = [
          ...previous,
          {
            seq,
            topic: message.topic,
            lane: laneIdFor(message.topic, places),
            refused: !verdict.ok,
          },
        ];
        // Bounded by the same buffer the list is: two views of one stream, held to one
        // declared depth rather than to two numbers that could disagree.
        return next.length > config.messages.buffer ? next.slice(-config.messages.buffer) : next;
      });
    });
  }, [client, config, places, validator]);

  const listed = rows.filter(
    (row) =>
      (showHeartbeats || !topicMatchesFilter(config.topics.heartbeat, row.topic)) &&
      (showClock || !topicMatchesFilter(config.topics.clock, row.topic)) &&
      underFilter(row.topic, filter),
  );

  return (
    <div className="panel messages-panel" ref={rootRef} data-narrow={narrow}>
      <div className="panel-head">
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
          <span className="messages-suppression-note">
            (in the list; counted, validated and drawn either way)
          </span>
        </p>
        {/* The panel carries its own help control (FR-70, ADR-0037): a tab with a tour
            shows one, and a tab without shows nothing. */}
        <HelpButton tour={messagesTour()} />
      </div>

      {/* Motion first. It is the headline because it is what reads from across a room. */}
      <div data-region="traffic">
        <TrafficDisplay
          marks={marks}
          namespaces={namespaces}
          window={config.messages.buffer}
          filter={filter}
          selectedSeq={selectedSeq}
          onSelectSeq={setSelectedSeq}
        />
      </div>

      {filter && (
        <p className="messages-filter" data-testid="tree-filter">
          filtered to <b>{filter}</b> and everything beneath it
          <button type="button" onClick={() => setFilter(undefined)}>
            show every topic
          </button>
        </p>
      )}

      <div className="messages-split">
        {/* The tree is a primary region rather than a disclosure at a desktop width
            (FR-67); narrow, it discloses like every other secondary surface, which is
            FR-50 changing where it is and not whether it is. */}
        <div className="messages-tree-region" data-region="tree">
          <Disclosure label="topic tree" narrow={narrow} className="messages-tree-disclosure">
            <TopicTree client={client} selected={filter} onSelect={setFilter} />
          </Disclosure>
        </div>
        <div className="messages-list-scroll" data-region="list">
          <table className="messages-list" aria-hidden={covered || undefined}>
            <tbody>
              {listed.map((row) => (
                <tr
                  key={row.seq}
                  className={row.refusals.length > 0 ? 'message-refused' : ''}
                  data-selected={row.seq === selectedSeq ? true : undefined}
                  onClick={() => setSelectedSeq(row.seq)}
                >
                  <td className="message-seq">{row.seq}</td>
                  <td className="message-topic">{row.topic}</td>
                  <td className="message-summary">{row.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="message-detail" data-covering={covered} data-region="inspector">
          {selected ? (
            <Inspector
              row={selected}
              narrow={narrow}
              showRaw={showRaw}
              onShowRaw={setShowRaw}
              onBack={() => setSelectedSeq(undefined)}
            />
          ) : (
            <p className="panel-footnote">
              select a message — in the list, or a mark in the traffic display — to inspect
              it against its master
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The inspector (FR-68). A payload read against the master its topic declares, with the
 * refusal marked on the field that caused it — and the raw wire document one control
 * away for every message, because the wire form is the thing the seam actually carried.
 */
function Inspector({
  row,
  narrow,
  showRaw,
  onShowRaw,
  onBack,
}: {
  row: Row;
  narrow: boolean;
  showRaw: boolean;
  onShowRaw: (value: boolean) => void;
  onBack: () => void;
}) {
  const schema = row.schema ? (schemaDocuments[row.schema] as SchemaNode | undefined) : undefined;
  const fields = inspectFields(schema, row.payload, row.faults);
  const loose = documentFaults(row.faults, fields);
  return (
    <>
      {narrow && (
        <button type="button" className="message-back" onClick={onBack}>
          ← back to the list
        </button>
      )}
      <h3>{row.topic}</h3>
      <p className="panel-footnote">
        {row.schema ? (
          <>
            read against the master <b>{row.schema}</b>, which its topic declares
          </>
        ) : (
          <>
            no master is declared for this topic, so there is nothing to read it against —
            the wire document is below
          </>
        )}
      </p>
      {loose.length > 0 && (
        <p className="shell-refusal" data-testid="inspector-refusal">
          {loose.join('; ')}
        </p>
      )}
      {schema && !showRaw ? (
        <table className="inspect-fields" data-testid="inspect-fields">
          <tbody>
            {fields.map((field) => (
              <tr
                key={field.path}
                className={field.faults.length > 0 ? 'inspect-refused' : ''}
                data-field={field.path}
                data-refused={field.faults.length > 0 ? true : undefined}
              >
                <th scope="row" style={{ paddingLeft: `${field.depth * 1.1}em` }}>
                  {field.label}
                  {field.label !== field.key && <i className="inspect-key">{field.key}</i>}
                </th>
                <td className="inspect-value">
                  {field.absent ? (
                    <span className="inspect-absent">absent, and the master requires it</span>
                  ) : field.value === undefined ? (
                    <span className="inspect-opened">{field.declared}</span>
                  ) : (
                    <>
                      {field.value}
                      {field.unit && <i className="inspect-unit">{field.unit}</i>}
                    </>
                  )}
                </td>
                <td className="inspect-declared">
                  {field.undescribed ? 'not described by this master' : field.declared}
                </td>
                <td className="inspect-fault">{field.faults.join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <pre data-testid="inspect-raw">{JSON.stringify(row.payload, null, 2)}</pre>
      )}
      {schema && (
        <button type="button" className="inspect-raw-toggle" onClick={() => onShowRaw(!showRaw)}>
          {showRaw ? 'read it against its master' : 'show the raw wire document'}
        </button>
      )}
    </>
  );
}
