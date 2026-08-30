// A deliberate violation, for the gate that forbids it: the same leak as
// truth-initialisation.ts, reached through the departure brief instead of the now-cast.
// Planted because the brief is the true field held constant from the origin, so a run
// started from it is a run no measurement changed — and until feature 118 extended the
// accessor list, this file would have passed the gate written to catch exactly it.
export function initialise(store: { departureHolding: () => unknown }): unknown {
  const brief = store.departureHolding();
  return brief;
}
