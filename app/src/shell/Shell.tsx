/**
 * The shell (V2-C19): the dockable multi-panel front-end (FR-14, ADR-0028), in two
 * presentations of one set of views (FR-47, ADR-0033).
 *
 * Above a declared width the dock is dockview's, exactly as feature 101 built it. Below
 * it the same panels, from the same registry and behind the same addresses, are stacked
 * one at a time behind the same tabs (`Stack.tsx`). The choice is made from the measured
 * width of the shell's own body — never a user agent, never a build flag — so a panel
 * docked narrow on a large display is treated the same as a phone.
 *
 * The panels are told nothing about which presentation they are in. Each measures its
 * own root and discloses its own secondary surfaces, which is what keeps this feature to
 * one switch here and a rule each panel applies to itself.
 *
 * Crossing the threshold is a remount: React swaps one tree for the other, so panel-local
 * state (a selected message, a scroll position) does not survive it. Said plainly rather
 * than left to be discovered — what does survive is the address, and therefore the view,
 * which is the thing a link promised.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import { createPanelAddress, hashForView, hashOnActivation, viewFromHash } from './views.js';
import { DEFERRED_VIEWS, panelComponents, type PanelParams } from './registry.js';
import { Disclosure } from './Disclosure.js';
import { Stack } from './Stack.js';
import { ClockStrip } from './ClockStrip.js';
import { HelpButton } from './walkthrough/HelpButton.js';
import { componentTour } from './walkthrough/tour.js';
import { presentationFor, useMeasuredSize, viewportHeight, viewportWidth } from './viewport.js';
import './shell.css';

export interface ShellProps {
  config: ConfigShell;
  client: SeamClient;
  validator: SeamValidator;
  manifest: RunManifest;
  /** Returns a refusal naming the fault, or undefined on success. */
  onImportManifest: (candidate: unknown) => string | undefined;
}

export type { PanelParams };

/** The views are the harness's faces, not documents: rearrangeable, never closable. */
function PermanentTab(props: IDockviewPanelHeaderProps) {
  return <DockviewDefaultTab hideClose {...props} />;
}

/**
 * How the dock observes "first shown", for a view the registry defers (`DEFERRED_VIEWS`).
 * dockview mounts every panel's React tree at once — detached, as `panels/map/attach.ts`
 * records — so the panel API's own activity is the only thing that says whether the
 * viewer has actually asked for this view. A deep link naming it activates it during
 * layout restore, so arriving at that address still loads it at once.
 *
 * `seen` latches: the panel is mounted once and never unmounted again, so switching away
 * neither tears down the canvas nor loses what the panel has accumulated. The stack does
 * the same thing against the shown view, which is what it has instead of this API.
 */
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

/**
 * The registry's components, wrapped for dockview. Every view renders from the one
 * registry (FR-005); the wrapper adds only what dockview alone can supply — the panel
 * API a deferred view is gated on.
 */
const dockComponents: Record<string, React.FunctionComponent<IDockviewPanelProps<PanelParams>>> =
  Object.fromEntries(
    Object.entries(panelComponents).map(([id, Panel]) => [
      id,
      DEFERRED_VIEWS.has(id)
        ? (props: IDockviewPanelProps<PanelParams>) => (
            <WhenFirstActive api={props.api}>
              <Panel params={props.params} />
            </WhenFirstActive>
          )
        : (props: IDockviewPanelProps<PanelParams>) => <Panel params={props.params} />,
    ]),
  );

export function Shell({ config, client, validator, manifest, onImportManifest }: ShellProps) {
  const apiRef = useRef<DockviewApi>();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [importRefusal, setImportRefusal] = useState<string | undefined>();
  const [active, setActive] = useState(() => viewFromHash(window.location.hash) ?? config.views[0].id);

  const measured = useMeasuredSize(bodyRef);
  // Before anything has been measured the viewport is the best guess there is; without
  // it a phone mounts the dock for a frame and then throws it away, deck.gl included.
  const presentation = presentationFor(
    measured.width ?? viewportWidth(),
    measured.height ?? viewportHeight(),
  );
  const narrow = presentation === 'stack';

  /**
   * One `PanelParams` per view, built once. A fresh object per render would remount
   * every panel on every render of the shell, and `createPanelAddress` would hand out a
   * new address seam each time.
   */
  const params = useMemo(() => {
    const table: Record<string, PanelParams> = {};
    for (const view of config.views) {
      table[view.id] = {
        config,
        client,
        validator,
        manifest,
        address: createPanelAddress(view.id),
      };
    }
    return table;
  }, [config, client, validator, manifest]);

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
          params: params[view.id],
        });
      }
      const requested = viewFromHash(window.location.hash);
      const initial = requested ?? config.views[0].id;
      event.api.getPanel(initial)?.api.setActive();
      event.api.onDidActivePanelChange(({ panel }) => {
        if (!panel) return;
        setActive(panel.id);
        // Undefined means the address already names this panel — possibly at a
        // position below it, which an activation must not erase (views.ts).
        const rewritten = hashOnActivation(window.location.hash, panel.id);
        if (rewritten !== undefined) window.history.replaceState(null, '', rewritten);
      });
    },
    [config, params],
  );

  /**
   * Open a view by id, through the same path a link does. The walkthrough uses it to
   * reach the tab its steps highlight: a step pointing at an element on a tab you are
   * not looking at points at nothing.
   */
  const openView = useCallback((view: string) => {
    apiRef.current?.getPanel(view)?.api.setActive();
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const requested = viewFromHash(window.location.hash);
      if (!requested) return;
      setActive(requested);
      apiRef.current?.getPanel(requested)?.api.setActive();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /** A tab in the stack. The address is written the same way an activation writes it. */
  const selectView = useCallback((viewId: string) => {
    setActive(viewId);
    const rewritten = hashOnActivation(window.location.hash, viewId);
    if (rewritten !== undefined) window.history.replaceState(null, '', rewritten);
    else if (window.location.hash === '') window.history.replaceState(null, '', hashForView(viewId));
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
    <div className="shell" data-presentation={presentation}>
      <header className="shell-header" data-narrow={narrow}>
        <span className="shell-title">drogna</span>
        <ClockStrip config={config} client={client} />
        {/*
          The run id and the manifest controls disclose at a narrow width; the
          disclaimer does not, and never will. Chrome may be compacted or moved behind a
          label — the statement that the data is synthetic may not (FR-007). It is the
          same sentence at both widths rather than a shorter second copy.
        */}
        <Disclosure label="run and manifest" narrow={narrow} className="shell-run-controls">
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
        </Disclosure>
        <span className="shell-disclaimer">synthetic throughout — holds no third-party entities</span>
        {/* Last in the header, so it sits at the top right: the one control here that
            is for the reader rather than for the harness (feature 110). It stays out of
            the disclosure above — a help control folded behind a "more" label is one
            the people who need it will not find. */}
        <HelpButton tour={componentTour(config)} onOpenView={openView} />
      </header>
      <div className="shell-body" ref={bodyRef}>
        {narrow ? (
          <Stack
            config={config}
            active={active}
            onSelect={selectView}
            paramsFor={(viewId) => params[viewId]}
          />
        ) : (
          <DockviewReact
            className="dockview-theme-abyss"
            components={dockComponents}
            defaultTabComponent={PermanentTab}
            onReady={onReady}
          />
        )}
      </div>
    </div>
  );
}
