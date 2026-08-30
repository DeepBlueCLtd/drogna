// @vitest-environment jsdom
/**
 * The help button, mounted (feature 110). "Delivered" is not "wired" — E15's lesson —
 * so this drives the button rather than trusting that the tour data is well formed.
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
    render(<HelpButton tour={componentTour(config.shell)} onOpenView={() => undefined} />);
    const button = screen.getByTestId('help-button');
    // Named for assistive technology, not just coloured for the sighted.
    expect(button.getAttribute('aria-label')).toContain('The system, component by component');
    expect(button.textContent).toContain('Guide me');
  });

  it('opens the view its tour runs in before it starts', () => {
    const opened: string[] = [];
    render(<HelpButton tour={componentTour(config.shell)} onOpenView={(view) => opened.push(view)} />);
    act(() => {
      fireEvent.click(screen.getByTestId('help-button'));
    });
    // A step highlighting an element on a tab you are not looking at highlights
    // nothing, so the view is asked for first and the tour waits a commit for it.
    expect(opened).toEqual(['operator']);
  });

  it('drives a real tour: the first step’s words reach the page', () => {
    const opened: string[] = [];
    render(<HelpButton tour={componentTour(config.shell)} onOpenView={(view) => opened.push(view)} />);
    act(() => {
      fireEvent.click(screen.getByTestId('help-button'));
    });
    // Two commits: the view is opened, then the tour starts against a mounted view.
    // No timer and no frame callback takes part — the wallclock gate refused the
    // version that used one, and was right to.
    const popover = document.querySelector('.driver-popover');
    expect(popover).toBeTruthy();
    expect(popover?.textContent).toContain('The harness, end to end');
    // The prose is the tour's, carried through rather than paraphrased by the library.
    expect(popover?.textContent).toContain('deliberately fake and says so');
  });
});
