/**
 * The help button (feature 110): a large yellow button in the shell header that walks
 * a reader through the harness, one component at a time.
 *
 * Yellow because it is the one control on the page that is *for the reader* rather
 * than for the harness — everything else here operates the machinery, and a help
 * affordance that looked like the others would be found only by people who did not
 * need it.
 *
 * Built to be repeated. The button takes a tour, not a hard-wired script, so adding
 * one to another tab is a tour and a line — not another button. The tour names the
 * view it runs in, and the button opens that view before it starts, because a step
 * that highlights an element on a tab you are not looking at highlights nothing.
 *
 * driver.js (MIT) does the highlighting. It was chosen over writing one for the usual
 * reason: the overlay, the focus trap, keyboard traversal and the scroll-into-view are
 * fiddly, well-solved, and nothing about them is this harness's subject.
 *
 * Starting the tour takes two commits, and deliberately no timer. The first opens the
 * view; the second — which React runs only once that view has mounted — starts the
 * tour, so the elements the steps highlight are in the document by the time driver.js
 * looks for them. The obvious version of this used requestAnimationFrame, and the
 * wallclock gate refused it. The gate was right: reaching for a frame callback to mean
 * "later" is how a harness starts keeping time by the host, one convenience at a time.
 * React's own commit ordering says "after that rendered" without reading any clock.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { Tour } from './tour.js';
import './walkthrough.css';

export function HelpButton({ tour, onOpenView }: { tour: Tour; onOpenView: (view: string) => void }) {
  const running = useRef<Driver | undefined>(undefined);
  /** 'opening' has asked for the view; 'arming' waits one commit for it to mount. */
  const [phase, setPhase] = useState<'idle' | 'opening' | 'arming'>('idle');

  const start = useCallback(() => setPhase('opening'), []);

  useEffect(() => {
    if (phase !== 'opening') return;
    onOpenView(tour.view);
    setPhase('arming');
  }, [onOpenView, phase, tour.view]);

  useEffect(() => {
    if (phase !== 'arming') return;
    setPhase('idle');
    {
      const steps = tour.steps.map((step) => ({
        element: step.element,
        popover: {
          title: step.title,
          description: `<p>${step.what}</p><p class="walkthrough-panel">${step.panel}</p>`,
        },
      }));
      const instance = driver({
        showProgress: true,
        allowClose: true,
        overlayColor: '#0b1016',
        overlayOpacity: 0.72,
        popoverClass: 'walkthrough-popover',
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Done',
        // A step whose element is missing shows as a centred card rather than
        // silently doing nothing: the tour says what it cannot show you.
        steps,
      });
      running.current = instance;
      instance.drive();
    }
  }, [phase, tour]);

  // A tour left running when the button unmounts would keep an overlay over a page
  // that no longer has the elements under it.
  useEffect(() => () => running.current?.destroy(), []);

  return (
    <button
      type="button"
      className="walkthrough-button"
      onClick={start}
      data-testid="help-button"
      aria-label={`Start the walkthrough: ${tour.title}`}
      title={tour.title}
    >
      <span aria-hidden="true">?</span>
      <span className="walkthrough-button-label">Guide me</span>
    </button>
  );
}
