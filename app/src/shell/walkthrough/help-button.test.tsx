// @vitest-environment jsdom
/**
 * The help button, mounted (feature 110, amended by 114). "Delivered" is not "wired" —
 * E15's lesson — so this drives the button rather than trusting that the tour data is
 * well formed.
 *
 * The view-opening test that stood here retired with the header placement (ADR-0037):
 * the button is carried by the panel its tour explains, so there is no view to open and
 * no commit to wait for. What replaces it is the per-panel test that the panel with a
 * tour renders one and the panel without renders none (`panels.test.tsx`).
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { HelpButton } from './HelpButton.js';
import { componentTour } from './tour.js';

const config = runConfigDocument as unknown as ConfigRun;

afterEach(() => {
  cleanup();
  document.querySelectorAll('.driver-popover').forEach((node) => node.remove());
});

describe('the help button (feature 110)', () => {
  it('is a button a reader can find and name', () => {
    render(<HelpButton tour={componentTour(config.shell)} />);
    const button = screen.getByTestId('help-button');
    // Named for assistive technology, not just coloured for the sighted.
    expect(button.getAttribute('aria-label')).toContain('The system, component by component');
    expect(button.textContent).toContain('Guide me');
  });

  it('names the view its tour runs in, which is the panel that carries it', () => {
    // The tour still names its view — the walkthrough test and the site's links read it
    // — but nothing opens that view any more, because the button is already inside it.
    expect(componentTour(config.shell).view).toBe('operator');
  });

  it('drives a real tour: the first step’s words reach the page', () => {
    render(<HelpButton tour={componentTour(config.shell)} />);
    act(() => {
      fireEvent.click(screen.getByTestId('help-button'));
    });
    // One commit: the elements the steps highlight are already in the document, because
    // the button is in the panel that draws them. No timer and no frame callback takes
    // part — the wallclock gate refused the version that used one, and was right to.
    const popover = document.querySelector('.driver-popover');
    expect(popover).toBeTruthy();
    expect(popover?.textContent).toContain('The harness, end to end');
    // The prose is the tour's, carried through rather than paraphrased by the library.
    expect(popover?.textContent).toContain('deliberately fake and says so');
  });
});
