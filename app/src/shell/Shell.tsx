/**
 * The shell (V2-C19): the dockable multi-panel front-end (FR-14, ADR-0028).
 * dockview owns the layout; each panel is a React component; the four first-run tabs
 * come from the shell's configuration document, never from literals here.
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  DockviewDefaultTab,
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from 'dockview-react';
import type { ConfigShell, RunManifest } from '../generated/types.js';
import type { SeamClient } from '../seam/transport.js';
import type { SeamValidator } from '../seam/validate.js';
import { createPanelAddress, hashOnActivation, viewFromHash, type PanelAddress } from './views.js';
import { IntroPanel } from '../panels/intro/IntroPanel.js';
import { SystemPanel } from '../panels/system/SystemPanel.js';
import { HoldingsPanel } from '../panels/holdings/HoldingsPanel.js';
import { OperatorPanel } from '../panels/operator/OperatorPanel.js';
import { MessagesPanel } from '../panels/messages/MessagesPanel.js';
import { BackgroundPanel } from '../panels/background/BackgroundPanel.js';
import { ClockStrip } from './ClockStrip.js';
import './shell.css';

export interface ShellProps {
  config: ConfigShell;
  client: SeamClient;
  validator: SeamValidator;
  manifest: RunManifest;
  /** Returns a refusal naming the fault, or undefined on success. */
  onImportManifest: (candidate: unknown) => string | undefined;
}

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

/**
 * The map is the one panel loaded on demand (spike `spikes/load-time`). Its
 * deck.gl/luma.gl stack is about a third of the bundle and is reachable from no other
 * view, so a visitor who opens the intro — the front door — was waiting for a renderer
 * they had not asked for.
 *
 * Two things together, because either alone leaves the cost where it was. `lazy` puts
 * the stack in its own chunk; `WhenFirstActive` withholds the render until the tab is
 * first selected, because dockview mounts every panel's React tree at once (detached,
 * as `panels/map/attach.ts` records) and a mounted lazy component fetches its chunk
 * immediately. A deep link naming the map activates it during layout restore, so
 * arriving at `#/view/map` still loads it at once.
 *
 * The panel is mounted once and never unmounted again: `seen` latches, so switching
 * away does not tear down the canvas or lose what the panel has accumulated.
 */
const LazyMapPanel = lazy(async () => ({
  default: (await import('../panels/map/MapPanel.js')).MapPanel,
}));

function WhenFirstActive({
  api,
  children,
}: {
  api: IDockviewPanelProps<PanelParams>['api'];
  children: React.ReactNode;
}) {
  const seen = useRef(false);
  const active = useSyncExternalStore(
    useCallback(
      (onChange) => {
        const subscription = api.onDidActiveChange(() => onChange());
        return () => subscription.dispose();
      },
      [api],
    ),
    () => {
      seen.current ||= api.isActive;
      return seen.current;
    },
  );
  if (!active) return null;
  return <>{children}</>;
}

function MapPanel(props: IDockviewPanelProps<PanelParams>) {
  return (
    <WhenFirstActive api={props.api}>
      <Suspense fallback={<div className="panel"><p className="not-landed">bringing up the map…</p></div>}>
        <LazyMapPanel {...props} />
      </Suspense>
    </WhenFirstActive>
  );
}

/** Which React component renders each configured view id. */
const panelComponents: Record<string, React.FunctionComponent<IDockviewPanelProps<PanelParams>>> = {
  intro: IntroPanel,
  background: BackgroundPanel,
  system: SystemPanel,
  holdings: HoldingsPanel,
  operator: OperatorPanel,
  map: MapPanel,
  messages: MessagesPanel,
};

/** The four views are the harness's faces, not documents: rearrangeable, never closable. */
function PermanentTab(props: IDockviewPanelHeaderProps) {
  return <DockviewDefaultTab hideClose {...props} />;
}

export function Shell({ config, client, validator, manifest, onImportManifest }: ShellProps) {
  const apiRef = useRef<DockviewApi>();
  const [importRefusal, setImportRefusal] = useState<string | undefined>();

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      apiRef.current = event.api;
      for (const view of config.views) {
        if (!(view.id in panelComponents)) {
          throw new Error(`configuration names view '${view.id}' but the shell has no panel for it`);
        }
        event.api.addPanel<PanelParams>({
          id: view.id,
          component: view.id,
          title: view.label,
          params: { config, client, validator, manifest, address: createPanelAddress(view.id) },
        });
      }
      const requested = viewFromHash(window.location.hash);
      const initial = requested ?? config.views[0].id;
      event.api.getPanel(initial)?.api.setActive();
      event.api.onDidActivePanelChange(({ panel }) => {
        if (!panel) return;
        // Undefined means the address already names this panel — possibly at a
        // position below it, which an activation must not erase (views.ts).
        const rewritten = hashOnActivation(window.location.hash, panel.id);
        if (rewritten !== undefined) window.history.replaceState(null, '', rewritten);
      });
    },
    [config, client, validator, manifest],
  );

  useEffect(() => {
    const onHashChange = () => {
      const requested = viewFromHash(window.location.hash);
      if (requested) apiRef.current?.getPanel(requested)?.api.setActive();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const exportManifest = useCallback(() => {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${manifest.run_id}.manifest.json`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }, [manifest]);

  const importManifestFile = useCallback(
    (file: File) => {
      void file.text().then((text) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          setImportRefusal('that file is not JSON');
          return;
        }
        setImportRefusal(onImportManifest(parsed));
      });
    },
    [onImportManifest],
  );

  return (
    <div className="shell">
      <header className="shell-header">
        <span className="shell-title">drogna</span>
        <span className="shell-disclaimer">synthetic throughout — holds no third-party entities</span>
        <ClockStrip config={config} client={client} />
        <span className="shell-run" title="run id">{manifest.run_id}</span>
        <button onClick={exportManifest}>export manifest</button>
        <label className="shell-import">
          import manifest
          <input
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importManifestFile(file);
              event.target.value = '';
            }}
          />
        </label>
        {importRefusal && <span className="shell-refusal">{importRefusal}</span>}
      </header>
      <div className="shell-body">
        <DockviewReact
          className="dockview-theme-abyss"
          components={panelComponents}
          defaultTabComponent={PermanentTab}
          onReady={onReady}
        />
      </div>
    </div>
  );
}
