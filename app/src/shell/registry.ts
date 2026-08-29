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
 */
import type { ConfigShell, RunManifest } from '../generated/types.js';
import type { SeamClient } from '../seam/transport.js';
import type { SeamValidator } from '../seam/validate.js';
import type { PanelAddress } from './views.js';
import { IntroPanel } from '../panels/intro/IntroPanel.js';
import { SystemPanel } from '../panels/system/SystemPanel.js';
import { HoldingsPanel } from '../panels/holdings/HoldingsPanel.js';
import { OperatorPanel } from '../panels/operator/OperatorPanel.js';
import { MapPanel } from '../panels/map/MapPanel.js';
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

/** Which React component renders each configured view id. */
export const panelComponents: Record<string, React.FunctionComponent<PanelProps>> = {
  intro: IntroPanel,
  background: BackgroundPanel,
  system: SystemPanel,
  holdings: HoldingsPanel,
  operator: OperatorPanel,
  map: MapPanel,
  messages: MessagesPanel,
};
