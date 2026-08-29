/**
 * When a canvas may be handed to deck.gl.
 *
 * deck.gl adopts the canvas element React gives it at the moment its WebGL device
 * resolves. If that element is not in the document at that moment, deck re-parents
 * the canvas to the wrapper — out of the `.deck-events-root` div its event manager
 * listens on — and never puts it back. The map then draws correctly and receives no
 * pointer event at all: the globe cannot be rotated, and nothing says why.
 *
 * dockview keeps only the active tab's content in the document; an inactive panel's
 * React tree is mounted detached. So the Map panel, which is not the first tab, meets
 * that condition every time — until some later change (switching projection remounts
 * the canvas) happens to construct deck.gl while the panel is on screen.
 *
 * So the canvas waits here for its host to be in the document. The wait watches the
 * document rather than the clock: Constitution I, and an attachment is an event the
 * DOM already reports.
 */
export function whenInDocument(host: HTMLElement, arrived: () => void): () => void {
  if (host.isConnected) {
    arrived();
    return () => {};
  }
  const observer = new MutationObserver(() => {
    if (!host.isConnected) return;
    observer.disconnect();
    arrived();
  });
  observer.observe(host.ownerDocument.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
