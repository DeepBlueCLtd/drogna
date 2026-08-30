/**
 * The traffic display (feature 115, FR-71): received messages drawn as marks on lanes,
 * arriving as they arrive.
 *
 * It is the headline of the Messages tab because it is the one thing on that tab that
 * reads from across a room: stop the sensors from Operator and the observation lane
 * drains while the clock lane goes on beating, with no number read and no refresh.
 *
 * **The display holds no clock.** Marks are placed by receive order (`traffic.ts`), so
 * it advances when a message arrives and at no other time. There is no sweep interval
 * here and no CSS animation on a mark, because FR-71 forbids motion while the broker is
 * silent — a display that keeps moving with nothing arriving is asserting traffic that
 * does not exist (Constitution VII). SC-02 is the check, and it was planted.
 *
 * A refused message is refused *in the display* and not only in the count above it: the
 * mark is drawn in the refusal colour, full height, so a reader scanning the lanes sees
 * where the fault landed rather than only that one happened.
 */
import { lanesFor, markOffset, newestSeqOf, type TrafficMark } from './traffic.js';

export function TrafficDisplay({
  marks,
  namespaces,
  window,
  filter,
  onSelectSeq,
  selectedSeq,
}: {
  readonly marks: readonly TrafficMark[];
  /** The declared namespaces, drawn whether or not they have been heard from. */
  readonly namespaces: readonly string[];
  /** How many messages back the lanes reach. Declared by the panel, not by the clock. */
  readonly window: number;
  readonly filter?: string;
  readonly onSelectSeq?: (seq: number) => void;
  readonly selectedSeq?: number;
}) {
  const lanes = lanesFor(namespaces, marks, window, filter);
  const newestSeq = newestSeqOf(marks);
  const drawn = lanes.reduce((total, lane) => total + lane.marks.length, 0);

  return (
    <section className="traffic" data-testid="traffic-display" aria-label="broker traffic by namespace">
      <div className="traffic-lanes">
        {lanes.map((lane) => (
          <div className="traffic-row" key={lane.id}>
            <span
              className={lane.declared ? 'traffic-lane-name' : 'traffic-lane-name traffic-undeclared'}
              title={
                lane.declared
                  ? 'topics the topology artefact declares'
                  : 'topics in this namespace that no topology entry declares — a finding, not a silence'
              }
            >
              {lane.namespace}
              {!lane.declared && <i className="traffic-undeclared-flag">undeclared</i>}
            </span>
            <span
              className={lane.declared ? 'traffic-lane' : 'traffic-lane traffic-lane-undeclared'}
              data-lane={lane.id}
              data-namespace={lane.namespace}
              data-declared={lane.declared}
              data-marks={lane.marks.length}
            >
              {lane.marks.map((mark) => (
                <i
                  key={mark.seq}
                  className={mark.refused ? 'traffic-mark traffic-mark-refused' : 'traffic-mark'}
                  style={{ left: `${markOffset(mark, newestSeq, window) * 100}%` }}
                  data-seq={mark.seq}
                  data-refused={mark.refused}
                  data-selected={mark.seq === selectedSeq ? true : undefined}
                  title={`${mark.topic}${mark.refused ? ' — refused by its master' : ''}`}
                  onClick={onSelectSeq ? () => onSelectSeq(mark.seq) : undefined}
                />
              ))}
            </span>
          </div>
        ))}
      </div>
      <p className="panel-footnote" data-testid="traffic-note">
        {/* What the display is, and what it is not. An empty set of lanes is the broker
            being quiet — never the display having reset itself. */}
        Lanes are the declared namespaces of the topology artefact; marks are received
        messages, newest at the right, reaching {window} messages back. A red mark is one
        its master refused. Nothing here moves except on arrival:{' '}
        {drawn === 0
          ? 'no message is inside the window — the lanes are empty because the traffic is.'
          : `${drawn} message(s) drawn${filter ? `, filtered to '${filter}'` : ''}.`}
      </p>
    </section>
  );
}
