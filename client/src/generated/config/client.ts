// DO NOT EDIT.
// Generated from contracts/schemas/config.client.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The document the browser client (C-18) fetches before it opens any transport, and the only place a location may be named for it. A browser reads no environment variable, so the single-variable rule of NFR-04 becomes a single served document reached by one relative bootstrap URL, which is the client's one permitted literal and carries an inline exemption marker naming this schema. Nothing here can light a component: the document names where to listen and how long to keep believing what was heard, and Constitution VII means illumination comes from received heartbeats and nothing else. A window is a tolerance, not a claim that a component exists.
 */
export interface DrognaBrowserClientRuntimeConfiguration {
  /**
   * How the browser reaches the control namespace: an MQTT-over-WebSockets connection through the reverse proxy's upgrade location (ADR-0008). The identity is subscribe-only; the client publishes on no topic.
   */
  broker: {
    /**
     * WebSocket URL of the proxy's upgrade location. Not the broker's own port: everything stays behind one reverse proxy under one policy.
     */
    url: string;
    /**
     * The MQTT client identifier. Deterministic, never derived from entropy or a host clock (Constitution II). Two viewers served the same identifier will disconnect one another, so a deployment that expects several viewers issues a distinct identifier per served document.
     */
    client_id: string;
    /** Transport keepalive. A socket parameter, not simulation time. */
    keepalive_seconds?: number;
    /**
     * How long the transport waits before retrying a dropped connection. Zero disables retrying.
     */
    reconnect_period_seconds?: number;
  };
  /**
   * Simulation time arrives by subscription to ctl/clock (ADR-0009). The HTTP interface is optional here and is used for one thing only: asking what the time is at startup, so the page is not blank until the next sample. The client offers no control over the clock; the rate is pinned for capture against the clock's own control surface, not from here.
   */
  clock: {
    /**
     * How long, in host seconds, the client waits for a time sample before reporting the clock stale. Staleness is the absence of samples and is not the same as a rate of zero, which is a state the clock reports and which stops emission legitimately (FR-53).
     */
    stale_after_seconds: number;
    /**
     * Base URL of the clock service's HTTP interface, where the deployment exposes it to the browser. Absent means the client waits for the first sample instead.
     */
    endpoint?: string;
    /**
     * Routes relative to the endpoint. Only the read route appears here: the client is not a controller.
     */
    routes?: {
      /** What the time is now, for a page that has just loaded. */
      snapshot: string;
    };
  };
  /**
   * How long a received heartbeat is taken as evidence, when its sender did not declare that itself. Real time by ADR-0006: a rate of zero stops simulated time and stops nothing else, so a pinned clock keeps its lit components lit for the duration of a capture.
   */
  liveness: {
    /**
     * The window applied to a heartbeat that declares neither a window nor an interval. One scalar tolerance, deliberately not a table of components: a table would be a list of what ought to exist, which is what Constitution VII forbids.
     */
    default_window_seconds: number;
    /**
     * Applied to a declared interval when the sender declares an interval but no window: a sender that says it speaks every n seconds is believed for a small multiple of n, so one dropped message is not read as death.
     */
    window_multiplier?: number;
    /**
     * Whether evidence that expires while the transport is down renders as indeterminate rather than dark. Default true: a client that has gone deaf cannot honestly say a component died. It can never light anything — indeterminate is not lit.
     */
    disconnected_is_indeterminate?: boolean;
  };
  /**
   * Rendering settings, and nothing that changes what is believed. A high clock rate degrades the frame rate and never the truth: every received heartbeat is folded into liveness state whether or not a frame is drawn for it.
   */
  display: {
    /**
     * Minimum host milliseconds between re-renders. The frame budget, not a sampling interval for liveness.
     */
    frame_interval_ms: number;
  };
}
