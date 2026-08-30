// A deliberate violation, for the gate that forbids it: a component outside the
// permitted four reaching for the truth-derived field to initialise from.
export function initialise(store: { currentNowcast: () => unknown }): unknown {
  const truth = store.currentNowcast();
  return truth;
}
