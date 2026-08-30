/**
 * The help button (feature 110, moved into the panel by feature 115): a large yellow
 * button that walks a reader through the surface it sits on.
 *
 * Yellow because it is the one control on the page that is *for the reader* rather
 * than for the harness — everything else here operates the machinery, and a help
 * affordance that looked like the others would be found only by people who did not
 * need it.
 *
 * Built to be repeated, and feature 115 is the repetition. The button takes a tour, not
 * a hard-wired script, so adding one to another tab is a tour and a line. What changed
 * at 114 is where it lives: **the panel it explains carries it, at that panel's top
 * right** (FR-75, ADR-0037). A tab with a tour shows one; a tab without shows nothing,
 * and the absence is information — the button means *this tab explains itself*.
 *
 * That move deletes machinery rather than adding it. In the header the button had to
 * open the tour's view and then wait a commit for it to mount, because a step
 * highlighting an element on a tab you are not looking at highlights nothing. A tour
 * started from inside its own panel has its elements in the document already, so the
 * two-phase start goes with the header placement. The reason the phases were phases and
 * not a timer is worth keeping even though the code is gone: the obvious version used
 * requestAnimationFrame and the wallclock gate refused it, and the gate was right —
 * reaching for a frame callback to mean "later" is how a harness starts keeping time by
 * the host, one convenience at a time.
 *
 * driver.js (MIT) does the highlighting. It was chosen over writing one for the usual
 * reason: the overlay, the focus trap, keyboard traversal and the scroll-into-view are
 * fiddly, well-solved, and nothing about them is this harness's subject.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { Tour } from './tour.js';
import './walkthrough.css';

export function HelpButton({ tour }: { tour: Tour }) {
  const running = useRef<Driver | undefined>(undefined);
  const [starting, setStarting] = useState(false);

  const start = useCallback(() => setStarting(true), []);

  useEffect(() => {
    if (!starting) return;
    setStarting(false);
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
  }, [starting, tour]);

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
