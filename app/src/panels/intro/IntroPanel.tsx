/**
 * The Intro tab (SRD-v2 FR-42 as amended, FR-76 to FR-79; feature 116): the system
 * architecture, drawn, and grown one component at a time under the reader's own arrow
 * keys.
 *
 * What was here before was a numbered list of landed features. It was honest and it was
 * a poor answer to the question a reader actually arrives with, which is *what is this
 * thing made of and how do the parts fit together*. A list of beats answers that only
 * for somebody who already knows, and it had to be extended by hand for every beat — a
 * record maintained separately from the tree, which is the shape of every stale document
 * this repository has paid for.
 *
 * So the tab now draws the architecture instead, and the drawing is derived from the
 * declaration (`Diagram.tsx`, `storyboard.ts`). A component that lands and is not
 * revealed fails a gate rather than going quietly missing.
 *
 * The tab is inert, like Background: it reads no run state, subscribes to nothing and
 * crosses the seam for nothing. The one live fact it carries is the run identity the
 * shell already handed it, which FR-01 requires it to state. That is deliberate — this
 * is a drawing of the wiring, and every question about whether the wiring is *running*
 * is one link away in Operator.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PanelProps } from '../../shell/registry.js';
import { hashForView } from '../../shell/views.js';
import { buildFlow } from '../operator/graph.js';
import { topology } from '../../generated/topology.js';
import { useMeasuredWidth } from '../../shell/viewport.js';
import { Diagram, diagramPlacement } from './Diagram.js';
import { NOT_DRAWN, STORYBOARD } from './storyboard.js';
import { clampStep, restForStep, stepFromRest } from './address.js';
import './intro.css';

/**
 * How far the drawing may be scaled down to fit before it is panned at full size
 * instead. Feature 111's rule stands — never scaled past legibility, never rendered
 * having dropped its labels — and this is where the line is: a tenth off a label is
 * still a label, a third off it is a smudge. Below the floor the drawing is drawn at
 * full size in a frame that scrolls sideways, which is feature 112's answer for a
 * viewer with no width to widen into.
 */
const SCALE_FLOOR = 0.8;

