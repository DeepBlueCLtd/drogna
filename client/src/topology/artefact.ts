/**
 * The generated topology artefact, imported as the single structural source.
 *
 * `contracts/topology.json` is derived from the tree by `scripts/scan_topology.py` and
 * held current by the drift gate registered with the other gates; this module is the one
 * place the client reads it, the same compile-time import discipline `contracts/schemas.ts`
 * established for the masters. Nothing structural about the matrix may come from anywhere
 * else — not a list written in client source, not a value observed at runtime (SC-004).
 *
 * The artefact is permissions and source locations, never behaviour: it says what the
 * broker would accept and where the tree names a topic, and nothing about what is
 * running. Lighting is the matrix's business and comes from received traffic alone.
 */
import artefact from "../../../contracts/topology.json";

import type { DrognaBrokerTopology } from "../generated/messages/topology";

/**
 * The committed instance, under its generated type.
 *
 * An assertion rather than a runtime validation, deliberately: the instance is committed,
 * `tests/unit/test_topology_artefact.py` asserts it validates against its master and
 * equals a fresh scan, and the drift gate fails the build when it goes stale. Validating
 * it again in the browser would be a second check of a document that cannot vary at run
 * time — it is compiled into the bundle.
 */
export const TOPOLOGY: DrognaBrokerTopology = artefact as DrognaBrokerTopology;
