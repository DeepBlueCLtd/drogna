/**
 * Reading a property off a constructed layer, without pretending to know its type.
 *
 * `layers.ts` hands back the drawing library's base layer type, because what the surface
 * needs of a layer is that it can be drawn and not which of a dozen shapes it is. A test
 * that wants to assert what a particular layer will draw has to reach past that, and doing
 * it here once — with the widening named and confined to the test tree — is better than
 * doing it inline eight times with eight different casts.
 */
import { expect } from "vitest";

import type { Layer } from "@deck.gl/core";

/** One property of a layer, as the layer holds it. */
export function layerProp<T>(layer: Layer | undefined, name: string): T {
  expect(layer, `there is no layer to read ${name} from`).toBeDefined();
  const properties = layer?.props as unknown as Record<string, unknown>;
  expect(properties[name], `the layer carries no ${name}`).toBeDefined();
  return properties[name] as T;
}
