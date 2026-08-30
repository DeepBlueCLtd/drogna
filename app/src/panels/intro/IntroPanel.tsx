/**
 * The Intro tab (SRD-v2 FR-42 as amended, FR-86 to FR-90; feature 119): the shape of the
 * system, grown one part at a time, with the links between the parts in motion and every
 * message crossing one open to inspection.
 *
 * Three decisions are worth knowing before reading the code.
 *
 * **It names no component.** Six roles, and not one component id among them. The five
 * earlier passes drew the declared components and needed a gate to stop the picture
 * quietly falling behind the tree as components landed — which it did, catching the
 * analyst on the day it was written. This one makes no claim a merge can falsify, so
 * there is nothing left for that gate to check and it retires with the storyboard it
 * checked (`specs/119-intro-architecture/spec.md` records why).
 *
 * **The motion is a fixed cycle, not received traffic** (FR-90, and the author's
 * decision). Feature 115's FR-71 holds the Messages tab to the opposite rule, and this
 * tab is deliberately outside it: the Intro tab reads the same whether the clock is
 * running, stopped, or absent, which is what a first page should do. The cost is that a
 * reader must not mistake it for a readout, so the panel says what it is in the frame
 * above the drawing, every sample in the inspector carries its own caveat, and Messages
 * is one link away for the traffic that is real.
 *
 * **Nothing here reads a clock.** The animation is entirely CSS on one shared cycle
 * (`intro.css`), so Constitution I is not engaged and no `harness:allow-wallclock`
 * exemption is spent on decoration. React renders which parts exist; the browser animates
 * what crosses between them. That is also what makes the whole thing hold still under
 * `prefers-reduced-motion` without a second code path.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PanelProps } from '../../shell/registry.js';
import { hashForView } from '../../shell/views.js';
import { useArrowKeys } from '../../shell/arrow-keys.js';
import { BEATS, CHANNELS, ROLES, shownAt, type Channel, type Sample } from './roles.js';
import { clampStep, restForStep, stepFromRest } from './address.js';
import './intro.css';

export function IntroPanel({ params }: PanelProps): ReactNode {
  const { manifest, address } = params;
  const rootRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<number>(() => stepFromRest(BEATS, address.current()));
  const [open, setOpen] = useState<{ channel: string; sample: Sample } | undefined>();

  // The address is the one place a position lives, and nothing is persisted: where a
  // reader has got to is presentation, discarded like any other per-viewer convenience.
  useEffect(() => address.onChange((rest) => setStep(stepFromRest(BEATS, rest))), [address]);
  // Braced, deliberately. An arrow body hands React whatever `write` returns as the
  // effect's cleanup function, and an address implementation that returns anything at all
  // then fails the next unmount with "destroy is not a function". The live implementation
  // returns void so it never bit in the browser; it bit in ten tests at once.
  useEffect(() => {
    address.write(restForStep(BEATS, step));
  }, [address, step]);

  const go = useCallback((next: number) => setStep(clampStep(BEATS, next)), []);
  useArrowKeys({
    root: rootRef,
    address,
    onStep: useCallback((delta: 1 | -1) => setStep((now) => clampStep(BEATS, now + delta)), []),
  });

  const total = BEATS.length;
  const beat = BEATS[clampStep(BEATS, step) - 1];
  const { roles, channels } = shownAt(step);

  const inspect = useCallback((channel: Channel) => {
    setOpen({ channel: channel.id, sample: channel.sample });
  }, []);

  const role = (id: string): ReactNode => {
    const found = ROLES.find((candidate) => candidate.id === id);
    if (!found || !roles.has(id)) return null;
    return (
      <div
        className={`intro-role${beat.roles.includes(id) ? ' is-new' : ''}`}
        data-intro-role={id}
        aria-current={beat.roles.includes(id) ? 'step' : undefined}
      >
        <span className="intro-role-name">{found.name}</span>
        <span className="intro-role-gloss">{found.gloss}</span>
      </div>
    );
  };

  const channel = (id: string): ReactNode => {
    const found = CHANNELS[id];
    if (!found || !channels.has(id)) return null;
    return (
      <div
        className={`intro-chan${found.reverse ? ' is-back' : ''}`}
        data-intro-channel={id}
        data-marks={found.marks}
      >
        <span className="intro-chan-proto">{found.protocol}</span>
        <div className="intro-chan-track">
          {Array.from({ length: found.marks }, (_, index) => (
            <button
              key={index}
              type="button"
              className={`intro-mark is-${id}`}
              style={{ ['--mark' as string]: String(index) }}
              data-intro-mark={id}
              onClick={() => inspect(found)}
            >
              <span className="intro-sr">
                {found.protocol}: open a sample of what crosses here
              </span>
            </button>
          ))}
        </div>
        <span className="intro-chan-note">{found.note}</span>
      </div>
    );
  };

  return (
    <div
      className="panel intro-panel"
      ref={rootRef}
      onKeyDown={(event) => {
        // The arrows are answered on the document by `useArrowKeys`, so they work for a
        // viewer who has clicked nothing. Home and End stay bound to the panel: a
        // document-level Home would take the key from every scrollable region on the
        // page, and unlike the arrows nobody arrives expecting to press it.
        if (event.key === 'Home') go(1);
        else if (event.key === 'End') go(BEATS.length);
        else return;
        event.preventDefault();
      }}
    >
      <header className="intro-head">
        <h1>drogna</h1>
        <p className="intro-frame">
          The shape of it, one part at a time. Measurements are tested against what is
          believed; sustained difference warrants a run; the new forecast is announced, and
          whoever cares comes back and asks for it.{' '}
          <strong>The movement below is an illustration on a fixed cycle</strong> — it runs
          whether or not anything is running, so it says nothing about this run. The traffic
          that is real is in <a href={hashForView('messages')}>Messages</a>.
        </p>
      </header>

      <div className="intro-stage">
        <div className="intro-flow" data-testid="intro-flow" data-step={step}>
          <section className="intro-lane" aria-label="the loop: measure, test, re-forecast">
            {role('measured')}
            {channel('obs')}
            {role('tested')}
            {channel('div')}
            {role('ran')}
            {channel('pub')}
            {role('believed')}
          </section>
          {channels.has('ann') ? <div className="intro-drop">{channel('ann')}</div> : null}
          {roles.has('told') ? (
            <section className="intro-lane" aria-label="downstream: hear, then ask">
              {role('told')}
              <div className="intro-pair">
                {channel('req')}
                {channel('res')}
              </div>
              {role('answered')}
            </section>
          ) : null}
        </div>

        <div className="intro-narration">
          <p className="intro-position">
            <span data-testid="intro-position">
              step {step} of {total}
            </span>
            <span className="intro-keyhint">← → to grow it</span>
          </p>
          <div aria-live="polite">
            <h2>{beat.title}</h2>
            {beat.prose.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {beat.liveView ? (
              <p className="intro-live">
                <a href={hashForView(beat.liveView.view)}>{beat.liveView.label} →</a>
              </p>
            ) : null}
          </div>

          <div className="intro-inspector" data-testid="intro-inspector">
            {open ? (
              <>
                <p className="intro-insp-head">{open.sample.head}</p>
                <dl>
                  {open.sample.fields.map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="intro-insp-caveat">{open.sample.caveat}</p>
              </>
            ) : (
              <p className="intro-insp-empty">
                Click anything crossing a channel to read a sample of it.
              </p>
            )}
          </div>

          <nav className="intro-controls" aria-label="the walkthrough">
            <button type="button" onClick={() => go(step - 1)} disabled={step <= 1}>
              ← previous
            </button>
            <button type="button" onClick={() => go(step + 1)} disabled={step >= total}>
              next →
            </button>
            <button type="button" onClick={() => go(1)} disabled={step === 1}>
              start again
            </button>
          </nav>
        </div>
      </div>

      <footer className="intro-foot">
        <p className="disclaimer">
          This is a demonstration harness and nothing else. Its numerics are deliberately
          fake, its data synthetic, and it holds no third-party entities of any kind —{' '}
          {/* harness:allow-forbidden-vocabulary the FR-01 statement of the prohibition itself */}
          no tracked entity, no contact, no detection — and never will. Nothing here is a
          candidate system. Behind this drawing are genuine programs running in this browser
          page, behind a wire-protocol seam a real backend can replace by swapping a base
          URL. This run is <code>{manifest.run_id}</code>, from root seed{' '}
          <code>{manifest.root_seed}</code> — the situation&rsquo;s own seed rather than one
          drawn when the page opened, so two people following one link see the same ocean.
        </p>
        <p>
          It also did not start at its epoch. It began in the situation chosen on the
          welcome page — <code>{manifest.start_condition}</code> — and the platform, the
          instruments and the loop were run forward to it through the same controls the{' '}
          <a href={hashForView('operator')}>Operator</a> tab offers, before this console
          opened. Nothing was written into a store to arrange it, and the whole pre-roll is
          in <a href={hashForView('messages')}>Messages</a> where you can read it back. The
          ocean itself — the archive and the now-cast — was authored <em>ahead of time</em>,
          by these same components from this same seed, and arrives as a committed artefact
          the snapshot source republishes through the coverage store&rsquo;s one
          digest-checked write path: a gate rebuilds it on every change and fails the build
          if a byte differs from what the generator would author now.
        </p>
        <p>
          The drawing is a schematic; the system is the rest of the shell. Watch the
          machinery light and interrupt it in <a href={hashForView('operator')}>Operator</a>,
          read the store filling up in <a href={hashForView('holdings')}>Holdings</a>, watch
          the traffic argue with its masters in{' '}
          <a href={hashForView('messages')}>Messages</a>, and see the whole loop at once on
          the <a href={hashForView('map')}>Map</a>. For why any of this is standards-based
          rather than bespoke, <a href={hashForView('background')}>Background</a> is a course
          of ten short illustrated explainers.
        </p>
      </footer>
    </div>
  );
}
