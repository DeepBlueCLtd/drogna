// DO NOT EDIT.
// Generated from contracts/schemas/config.proxy.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

import type { Broker, Clock, Component, Logging, Seed } from "./common";

/**
 * Configuration for C-10, the reverse proxy that is the harness's whole exposure boundary. Everything a caller can reach is named here and nothing else is reachable, which is Constitution X expressed as a document: releasing is an act, and a collection the query layer began serving on its own (FR-21) stays refused until somebody adds it to released.collections and the configuration is rendered again. The clock, seed and broker sections every other component carries are optional here and are read by nothing: the proxy is nginx, it holds no state, it derives no time and it opens no broker connection of its own. They are declared so that a destination's files have one shape.
 */
export interface DrognaReverseProxyConfiguration {
  component: Component;
  clock?: Clock;
  seed?: Seed;
  broker?: Broker;
  logging: Logging;
  /**
   * Where the proxy listens, what it is willing to pass through, and where each released thing lives upstream. Read once at render time; nothing here is consulted per request.
   */
  proxy: {
    /**
     * The one socket a caller can reach. Everything answered on it is either a released location or the refusal.
     */
    listen: {
      /** Address to bind, container-internal. */
      host: string;
      port: number;
      /**
       * The name this deployment answers to. An underscore is nginx's catch-all and is what a destination with no hostname uses.
       */
      server_name: string;
    };
    /**
     * Certificate and key locations, provisioned by the deployment (NFR-06) and only consumed here. Termination is off at a destination that has no certificate, which is the local one; a destination that terminates and has no material is a render failure rather than a listener that quietly serves plaintext.
     */
    tls: {
      /**
       * Whether this destination terminates TLS. The locations below are declared whatever the answer, because a destination differs from another in its values and never in its keys.
       */
      enabled: boolean;
      certificate: string;
      key: string;
      /**
       * Protocol versions offered. A list rather than a constant because deprecating one is a configuration change.
       */
      protocols: string[];
    };
    /**
     * Binary access, per ADR-0001: a caller holds this credential set or holds nothing. The file is produced at deploy time and is never tracked. There is no user model here because there is nothing for one to express.
     */
    credentials: {
      /**
       * The challenge realm. It is shown to a human and must name nothing about what is behind it.
       */
      realm: string;
      /** Location of the credential file the proxy reads. Untracked, produced at deploy time. */
      file: string;
    };
    /**
     * The two upstreams this proxy is willing to reach, both by service name on the internal network. Neither is published to a host: reaching them is what the proxy is for.
     */
    upstream: {
      query: {
        /** Base URL of the query layer. */
        url: string;
        /**
         * The query layer's own path under which one collection lives, with no trailing slash. A released collection identifier is appended to it. This is the native path FR-002 refuses to expose, named here so that the released prefix can be mapped onto it.
         */
        collection_path: string;
      };
      /**
       * The far end of ADR-0008. The listener is deliberately unpublished, so this upgrade location is the only way a browser reaches the control namespace.
       */
      control_websocket: {
        /** Base URL of the broker's WebSocket listener. */
        url: string;
        /** The path on that listener the upgrade is proxied to. */
        path: string;
      };
    };
    /**
     * The single place exposure is opted into. A collection absent from the list has no location in the rendered configuration at all, so adding one to the query layer cannot expose it (FR-003).
     */
    released: {
      /**
       * The one path prefix beneath which released collections are reachable. A single leading-slash segment.
       */
      prefix: string;
      /**
       * Released collection identifiers. The key is required, so an absent list is a startup failure rather than a silent empty release; the list being non-empty is refused by the renderer instead of here, because the destination validator that runs on a machine with nothing but a container runtime implements no array-length keyword and refuses a schema that uses one rather than ignoring it.
       */
      collections: string[];
      /**
       * The variables a released artefact may carry (FR-014). A variable driven by observation age is absent from this list by design: an age field is a map of measurement locations, and tests/leakage/test_updated_region.py is what holds that in place.
       */
      variables: string[];
    };
    /**
     * One protocol-upgrade location at a dedicated prefix, proxying MQTT-over-WebSockets to the broker. It is subject to the same default deny as every other path, but it is a different exposure surface: policy is evaluated once, at the upgrade, and the connection then persists carrying traffic the proxy does not inspect per message. What a subscriber may receive is therefore settled by the broker's access control lists, not here, and is tested there.
     */
    control: {
      /**
       * The dedicated path prefix carrying the upgrade. Distinct from the released prefix so that neither can widen the other.
       */
      upgrade_prefix: string;
      /**
       * How long an idle upgraded connection is held open. A socket parameter: the control namespace is quiet between heartbeats and a short timeout would close a healthy subscription.
       */
      read_timeout_seconds: number;
      /** The WebSocket subprotocol offered upstream, where the deployment pins one. */
      subprotocol?: string;
    };
    /**
     * A second listener, container-internal and never published, carrying one location that answers a container health probe. It is separate because the published listener cannot have one: a location that answers 200 to an uncleared caller is exactly what FR-006 forbids, and a probe that has to hold the clearance is a credential in a Compose file.
     */
    health: {
      port: number;
      path: string;
    };
    /**
     * The rendered file is a build artefact. It is written here, validated with nginx -t, and never edited.
     */
    rendered: {
      output: string;
    };
    /**
     * Every refusal is recorded with the normalised path and the rule that refused it (FR-020), so an unexpected refusal is diagnosable without loosening policy to find out what happened. These files carry the host clock, which Constitution I permits as log line decoration; no decision in this feature reads one.
     */
    logs: {
      access: string;
      error: string;
      error_level: "debug" | "info" | "notice" | "warn" | "error" | "crit" | "alert" | "emerg";
    };
    /**
     * Metres. Two uses, both about withholding measurement geometry: the provenance scanner flags a coordinate pair falling within this distance of a measurement location (FR-012), and the updated-region test buffers the measurement geometry by it before scoring a change mask against it (FR-015).
     */
    identification_radius_m: number;
    /**
     * The step a released value is quantised to. A difference at or below it between two successive released products is not a change, which is what makes the change mask of FR-015 well defined rather than a map of floating-point noise.
     */
    quantisation_step: number;
  };
}
