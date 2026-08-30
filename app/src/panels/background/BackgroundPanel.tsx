/**
 * The Background tab (SRD-v2 FR-43 to FR-45, feature 111): a linear course of
 * ten self-contained explainers about the standards this harness serves, and
 * about what it takes to use them honestly.
 *
 * The one claim this panel makes about itself: **it is inert**. No explainer reads
 * run state, subscribes to the broker, or issues a request across the seam, and the
 * tab renders identically with every component stopped (FR-004). That is not a
 * promise — `scripts/gates/check-background-inert.ts` fails the build on the import,
 * and `background.test.tsx` mounts this panel with a client whose every method
 * throws. The two fail differently on purpose: a gate catches the import that has
 * not been called yet, and the test catches the call that arrived by a route the
 * gate did not model.
 *
 * It follows that Background is not a component (Constitution VII): no heartbeat, no
 * entry in `shell.components`, and no lamp on the System panel. It is a panel that
 * renders prose and SVG.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PanelProps } from '../../shell/registry.js';
import { hashForView } from '../../shell/views.js';
import { COURSE } from './registry.js';
import { advance, positionFromRest, restForPosition, type CoursePosition } from './address.js';
import { Rail } from './Rail.js';
import { Spine } from './Spine.js';
import { useMeasuredWidth } from './layout.js';
import { CategoryKey } from './marks.js';
import './background.css';

export function BackgroundPanel({ params }: PanelProps): ReactNode {
  const { address } = params;
  const [position, setPosition] = useState<CoursePosition>(() =>
    positionFromRest(COURSE, address.current()),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(rootRef);

  // The address is the one place a position lives. Nothing is persisted: position in
  // the course is presentation, discarded like any other per-viewer convenience
  // (FR-015).
  useEffect(() => address.onChange((rest) => setPosition(positionFromRest(COURSE, rest))), [address]);
  useEffect(() => address.write(restForPosition(position)), [address, position]);

  // FR-014: the arrow keys walk the whole course. They cross an explainer's ends —
  // right from a Consequences panel opens the next explainer, left from a first step
  // returns to the previous one's last — so a keyboard reaches all sixty-nine steps
  // without going back to the rail eleven times.
  //
  // The listener is on the document rather than on this element because a viewer who
  // has just opened the tab has clicked nothing: no element inside the panel holds the
  // focus, so a handler hung on the panel would never see the key. What that costs is
  // that the panel now hears keys pressed anywhere, and the three guards below are
  // what it pays with.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (delta === 0) return;
      const target = event.target as Element | null;
      // A control that spends the arrow keys itself keeps them. The rail collapses to
      // a <select> at a narrow width (Rail.tsx), and taking its arrows away would
      // leave the one navigation surface a narrow viewer has unusable by keyboard.
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const owner = target?.closest?.('.panel') ?? null;
      // Focus inside another panel is that panel's business — the dock can show two at
      // once. Focus nowhere in particular is answered only while the address names
      // this view, because every panel stays mounted when another is shown (Stack.tsx)
      // and a hidden Background must not quietly walk itself while the viewer is
      // on the Map.
      if (owner === null ? !address.names() : owner !== rootRef.current) return;
      // At the two ends of the course there is nowhere to go and the key does nothing.
      setPosition((current) => advance(COURSE, current, delta) ?? current);
      event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [address]);

  const explainer = COURSE.find((candidate) => candidate.id === position.explainerId) ?? COURSE[0];

  const onSelect = useCallback((explainerId: string) => setPosition({ explainerId, step: 1 }), []);
  const onStep = useCallback(
    (step: number) => setPosition((current) => ({ ...current, step })),
    [],
  );
  // FR-005: a claim about drogna links to the live view rather than depicting it.
  const onView = useCallback((view: string) => {
    window.location.hash = hashForView(view);
  }, []);

  return (
    <div className="panel bg-panel" ref={rootRef}>
      <Rail course={COURSE} current={explainer.id} onSelect={onSelect} width={width} />
      <div className="bg-main">
        <header className="bg-head">
          <p className="bg-frame">
            The standards, and what it takes to use them honestly. Ten explainers, in
            order. Nothing here reads the running system: these are drawings about
            interfaces, and where a claim is about drogna it links to the view that shows
            it rather than depicting it.
          </p>
          <h1>{explainer.title}</h1>
          <p className="bg-idea">{explainer.idea}</p>
        </header>
        <Spine
          explainer={explainer}
          step={position.step}
          onStep={onStep}
          onView={onView}
          legend={
            <footer className="bg-foot">
              <CategoryKey />
            </footer>
          }
        />
      </div>
    </div>
  );
}
