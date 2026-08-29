// @vitest-environment jsdom
/**
 * The wait that keeps deck.gl off a detached canvas.
 *
 * The fault this guards against is silent: the map draws, and takes no pointer event
 * ever after. So the assertion that matters is the negative one — that nothing is
 * released while the host is out of the document, which is the state dockview leaves
 * an unopened tab in.
 */
import { describe, expect, it } from 'vitest';
import { whenInDocument } from './attach.js';

/** MutationObserver records are delivered as a microtask; let them land. */
const settle = () => new Promise<void>((done) => queueMicrotask(done));

describe('waiting for the canvas host to be in the document', () => {
  it('releases nothing while the host is detached, and releases once it is attached', async () => {
    const host = document.createElement('div');
    let released = 0;
    const stop = whenInDocument(host, () => (released += 1));

    // The state an unopened dockview tab is in: mounted, laid out by React, and
    // nowhere in the document. Other parts of the page keep mutating meanwhile.
    document.body.appendChild(document.createElement('p'));
    await settle();
    expect(released).toBe(0);

    document.body.appendChild(host);
    await settle();
    expect(released).toBe(1);

    // The wait is over: further document traffic must not release a second canvas.
    document.body.appendChild(document.createElement('p'));
    await settle();
    expect(released).toBe(1);
    stop();
  });

  it('releases at once when the host is already in the document', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let released = 0;
    whenInDocument(host, () => (released += 1));
    expect(released).toBe(1);
  });

  it('stops watching when the panel goes away before the tab is ever opened', async () => {
    const host = document.createElement('div');
    let released = 0;
    whenInDocument(host, () => (released += 1))();
    document.body.appendChild(host);
    await settle();
    expect(released).toBe(0);
  });
});
