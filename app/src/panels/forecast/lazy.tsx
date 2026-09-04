/**
 * The Forecast tab's one deck.gl surface, withheld until something asks for it.
 *
 * The reasoning is the Data tab's, and the measurement behind it is the same
 * (`spikes/load-time`, and the note at the head of `registry.tsx`): the deck.gl/luma.gl stack is
 * about a third of the bundle, and the view registry defers the Map for exactly that. Everything
 * else this tab draws — the gauge, the share field, the rays, the profile, the timeline — is
 * markup and SVG and costs nothing to open. Importing the volume directly would pull that third
 * of the bundle back through a different door and quietly undo the deferral, which is what
 * `data/lazy.tsx` was written to stop happening on the Data tab.
 *
 * So the split is here rather than at the view: opening Forecast costs what it always cost, and
 * opening a volume costs what a volume costs.
 */
import { Suspense, lazy } from 'react';
import type { ComponentProps } from 'react';
import type { Volume as VolumeComponent } from './Volume.js';

const VolumeInner = lazy(async () => ({ default: (await import('./Volume.js')).Volume }));

export function Volume(props: ComponentProps<typeof VolumeComponent>) {
  return (
    <Suspense
      fallback={
        // Named, because a silent gap where a drawing is going to be reads as a drawing that
        // failed. This is the one state the reader meets before any query has been made.
        <p className="not-landed" data-testid="forecast-volume-state">
          the volume is loading…
        </p>
      }
    >
      <VolumeInner {...props} />
    </Suspense>
  );
}
