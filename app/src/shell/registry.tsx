/**
 * The panel registry: which React component renders each configured view id, and what
 * a panel is handed (feature 112, FR-005).
 *
 * Lifted out of `Shell.tsx` so that both presentations — dockview's dock and the
 * narrow stack (ADR-0033) — read one list. A view that existed in one and not the
 * other would be a view whose address worked at one width, which is exactly the fault
 * this file exists to make impossible; a test enumerates `config.shell.views` and
 * renders both.
 *
 * `PanelProps` is deliberately narrower than dockview's `IDockviewPanelProps`: every
 * panel uses `params` and nothing else, and the stack cannot manufacture a dockview
 * panel API. A component taking these props is a valid dockview component, because
 * `IDockviewPanelProps<PanelParams>` is assignable to it.
 *
 * The map's deferral (the load-time spike, `spikes/load-time`) lives here rather than in
 * either presentation, because it is a fact about that *panel* — its deck.gl/luma.gl
 * stack is about a third of the bundle and no other view reaches it — and both
 * presentations have to honour it. `lazy` puts the stack in its own chunk; naming the
 * view in `DEFERRED_VIEWS` is what stops it being fetched before anybody asks for the
 * map, since a mounted lazy component fetches immediately and both presentations mount
 * every panel. How "first shown" is observed differs — dockview's panel API in the dock,
 * the shown view in the stack — which is exactly why the fact is stated here and the
 * observation is left to each.
 */
import { Suspense, lazy } from 'react';
import type { ConfigShell, RunManifest } from '../generated/types.js';
import type { SeamClient } from '../seam/transport.js';
import type { SeamValidator } from '../seam/validate.js';
import type { PanelAddress } from './views.js';
import { IntroPanel } from '../panels/intro/IntroPanel.js';
import { DataPanel } from '../panels/data/DataPanel.js';
import { OperatorPanel } from '../panels/operator/OperatorPanel.js';
import { MessagesPanel } from '../panels/messages/MessagesPanel.js';
import { BackgroundPanel } from '../panels/background/BackgroundPanel.js';

export interface PanelParams {
  config: ConfigShell;
  client: SeamClient;
  validator: SeamValidator;
  manifest: RunManifest;
  /**
   * The panel's own slice of the address (FR-15, ADR-0032). What the remainder means
   * is the panel's business: a panel that does not address positions inside itself
   * simply never reads this.
   */
  address: PanelAddress;
}

/** What every panel receives, in either presentation. */
export interface PanelProps {
  params: PanelParams;
}

const LazyMapPanel = lazy(async () => ({
  default: (await import('../panels/map/MapPanel.js')).MapPanel,
}));

function MapPanel({ params }: PanelProps) {
  return (
    <Suspense
      fallback={
        // Marked so that a proof can wait for the panel itself rather than measure this.
        // The mobile capture did exactly that for one run: it navigated to the map,
        // found the view present, and measured the placeholder's geometry instead of the
        // map's — a check that had quietly stopped checking what it claims.
        <div className="panel" data-testid="panel-arriving">
          <p className="not-landed">bringing up the map…</p>
        </div>
      }
    >
      <LazyMapPanel params={params} />
    </Suspense>
  );
}

/**
 * Views whose render is withheld until the view is first shown. See the note at the
 * head of this file: a mounted lazy component fetches its chunk at once, so `lazy`
 * alone would move the map's stack into a second file and still download it before
 * anybody opened the map. A deep link naming the view shows it immediately, so
 * arriving at that address still loads it at once.
 *
 * The panel is never withdrawn once shown: each presentation latches, so switching away
 * neither tears down the canvas nor loses what the panel has accumulated.
 */
export const DEFERRED_VIEWS: ReadonlySet<string> = new Set(['map']);

/** Which React component renders each configured view id. */
export const panelComponents: Record<string, React.FunctionComponent<PanelProps>> = {
  intro: IntroPanel,
  background: BackgroundPanel,
  data: DataPanel,
  operator: OperatorPanel,
  map: MapPanel,
  messages: MessagesPanel,
};
