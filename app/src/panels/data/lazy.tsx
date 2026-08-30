/**
 * The Data tab's two deck.gl surfaces, withheld until something asks for them.
 *
 * The map is deferred for a measured reason (`spikes/load-time`, and the note at the head
 * of `registry.tsx`): its deck.gl/luma.gl stack is about a third of the bundle, and no
 * other view reached it. This tab reaches it twice — the volume and the advisory canvas —
 * and importing them directly would have pulled that third of the bundle back into the
 * first load through a different door, quietly undoing the deferral the spike bought.
 *
 * The tab itself does not need them. Its tree, its timelines, its tables and its
 * measurement chart are markup and SVG; only the volume and the shore canvas draw with
 * WebGL. So the split is here rather than at the view: opening the Data tab costs
 * nothing, and opening a volume costs what a volume costs.
 */
import { Suspense, lazy } from 'react';
import type { ComponentProps } from 'react';
import type { Volume as VolumeComponent } from './Volume.js';
import type { ShoreUpdates as ShoreUpdatesComponent } from './ShoreUpdates.js';

const VolumeInner = lazy(async () => ({ default: (await import('./Volume.js')).Volume }));
const ShoreUpdatesInner = lazy(async () => ({ default: (await import('./ShoreUpdates.js')).ShoreUpdates }));

function arriving(what: string) {
  // Marked, so a proof waits for the surface itself rather than measuring this. The
  // mobile capture measured a placeholder's geometry for one run and reported it as the
  // map's; the marker is what stopped that being possible again.
  return (
    <div className="panel" data-testid="panel-arriving">
      <p className="not-landed">bringing up {what}…</p>
    </div>
  );
}

export function Volume(props: ComponentProps<typeof VolumeComponent>) {
  return <Suspense fallback={arriving('the volume')}>{<VolumeInner {...props} />}</Suspense>;
}

export function ShoreUpdates(props: ComponentProps<typeof ShoreUpdatesComponent>) {
  return <Suspense fallback={arriving('the shore canvas')}>{<ShoreUpdatesInner {...props} />}</Suspense>;
}
