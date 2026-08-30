/**
 * The arrow keys, for a panel that walks a sequence (FR-014, FR-076).
 *
 * Lifted out of `panels/background/BackgroundPanel.tsx` when the Intro walkthrough
 * (feature 116) needed the same thing. It is not a convenience: the three guards below
 * are subtle, each is there because of a specific way the naive version is wrong, and a
 * second copy of them is a copy that rots. One implementation, two panels, and both
 * panels' tests hold it.
 *
 * **The listener is on the document, not on the panel.** A viewer who has just opened a
 * tab has clicked nothing, so no element inside the panel holds the focus and a handler
 * hung on the panel's own element would never see the key. That was the first version in
 * both panels, and in both it meant the arrow keys did nothing until you thought to click
 * the drawing — for a feature whose whole request was "I should be able to progress using
 * arrow keys".
 *
 * What listening on the document costs is that the panel now hears keys pressed anywhere,
 * and the guards are what it pays with:
 *
 * - a control that spends the arrow keys itself keeps them — a `<select>`, a text field.
 *   Background's rail collapses to a `<select>` at a narrow width and is the only
 *   navigation surface a narrow viewer has;
 * - focus inside *another* panel is that panel's business: the dock shows two at once;
 * - focus nowhere in particular is answered only while the address names this view,
 *   because every panel stays mounted when another is shown (`Stack.tsx`) and a hidden
 *   panel must not quietly walk itself while the viewer is on the Map.
 */
import { useEffect, type RefObject } from 'react';
import type { PanelAddress } from './views.js';

export interface ArrowKeys {
  /** The panel's own root element, to tell its focus from another panel's. */
  readonly root: RefObject<HTMLElement>;
  readonly address: PanelAddress;
  /** Called with +1 or -1. What "a step" means is the panel's business. */
  readonly onStep: (delta: 1 | -1) => void;
}

export function useArrowKeys({ root, address, onStep }: ArrowKeys): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (delta === 0) return;
      const target = event.target as Element | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const owner = target?.closest?.('.panel') ?? null;
      if (owner === null ? !address.names() : owner !== root.current) return;
      onStep(delta);
      event.preventDefault();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [address, root, onStep]);
}