export function IntroPanel({ params }: PanelProps): ReactNode {
  const { manifest, config, address } = params;
  const [step, setStep] = useState<number>(() =>
    stepFromRest(STORYBOARD, address.current()),
  );
  const columnRef = useRef<HTMLDivElement>(null);
  const measured = useMeasuredWidth(columnRef);

  // The address is the one place a position lives, and nothing is persisted: where a
  // reader has got to in a walkthrough is presentation, discarded like any other
  // per-viewer convenience.
  useEffect(() => address.onChange((rest) => setStep(stepFromRest(STORYBOARD, rest))), [address]);
  // A block body, deliberately: an arrow returning `write`'s result hands React whatever
  // that is as a cleanup function, and React calls it on the next change. A `write` that
  // returns anything at all — a test double pushing to an array does — then fails on
  // unmount with "destroy is not a function". Watched happening, in this panel's tests.
  useEffect(() => {
    address.write(restForStep(STORYBOARD, step));
  }, [address, step]);

  const flow = useMemo(() => buildFlow(config, topology), [config]);
  const placement = useMemo(() => diagramPlacement(), []);

  const total = STORYBOARD.length;
  const beat = STORYBOARD[clampStep(STORYBOARD, step) - 1];
  const labelOf = (id: string) =>
    config.components.find((component) => component.id === id)?.label ?? id;
  const arriving = beat.reveals.map((node) => labelOf(node.component)).join(' · ');

  const go = useCallback((next: number) => setStep(clampStep(STORYBOARD, next)), []);
  const select = useCallback(
    (component: string) => setStep(stepFromRest(STORYBOARD, component)),
    [],
  );

  const width = measured;
  const fits = width === undefined || width >= placement.width;
  const scale = fits ? 1 : Math.max(width / placement.width, 0);
  const panned = !fits && scale < SCALE_FLOOR;
  const drawn = panned ? 1 : scale;

  return (
    <div className="panel intro-panel">
      <header className="intro-head">
        <h1>drogna</h1>
        <p className="disclaimer">
          This is a demonstration harness and nothing else. Its numerics are deliberately
          fake, its data synthetic, and it holds no third-party entities of any kind —
          {/* harness:allow-forbidden-vocabulary the FR-01 statement of the prohibition itself */}
          no tracked entity, no contact, no detection — and never will. Nothing here is a
          candidate system.
        </p>
        <p className="intro-lead">
          A synthetic ocean, sensors that sample it, a forecast loop that assimilates what
          they report, and a query layer that serves the result through OGC API-EDR and
          SensorThings — all of it genuine programs running in this browser page, behind a
          wire-protocol seam a real backend can replace by swapping a base URL. This run
          was seeded fresh when you opened the page: run <code>{manifest.run_id}</code>,
          root seed <code>{manifest.root_seed}</code>.
        </p>
        <p className="intro-instruction">
          Below is what is inside it, built one part at a time. Move with the{' '}
          <kbd>←</kbd> and <kbd>→</kbd> arrow keys, or the buttons; click any part to jump
          to it.
        </p>
      </header>

      <div
        className="intro-stage"
        tabIndex={0}
        role="group"
        aria-label={`The drogna architecture, step ${step} of ${total}: ${beat.title}`}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') go(step + 1);
          else if (event.key === 'ArrowLeft') go(step - 1);
          else if (event.key === 'Home') go(1);
          else if (event.key === 'End') go(total);
          else return;
          event.preventDefault();
        }}
      >
        <div className="intro-figure-column" ref={columnRef}>
          <div className={panned ? 'intro-figure-pan' : 'intro-figure'} data-testid="intro-figure">
            <div
              className="intro-figure-scale"
              style={{
                width: placement.width * drawn,
                height: placement.height * drawn,
                transform: drawn === 1 ? undefined : `scale(${drawn})`,
              }}
            >
              <Diagram shell={config} edges={flow.edges} step={step} onSelect={select} />
            </div>
          </div>
          <p className="intro-figure-note">
            {panned ? 'Wider than the screen — scroll the diagram sideways. ' : ''}
            Wires are the wiring: solid where a message crosses the broker, dashed where
            two parts are coupled by a port and nothing is published.{' '}
            {flow.suppressed.length > 0 ? (
              <>
                The clock and heartbeat filters ({flow.suppressed.join(', ')}) are the
                plane rather than wires, and are drawn as the strip at the foot.
              </>
            ) : null}
          </p>
          {/*
            The curation, stated. Thirteen of the twenty components are drawn; a picture
            that quietly left the other seven out would be claiming to be the
            architecture. Each omission carries its reason, a gate fails on a component
            that is in neither list, and the whole wiring is one link away.
          */}
          <details className="intro-omissions" data-testid="intro-omissions">
            <summary>
              Not drawn: {NOT_DRAWN.length} of the {config.components.length} components
            </summary>
            <ul>
              {NOT_DRAWN.map((omission) => (
                <li key={omission.component}>
                  <b>{labelOf(omission.component)}</b> — {omission.reason}
                </li>
              ))}
            </ul>
            <p>
              The complete flow chart, every component and every wire, is the{' '}
              <a href={hashForView('operator')}>Operator</a> tab.
            </p>
          </details>
        </div>

        <div className="intro-narration">
          <p className="intro-position" data-testid="intro-position">
            step {step} of {total}
          </p>
          <div aria-live="polite">
            <h2>{beat.title}</h2>
            <p className="intro-component">{arriving}</p>
            {beat.prose.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {beat.liveView ? (
              <p className="intro-live">
                <a href={hashForView(beat.liveView.view)}>{beat.liveView.label} →</a>
              </p>
            ) : null}
          </div>
          <nav className="intro-controls" aria-label="the walkthrough">
            <button type="button" onClick={() => go(step - 1)} disabled={step <= 1}>
              ← previous
            </button>
            <button
              type="button"
              className="intro-next"
              onClick={() => go(step + 1)}
              disabled={step >= total}
            >
              next →
            </button>
            <button type="button" className="intro-restart" onClick={() => go(1)} disabled={step === 1}>
              start again
            </button>
          </nav>
        </div>
      </div>

      <footer className="intro-foot">
        <p>
          Every part of that drawing is running in this page. Watch the machinery light
          and interrupt it in <a href={hashForView('operator')}>Operator</a>, read the
          store filling up in <a href={hashForView('holdings')}>Holdings</a>, watch the
          traffic argue with its masters in <a href={hashForView('messages')}>Messages</a>,
          and see the whole loop at once on the <a href={hashForView('map')}>Map</a>.
          Export the manifest from the header to replay this run byte-identically; your
          interventions are ephemeral and deliberately outside that claim.
        </p>
        <p>
          The drawing above says nothing about what is <em>alive</em>: it is the wiring,
          not the run, and every component's own account of itself is in Operator. For why
          any of this is standards-based rather than bespoke,{' '}
          <a href={hashForView('background')}>Background</a> is a course of eleven short
          illustrated explainers — SensorThings, OGC API-EDR, NetCDF, MQTT and what it
          takes to use them honestly.
        </p>
      </footer>
    </div>
  );
}
