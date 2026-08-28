// DO NOT EDIT.
// Generated from contracts/schemas/config.capture.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The one document the three capture mechanisms read. Feature 016 builds a glance, a pair and a curated capture that deliberately share no entry point, no output area, no retention rule and no gate; what they do share is where the client is, how large the window is, and which browser is pinned, because those are facts about the destination rather than capture policy. Every mechanism takes the client address, its own output area, the viewport and the device scale factor from here and names none of them in source (Constitution IV, FR-020). Nothing in this document can light a component or introduce traffic: capture observes a running system and never populates one (Constitution VII, FR-018).
 */
export interface DrognaVisualCaptureConfiguration {
  /**
   * Where the browser client is served at this destination, and how patient a capture is with it. No mechanism starts the client: a capture observes what is running.
   */
  client: {
    /**
     * Where the client is served. A capture that cannot reach it fails naming this value, so the message points at configuration rather than at a literal in a script.
     */
    url: string;
    /**
     * How long a mechanism waits for the client's readiness signal before reporting that readiness never arrived. A bound on a wait, not a wait: no capture path contains a fixed sleep (FR-019, SC-011).
     */
    readiness_timeout_ms: number;
    /**
     * How many consecutive animation frames must render identical markup before the page is called settled. Counted in frames the application itself produced, which is why this is a readiness signal and not a delay dressed as one.
     */
    stable_frames: number;
    /**
     * The largest number of frames the settle check will watch before giving up. The bound is a frame count rather than a duration so that the check reads no clock of any kind.
     */
    maximum_frames: number;
    /**
     * With the page served through the proxy behind its binary clearance (decided 28 August 2026, issue #34 link 6), every capture needs the credential to load the page at all. The identity is tracked; the secret is named by the environment variable that carries it and never written here — the same rule the broker URLs follow. A mechanism refuses to start when the named variable is unset, because a browser launched without the credential would report readiness never arriving, three layers away from the cause. Optional so that a destination serving its page in the open still validates.
     */
    credentials?: {
      /** The clearance identity, matching proxy.credentials.user at the same destination. */
      user: string;
      /** The environment variable carrying the secret at capture time. */
      secret_variable: string;
    };
  };
  /**
   * One viewport and one device scale factor per destination. FR-015 asks the whole blog to share them so that the published pictures read as one publication, and FR-009 makes them part of what two halves of a pair must agree on before a difference between them means anything.
   */
  viewport: {
    /** Viewport width in CSS pixels. */
    width: number;
    /** Viewport height in CSS pixels. */
    height: number;
    /**
     * Device pixels per CSS pixel. A pair whose halves were captured at different scale factors is refused rather than diffed (FR-009).
     */
    device_scale_factor: number;
  };
  /**
   * An unpinned browser makes two captures taken on different machines incomparable for reasons that look like the change under evidence. The pin is recorded here and carried in every pair fingerprint, so a drifted pin becomes a named refusal rather than an unexplained difference.
   */
  browser: {
    /**
     * The browser the captures run in. One, because a second would double the number of ways two curated images could differ without anything having changed.
     */
    name: "chromium";
    /**
     * The Playwright release whose bundled browser build is expected. It fixes the browser build, and the capture reports the browser version it actually got so that the two can be compared.
     */
    playwright_version: string;
    /**
     * The image a capture runs in when it runs in a container, recorded in the fingerprint so that a pair assembled from one local half and one containerised half is refused (FR-010). Empty where captures at this destination are not containerised.
     */
    container_image: string;
  };
  /**
   * Repository-relative locations, disjoint by construction and asserted disjoint by test (FR-001, FR-022). The first three are git-ignored and have three different lifetimes; the fourth is feature 015's published-screenshot location and is the only capture output tracked by git (FR-014).
   */
  areas: {
    /**
     * Session-scoped area for glances. Lifetime: the session. No retention rule, no review gate, never committed (FR-004).
     */
    glance: string;
    /**
     * Branch-scoped area for before/after pairs and their differences. Lifetime: the branch (FR-012).
     */
    pair: string;
    /**
     * Where curated candidates and their provenance records wait for a person to look at them. The curated mechanism commits nothing itself (FR-013).
     */
    curated_review: string;
    /**
     * The published-screenshot location feature 015 defines. A person moves a reviewed candidate here; no capture mechanism writes into it.
     */
    published: string;
  };
  /**
   * What a capture must record to be repeatable. The seed is declared here because it is what the run was started from and lives in the run manifest rather than on the page; the run identifier the client displays is observed alongside it, so a capture taken against a different run than the one declared is visible in the fingerprint rather than invisible in the pixels (Constitution II, FR-016).
   */
  scenario: {
    /**
     * The root seed this destination's scenario is started from, matching seed.root in the same destination's component configurations.
     */
    seed: number;
  };
  /**
   * Settings that belong to the pair alone. Only the pair is a comparison, and only a comparison needs the clock pinned (FR-53, FR-007).
   */
  pair: {
    /**
     * How long a pair survives as a CI artefact. Declared rather than left to a default, because the retention rule is one of the things the three mechanisms must not share.
     */
    retention_days: number;
    /**
     * Per-pixel colour distance below which two pixels are called the same, as pixelmatch reads it.
     */
    difference_threshold: number;
    /**
     * How many differing pixels a no-change pair may carry and still be called empty. Zero is the value a pinned client should meet, and it is the value that makes SC-003 mean something; a destination that has to raise it has a frame-varying display to explain first.
     */
    maximum_differing_pixels: number;
  };
  /**
   * Settings that belong to the curated capture alone: the only durable artefact, the only one with a review gate, and the only one whose output reaches the public (PR-01, FR-013 to FR-017).
   */
  curated: {
    /**
     * The size budget for one candidate. A curated run refuses a candidate above it, before anyone can commit several megabytes of picture to a repository that keeps them for ever.
     */
    maximum_bytes: number;
    /**
     * Whether the curator pins the clock for a curated shot. The curated mechanism decides this for itself, on its own grounds — a regenerable shot — and not because the pair does it.
     */
    pin_clock: boolean;
    /**
     * Selectors painted over before a curated image is written, for anything that legitimately varies or that could name a deployment host (FR-017). Masking is the second line; capturing the viewport only rather than the browser window is the first.
     */
    masked_selectors: string[];
  };
}
