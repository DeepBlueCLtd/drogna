// DO NOT EDIT.
// Generated from contracts/schemas/bundle-manifest.schema.json by scripts/generate_types.sh.
// Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

/**
 * The sidecar written beside every offload bundle: what the bundle contains and what its bytes hash to. It is written with the bundle and never regenerated from a bundle that has been transferred, because a manifest recomputed after the fact would agree with whatever the file had become. Nothing here names a machine, a directory, a command or an instrument: the run is carried as an opaque reference derived from the run manifest digest, which ties the bundle to a run inside the boundary and says nothing outside it (FR-42).
 */
export interface DrognaBundleManifest {
  /** Bumped when the shape changes in a way a reader must notice. */
  schema_version: number;
  /**
   * Deterministic identifier derived from the run identity and the bundle's logical position — the window index — and from the format version, never from entropy or a host clock. Two packaging runs over one run manifest produce the same identifier for the same window.
   */
  bundle_id: string;
  /**
   * An opaque derivation of the run manifest digest. Sufficient to tie a bundle to a run inside the boundary; useless to a reader who does not hold the manifest.
   */
  run_reference: string;
  /**
   * The digest of the run manifest the bundle was packaged from, so anything computed from the bundle can still be scored against the ground truth that produced it. Held here, in the sidecar, and not written into the exported file.
   */
  run_manifest_digest: string;
  /**
   * The export format this bundle was written by. Byte-identity is claimed for a fixed code and format version, so the claim names the version it is about.
   */
  format_version: string;
  /**
   * Which slice of the run this bundle covers. Boundaries are counted from the run's simulation epoch, so the index is a property of the manifest.
   */
  window: {
    index: number;
    /**
     * Simulation instant the window opens at, inclusive, ISO-8601 UTC with microsecond precision.
     */
    start_sim_time: string;
    /**
     * Simulation instant the window closes at, exclusive, ISO-8601 UTC with microsecond precision.
     */
    end_sim_time: string;
  };
  /**
   * Every file in the bundle, with its digest and its byte length. A member list of one is the ordinary case; the shape admits more so that a bundle gaining a second file does not become a different kind of thing.
   */
  members: ({
    /**
     * The member's name within the bundle. A name, not a location: no directory reaches this document.
     */
    name: string;
    digest: string;
    byte_length: number;
  })[];
  /** The variables the export carries, so a reader can tell what is inside without opening it. */
  variables: string[];
  /**
   * How many profiles the bundle holds. A window with none produces no bundle at all rather than an empty one.
   */
  profile_count: number;
  /** Total depth levels across every profile: the length of the ragged sample dimension. */
  level_count: number;
  /**
   * The copy of the run manifest the packager stages beside this bundle, carrying the window's measurement geometry. Named here — deliberately outside 'members' — because it travels beside the bundle and is never part of it: it holds every exact position a measurement was taken at, which is exactly what a release must not contain, so listing it as a member would put the withheld document into the artefact the provenance scanner scores (SC-006, FR-42). The name, digest and length are recorded so the sibling can be tied to the bundle and checked without being inside it. Optional, because a sidecar written before this field existed is still a valid sidecar.
   */
  run_manifest?: {
    /** The sibling's name beside the bundle. A name, not a location. */
    name: string;
    digest: string;
    byte_length: number;
  };
}
