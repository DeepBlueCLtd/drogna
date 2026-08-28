/**
 * Flat or volume, in one interaction either way.
 *
 * SC-006 asks that volume mode be reachable in one interaction from the flat map and that
 * switching either way complete without a fetch. The second half is a property of where the
 * mode is held rather than of this control: the surface holds it, and the volume is a second
 * reading of the cube the flat view already drew, so there is nothing for a switch to ask
 * for. This control does the first half and nothing else.
 *
 * Two buttons rather than one that toggles, because a single button has to be labelled with
 * either the state it is in or the state it would move to, and both readings are common
 * enough that a viewer cannot tell which they are looking at. Two buttons with the current
 * one marked says both at once.
 */
import type { MapMode } from "./mapReadiness";

export interface VolumeToggleProps {
  readonly mode: MapMode;
  readonly onChoose: (mode: MapMode) => void;
}

const WORDS: Readonly<Record<MapMode, string>> = {
  flat: "Flat map",
  volume: "Volume",
};

export function VolumeToggle({ mode, onChoose }: VolumeToggleProps): JSX.Element {
  return (
    <div className="map-mode" data-testid="map-mode-toggle" data-mode={mode}>
      {(["flat", "volume"] as const).map((candidate) => (
        <button
          key={candidate}
          type="button"
          data-testid={`map-mode-${candidate}`}
          data-selected={String(candidate === mode)}
          aria-pressed={candidate === mode}
          onClick={() => {
            onChoose(candidate);
          }}
        >
          {WORDS[candidate]}
        </button>
      ))}
    </div>
  );
}
