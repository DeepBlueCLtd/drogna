// The violation. The glance must not pin the clock — it exists to show the system as it
// is, including its motion — so an import of the pair's pinning is not a shortcut, it is
// the glance becoming a different mechanism. The separation test must catch this line.
import { pin } from "../pair/pin.mjs";

export function glance() {
  return pin();
}
