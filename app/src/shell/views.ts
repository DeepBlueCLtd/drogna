/**
 * URL-addressable views (SRD-v2 FR-15, D16): '#/view/<id>' opens the shell at the
 * named view, and activating a view writes the hash back, so the address bar always
 * names what is shown. A deep link selects what is shown, never what happened: no
 * manifest state travels here.
 *
 * Feature 111 extends the scheme below the panel (ADR-0032, amending ADR-0028's
 * "the panel id is the unit of URL addressability"). An address is a view id and an
 * opaque remainder: '#/view/background/mqtt/3' names the panel 'background' and
 * hands it 'mqtt/3'. The remainder is meaningless here on purpose — the shell never
 * parses it, so no panel's internal vocabulary reaches this module — and a panel
 * that does not understand one ignores it. Every single-segment link is unchanged.
 */

export interface ViewAddress {
  readonly view: string;
  /** Everything below the view id, or undefined when the address names the view alone. */
  readonly rest?: string;
}

const ADDRESS = /^#\/view\/([a-z][a-z0-9_-]*)(?:\/(.*))?$/;

export function addressFromHash(hash: string): ViewAddress | undefined {
  const match = ADDRESS.exec(hash);
  if (!match) return undefined;
  const rest = match[2]?.replace(/\/+$/, '');
  return rest ? { view: match[1], rest } : { view: match[1] };
}

export function viewFromHash(hash: string): string | undefined {
  return addressFromHash(hash)?.view;
}

export function hashForView(viewId: string, rest?: string): string {
  return rest ? `#/view/${viewId}/${rest}` : `#/view/${viewId}`;
}

/**
 * The address to write when `panelId` becomes the active panel, or undefined to
 * leave the address alone. Leaving it alone is the whole point: the previous
 * writeback compared the hash to a bare view address and so erased any sub-path the
 * viewer had arrived on — including on the activation dockview fires while
 * restoring a layout. Watched doing exactly that before this existed
 * (`Shell.test.tsx`).
 */
export function hashOnActivation(hash: string, panelId: string): string | undefined {
  const address = addressFromHash(hash);
  if (address?.view === panelId) return undefined;
  return hashForView(panelId);
}

/**
 * What the shell hands a panel so it can address positions inside itself (FR-003).
 * The panel supplies the vocabulary; the shell supplies only the seam to the URL.
 */
export interface PanelAddress {
  /**
   * Whether the address names this panel at all. Distinct from `current()`, which
   * answers undefined both for "the address names another panel" and for "it names
   * this one, with no remainder" — a panel that has to decide whether a key nothing
   * inside it received is addressed to it needs those two apart.
   */
  readonly names: () => boolean;
  /** The remainder the address currently names for this panel, if it names this panel. */
  readonly current: () => string | undefined;
  /** Rewrite this panel's remainder. A no-op while the address names another panel. */
  readonly write: (rest: string | undefined) => void;
  /**
   * Called when the address changes elsewhere — the back button, a pasted link.
   * Named `onChange` rather than `subscribe` on purpose: `subscribe` is broker
   * vocabulary, and Background's inertness gate reads a `.subscribe(` in that panel
   * as exactly the fault it exists to catch. A word that means two things makes a
   * gate choose between a false positive and a blind spot.
   */
  readonly onChange: (listener: (rest: string | undefined) => void) => () => void;
}

/** The live implementation, bound to `window.location` and the history API. */
export function createPanelAddress(viewId: string): PanelAddress {
  const restFor = (hash: string): string | undefined => {
    const address = addressFromHash(hash);
    return address?.view === viewId ? address.rest : undefined;
  };
  return {
    names: () => addressFromHash(window.location.hash)?.view === viewId,
    current: () => restFor(window.location.hash),
    write: (rest) => {
      if (addressFromHash(window.location.hash)?.view !== viewId) return;
      const next = hashForView(viewId, rest);
      if (next !== window.location.hash) window.history.replaceState(null, '', next);
    },
    onChange: (listener) => {
      const onHashChange = () => {
        if (addressFromHash(window.location.hash)?.view !== viewId) return;
        listener(restFor(window.location.hash));
      };
      window.addEventListener('hashchange', onHashChange);
      return () => window.removeEventListener('hashchange', onHashChange);
    },
  };
}
