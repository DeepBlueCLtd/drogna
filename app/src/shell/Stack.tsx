/**
 * The narrow presentation (feature 112, FR-003, FR-004, FR-009; ADR-0033).
 *
 * One view at a time, behind the same tabs. The tabs are the requirement the feature
 * opened with and they are kept whole: every configured view, in configured order, with
 * its configured label. The strip scrolls sideways when the labels do not fit — nothing
 * is hidden behind an overflow control, and no label is abbreviated to make seven fit,
 * because a viewer cannot choose between things they cannot read. Views come from
 * configuration (Constitution IV), so nothing here may assume how many there are.
 *
 * **Every view is mounted; one is shown.** dockview keeps an inactive panel's React tree
 * mounted but detached — `panels/map/attach.ts` exists because of that — so the stack
 * mounts all of them and hides the rest. What is running does not change with the
 * presentation: Messages counts every message it receives whether or not it is the tab
 * on screen. Rendering only the shown view would be cheaper and would make the
 * harness's behaviour depend on which tab a viewer happened to open, which is precisely
 * what "presentation only" denies (SRD FR-14).
 *
 * The one exception to "every view is mounted" is a view the registry defers
 * (`DEFERRED_VIEWS`) — today the map, whose renderer is a third of the bundle and which
 * nothing else reaches. That is a fact about the panel rather than about this
 * presentation, so it is stated there and observed here against the shown view, which is
 * what the stack has in place of dockview's panel API. It latches: once shown, the panel
 * stays mounted and keeps what it has accumulated.
 *
 * There is no drag rearrangement here. FR-14 already holds arrangement to be
 * presentation only, so a presentation with nothing to arrange loses nothing a
 * requirement claims — and a drag handle that does nothing is worse than none.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ConfigShell } from '../generated/types.js';
import { DEFERRED_VIEWS, panelComponents, type PanelParams } from './registry.js';

export interface StackProps {
  readonly config: ConfigShell;
  readonly active: string;
  readonly onSelect: (viewId: string) => void;
  /** The params for a view, built by the shell exactly as the dock builds them. */
  readonly paramsFor: (viewId: string) => PanelParams;
}

export function Stack({ config, active, onSelect, paramsFor }: StackProps): ReactNode {
  const stripRef = useRef<HTMLDivElement>(null);
  // Which views have been shown at least once. Seeded with the one the address named, so
  // a deep link to a deferred view loads it at once rather than after a second render.
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set([active]));

  useEffect(() => {
    setShown((previous) => (previous.has(active) ? previous : new Set(previous).add(active)));
  }, [active]);

  // The active tab is scrolled into view whenever the active view changes — including
  // when it changes from the address bar, which is the case a click-only implementation
  // misses: a deep link to the seventh view would open with the strip showing the first
  // three and no sign that the shown view is a tab at all.
  useEffect(() => {
    const tab = stripRef.current?.querySelector<HTMLElement>(`[data-view="${active}"]`);
    // An environment with no layout has nothing to scroll and does not implement this;
    // the tab strip is still correct there, which is why the guard is a skip and not a
    // shim.
    if (typeof tab?.scrollIntoView === 'function') {
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [active]);

  return (
    <div className="stack" data-presentation="stack">
      <div className="stack-tabs" role="tablist" aria-label="views" ref={stripRef}>
        {/*
          A consumer view's tab is drawn in its own chrome at both widths (feature 116,
          FR-76), so the declared kind travels into both presentations rather than into
          whichever was easier: a screenshot taken at a phone's width carries exactly the
          same claim as one taken at a desk.
        */}
        {config.views.map((view) => (
          <button
            key={view.id}
            type="button"
            role="tab"
            id={`stack-tab-${view.id}`}
            data-view={view.id}
            data-kind={view.kind ?? 'harness'}
            aria-selected={view.id === active}
            aria-controls={`stack-view-${view.id}`}
            className={view.id === active ? 'stack-tab stack-tab-active' : 'stack-tab'}
            onClick={() => onSelect(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="stack-body">
        {config.views.map((view) => {
          const Panel = panelComponents[view.id];
          if (!Panel) {
            throw new Error(`configuration names view '${view.id}' but the shell has no panel for it`);
          }
          return (
            <div
              key={view.id}
              className="stack-view"
              id={`stack-view-${view.id}`}
              role="tabpanel"
              aria-labelledby={`stack-tab-${view.id}`}
              data-view={view.id}
              hidden={view.id !== active}
            >
              {!DEFERRED_VIEWS.has(view.id) || shown.has(view.id) ? (
                <Panel params={paramsFor(view.id)} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
