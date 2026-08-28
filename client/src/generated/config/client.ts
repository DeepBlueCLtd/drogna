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
   * Simulation time arrives by subscription to ctl/clock (ADR-0009). The HTTP interface is used for two things: asking what the time is at startup, so the page is not blank until the next sample, and asking the clock for a rate. The rate control is the browser's by SRD FR-10 and FR-49, and a rate of zero pins the clock for a capture (FR-53). It is a request and never an assertion: the rate the page displays is the one the clock reports in force on ctl/clock, never the one that was asked for. Where the control route is absent the page still renders the control and says why it cannot act, rather than appearing to act and doing nothing.
   */
  clock: {
    /**
     * How long, in host seconds, the client waits for a time sample before reporting the clock stale. Staleness is the absence of samples and is not the same as a rate of zero, which is a state the clock reports and which stops emission legitimately (FR-53).
     */
    stale_after_seconds: number;
    /**
     * Base URL of the clock service's HTTP interface as the browser reaches it. Empty means the page's own origin — the one-door topology routes the clock through the proxy (ADR-0025), and a relative URL is what keeps the request same-origin whatever host name the viewer arrived by; an absolute URL naming a different host is preflighted, and a preflight carries no credential, so the boundary's clearance refuses it before the clock is ever asked. Absent means the client waits for the first sample instead.
     */
    endpoint?: string;
    /**
     * Routes relative to the endpoint. The read route is required; the control route is optional, because a destination may serve a page that can watch the clock without being able to set it.
     */
    routes?: {
      /** What the time is now, for a page that has just loaded. */
      snapshot: string;
      /**
       * Where a rate change is asked for, by POST. The clock decides; a request may be clamped or refused, and the display shows the rate the clock reports in force rather than the rate that was asked for (SRD FR-10, FR-49, FR-53).
       */
      control?: string;
    };
  };
  /**
   * Where the client reads the forecast, the uncertainty field and the conditions along a recommended route, through the reverse proxy under one path policy (ADR-0008, Constitution X). Freshness is never discovered here: a new run is announced on ctl/run-published and the client reads only when it has been told there is something new (SRD FR-31). The collection identifiers are not configured — they arrive in the announcement, so publishing a run adds collections without any document being edited.
   */
  query: {
    /**
     * Base URL of the query layer as the browser reaches it: the boundary, never the query layer's own port. Empty means the page's own origin, which is the boundary once the page is served through it — and is the only form a browser can read the answer of, since the released prefix sends no CORS grant and a cross-origin read is refused by the viewer's own browser however the request fares.
     */
    endpoint: string;
    /**
     * Path under the endpoint at which collections are addressed. A collection identifier from a run announcement is appended to it.
     */
    collections_path: string;
    /**
     * Path under a collection at which an OGC API-EDR trajectory query is served. Per-vertex arrival times travel as the M ordinate of a WKT LINESTRING ZM in the coords parameter (SRD FR-20). Absent where the destination does not serve trajectory queries, in which case the route renders without conditions along it rather than with conditions for the wrong moment.
     */
    trajectory_path?: string;
    /**
     * Which forecast parameters to ask for along a route. Named here rather than in source because what a destination serves is a property of the destination.
     */
    route_parameters?: string[];
    /**
     * Path under a collection at which an OGC API-EDR cube query is served. The map asks for one cube per announcement, at the extent the announcement stated, and draws that. Absent where the destination does not serve cube queries, in which case the map renders the extent and states that no field can be read rather than drawing a field it did not fetch.
     */
    cube_path?: string;
    /**
     * Which parameter the map draws as the uncertainty field. Named here for the same reason route_parameters is: which parameter carries the ensemble spread is a property of what the destination serves, not of the client. Absent means the map has not been told what to draw and says so.
     */
    field_parameter?: string;
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
    /**
     * How many messages each control topic keeps, oldest evicted first, so an hour of demonstration has a stable memory footprint. It bounds how far back a viewer can read and can neither light a component nor draw a transit.
     */
    buffer_depth?: number;
    /**
     * How many arrivals in one frame before transits on the same boundary are drawn as one mark carrying the count. A display bound: it changes how many marks are drawn and never how many messages are counted.
     */
    coalescing_threshold?: number;
    /**
     * The largest number of uncertainty cells drawn before the field is downsampled. The resolution actually shown is stated on the display, never reduced silently.
     */
    maximum_drawn_cells?: number;
    /**
     * Whether the render path may smooth the display between two received clock samples using the browser's animation frame timestamp, under the three rules of ADR-0007. False renders on clock samples alone, which costs smoothness and nothing else.
     */
    interpolate_between_samples?: boolean;
  };
  /**
   * Where the scenario is, for a surface that must not invent geography. The extent a run's field is drawn in comes from the announcement's own grid bounds and never from here; this is what the map has to draw before any run has been announced, which is the state a harness whose loop has not yet turned is honestly in. Optional: a document that omits it renders the statement that no extent has been served rather than failing to start, and a client that has neither an announcement nor a declaration draws no frame at all.
   */
  map?: {
    /**
     * The destination's declaration of the scenario's horizontal extent, in CRS84 degrees. The same numbers the destination declares as its domain elsewhere; declared again here because the client cannot read that document and cannot enumerate collections through the boundary.
     */
    extent: {
      minimum_longitude: number;
      minimum_latitude: number;
      maximum_longitude: number;
      maximum_latitude: number;
    };
    /**
     * The depth range the scenario covers, in metres, positive downwards, as the coverage's own vertical convention has it. Used to label the volume mode's depth axis before a run has been announced.
     */
    vertical?: {
      minimum_depth_m: number;
      maximum_depth_m: number;
    };
    /**
     * Spacing of the graticule the map draws, in degrees. Absent means the map chooses a spacing from the extent's own span, which is what keeps a wide extent from being drawn as a black rectangle of meridians.
     */
    graticule_spacing_degrees?: number;
  };
}
