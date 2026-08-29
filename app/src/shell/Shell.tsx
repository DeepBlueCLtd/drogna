/**
 * The shell (V2-C19): the dockable multi-panel front-end (FR-14, ADR-0028).
 * dockview owns the layout; each panel is a React component; the four first-run tabs
 * come from the shell's configuration document, never from literals here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { hashForView, viewFromHash } from './views.js';
import { IntroPanel } from '../panels/intro/IntroPanel.js';
import { SystemPanel } from '../panels/system/SystemPanel.js';
import { HoldingsPanel } from '../panels/holdings/HoldingsPanel.js';
import { OperatorPanel } from '../panels/operator/OperatorPanel.js';
import { MapPanel } from '../panels/map/MapPanel.js';
import { MessagesPanel } from '../panels/messages/MessagesPanel.js';
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
}

/** Which React component renders each configured view id. */
const panelComponents: Record<string, React.FunctionComponent<IDockviewPanelProps<PanelParams>>> = {
  intro: IntroPanel,
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
          params: { config, client, validator, manifest },
        });
      }
      const requested = viewFromHash(window.location.hash);
      const initial = requested ?? config.views[0].id;
      event.api.getPanel(initial)?.api.setActive();
      event.api.onDidActivePanelChange(({ panel }) => {
        if (panel && viewFromHash(window.location.hash) !== panel.id) {
          window.history.replaceState(null, '', hashForView(panel.id));
        }
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
