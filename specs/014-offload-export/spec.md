# Feature Specification: Offload Packaging and Verified Eviction

**Feature Branch**: `014-offload-export`

**Created**: 2026-08-26

**Status**: Draft

**Input**: SRD C-17 (offload packager: NetCDF+CF export with integrity guarantee; owns the failure mode of premature eviction), FR-43 and FR-44.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A run leaves as a file another tool can read (Priority: P1)

A scenario has run. The profiles it collected along the sampling path are packaged as
a single NetCDF file that declares CF conventions and the `trajectoryProfile` discrete
sampling geometry, with a sidecar manifest recording what is inside it and the digest
of every byte. Someone who has never seen this project opens the file in a standard
CF-aware tool and plots a temperature profile without writing bespoke code.

**Why this priority**: There is nothing to transfer, verify or evict until there is a
bundle. The export is also the part with an external standard to answer to, so getting
its shape right early avoids re-cutting every downstream test.

**Independent Test**: Run the packager over a recorded fixture run and assert the
output passes a CF compliance check with zero errors and that the sidecar manifest
matches the file on disk. No destination, no transfer, no eviction.

**Acceptance Scenarios**:

1. **Given** a fixture run with profiles at several positions and depths, **When** the
   packager runs, **Then** it writes one NetCDF file declaring `Conventions` and
   `featureType = "trajectoryProfile"`, with the instance variables the geometry
   requires and a depth coordinate that declares its sign convention.
2. **Given** that file, **When** a CF compliance check runs against it, **Then** it
   reports zero errors.
3. **Given** profiles of differing length, because the seabed truncates the deeper
   ones, **When** the packager runs, **Then** the file represents them without padding
   or fabricated values.
4. **Given** the same run manifest and the same code and library versions, **When** the
   packager runs twice, **Then** the two files are byte-identical and the two bundle
   identifiers are equal.
5. **Given** a window containing no profiles, **When** the packager runs, **Then** no
   bundle is written and the ledger records the skip, rather than an empty file being
   produced.

---

### User Story 2 - Nothing is deleted until the destination proves it has it (Priority: P2)

The bundle is transferred. The destination computes its own digest over the bytes it
received and returns a receipt. Only when that receipt matches a digest recomputed
locally from the file on disk does the bundle become eligible for eviction, and even
then it is deleted only because the retention policy asked for space, never because a
receipt arrived. Every way the transfer can go wrong ends with the local bytes still
present.

**Why this priority**: This is the failure mode C-17 owns. Premature eviction is the
one error in this feature that cannot be undone by re-running anything, because the
data it destroys was the only copy.

**Independent Test**: Drive the state machine against a stub destination through the
happy path and through every failure the destination can present, asserting after each
that the local file is byte-for-byte intact.

**Acceptance Scenarios**:

1. **Given** a staged bundle, **When** the destination returns a receipt whose digest
   matches a digest recomputed locally from the file on disk, **Then** the bundle
   becomes eligible for eviction and the receipt is recorded durably before anything is
   deleted.
2. **Given** a staged bundle, **When** the destination returns a receipt whose digest
   does not match, **Then** the bundle is not evicted, the mismatch is reported, and
   the local file is unchanged.
3. **Given** a staged bundle whose declared digest in the transfer request is
   deliberately wrong, **When** a destination that independently computes the digest
   returns its own value, **Then** verification fails — proving the local check
   compares against recomputed local bytes and not against the value that was sent.
4. **Given** a destination that returns success with no receipt body, a malformed
   receipt, a receipt for a different bundle identifier, a receipt with the right digest
   but the wrong byte count, or a duplicate receipt, **When** each is presented,
   **Then** no eviction occurs in any case.
5. **Given** a verified bundle and a retention policy that has not asked for space,
   **When** the packager runs its cycle, **Then** the bundle remains on disk: a receipt
   permits eviction, it does not cause it.
6. **Given** a verified bundle whose local file has changed since verification,
   **When** eviction is attempted, **Then** the pre-delete digest check fails and the
   file is not deleted.

---

### User Story 3 - An interrupted offload is safe on restart (Priority: P3)

The process is killed part way through a transfer, or between writing a receipt and
recording it. On restart, the ledger says what state each bundle was in, and any
bundle whose state cannot be trusted is re-verified rather than assumed. No sequence
of interruptions produces an eviction that a receipt did not justify.

**Why this priority**: The guarantee in User Story 2 is only worth what it is worth
across a crash. A guarantee that holds while the process runs and evaporates when it
does not is not a guarantee, but it needs the state machine to exist before it can be
attacked.

**Independent Test**: Inject a kill at each transition boundary of the ledger, restart,
and assert that no bundle is evicted without a recorded, matching receipt and that the
system converges to a consistent state without operator intervention.

**Acceptance Scenarios**:

1. **Given** the process is killed immediately before a state transition is recorded,
   **When** it restarts, **Then** the bundle is treated as being in the earlier state
   and the work is redone, never skipped.
2. **Given** the process is killed immediately after a state transition is recorded but
   before its side effect completed, **When** it restarts, **Then** the side effect is
   re-attempted idempotently and the outcome is the same as if it had not been
   interrupted.
3. **Given** a partially transferred bundle at the destination, **When** the transfer is
   retried, **Then** the destination never acknowledges the partial object, because it
   is written under a temporary name and made visible atomically only when complete.
4. **Given** a ledger entry in any intermediate state on restart, **When** recovery
   runs, **Then** the entry is re-verified against the destination and the local file
   rather than being promoted on the strength of what was recorded.

---

### User Story 4 - The exported file says nothing about where the measurements were taken beyond the data itself (Priority: P4)

The file's metadata describes the data: what the variables are, what units they are in,
what conventions it follows, which run produced it. It does not name the machine that
made it, the files it read, the command line that invoked it, the sensors involved, or
the person who ran it. The CF primer records both what the export emits and what it
deliberately omits, so the omissions read as decisions rather than gaps.

**Why this priority**: SRD FR-42 names provenance metadata in exported files as an
explicit leakage path, and feature 013 owns the scanner that enforces it. This story is
the producer side of that contract: it is cheap to satisfy once the export exists, and
expensive to retrofit if the export has already been published with a rich `history`.

**Independent Test**: Scan a produced bundle against the attribute allow-list and assert
zero disallowed attributes; read the primer and check every attribute the export emits
appears in it.

**Acceptance Scenarios**:

1. **Given** a produced bundle, **When** its global and variable attributes are listed,
   **Then** every attribute is on the allow-list and no value contains a filesystem
   path, a hostname, a user name, a command line or a sensor identifier.
2. **Given** a produced bundle, **When** the run it came from must be identified,
   **Then** the file carries an opaque run reference derived from the run manifest
   digest, sufficient to tie the file to a run inside the boundary and useless outside
   it.
3. **Given** the bundle, **When** feature 013's provenance scanner runs over it,
   **Then** it reports zero hits.
4. **Given** `docs/standards/cf-conventions.md`, **When** it is read against a produced
   file, **Then** every attribute and variable in the file is explained there, and the
   attributes deliberately not emitted are listed with the reason.

---

### Edge Cases

- A profile with a single depth level, and a bundle containing exactly one profile.
- Profiles truncated at different depths by bathymetry, giving rows of differing length.
- A window containing no profiles at all.
- Disk exhaustion during staging: a half-written bundle must never enter the ledger as
  staged.
- The destination is unreachable for the whole cycle, and the staging area fills.
  Eviction remains gated, so the correct behaviour is to stop producing bundles and
  report, not to make room.
- A receipt arriving with a simulation time earlier than the transfer, which is possible
  under accelerated replay and must not be treated as a clock error.
- A replay from the same seed producing an identical bundle identifier for a bundle the
  ledger has already seen: the same logical bundle, not a duplicate fault.
- The netCDF library version changing between two runs, which changes bytes without
  changing content. Byte-identity is claimed for a fixed code and library version.
- A destination that acknowledges a byte count larger than what was sent.
- A bundle whose sidecar manifest and file disagree, discovered at verification time.
- An operator deleting a staged bundle by hand: the ledger and the filesystem disagree,
  and the packager must report rather than silently re-stage or silently forget.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Export MUST be NetCDF declaring CF conventions with
  `featureType = "trajectoryProfile"`. (SRD FR-43)
- **FR-002**: The file MUST carry the instance structure the geometry requires: a
  trajectory instance variable and a profile instance variable each declaring their
  `cf_role`, per-profile time and horizontal position, a depth coordinate declaring its
  sign convention, and data variables carrying `standard_name` and `units`.
  (SRD FR-43)
- **FR-003**: Profiles of differing length MUST be represented without padding or
  fabricated values, using a ragged representation with explicit row-count variables.
  (SRD FR-43)
- **FR-004**: All times written into an export MUST come from the simulation clock, and
  the time coordinate MUST be referenced to the simulation epoch recorded in the run
  manifest. No host clock value MUST appear in any exported file. (Constitution I; SRD
  FR-09)
- **FR-005**: For a given run manifest and a fixed code and library version, two
  packaging runs MUST produce byte-identical files and equal bundle identifiers.
  Bundle identifiers MUST be derived from the run identity and the bundle's logical
  position, never from entropy or a host clock. (Constitution II; SRD AT-04)
- **FR-006**: Each bundle MUST have a sidecar manifest recording the bundle identifier,
  every member file with its digest and byte length, the simulation time window, the
  variable list, the format version, and the run manifest digest. (SRD FR-44)
- **FR-007**: Every produced bundle MUST pass a CF compliance check with zero errors as
  a build gate. (SRD FR-43)
- **FR-008**: A bundle MUST NOT be evicted unless a receipt from the destination exists,
  has been recorded durably, and its digest matches a digest recomputed locally from the
  file on disk. (SRD FR-44)
- **FR-009**: A receipt MUST carry the destination identifier, the bundle identifier,
  the digest the destination computed over the bytes it received, the byte count it
  received, and the simulation time of receipt. A receipt missing any of these MUST NOT
  verify. (SRD FR-44)
- **FR-010**: Verification MUST compare the receipt digest against a digest recomputed
  locally from the file on disk at verification time, not against the digest sent in the
  transfer request. (SRD FR-44)
- **FR-011**: Bundle state MUST be held in a durable ledger written ahead of the side
  effect it describes, with monotonic transitions: staged, transferred, verified,
  evictable, evicted, failed. (SRD FR-44)
- **FR-012**: On restart, any ledger entry in an intermediate state MUST be re-verified
  against the destination and the local file. No entry MUST be promoted on the strength
  of the recorded state alone. (SRD FR-44)
- **FR-013**: Eviction MUST recompute the on-disk digest immediately before deleting and
  MUST abort if it does not match the verified digest. (SRD FR-44)
- **FR-014**: Eviction MUST be triggered only by the configured retention policy. A
  verified receipt makes a bundle eligible for eviction and MUST NOT cause it.
  (SRD FR-44)
- **FR-015**: Transfer MUST place the object at the destination under a temporary name
  and make it visible atomically on completion, so no partial object can be
  acknowledged. (SRD FR-44; mirrors SRD FR-30)
- **FR-016**: Every failure to verify MUST leave the local bytes unchanged and MUST be
  reported, not swallowed. (SRD FR-44)
- **FR-017**: Exported files MUST carry only attributes on the configured allow-list.
  No attribute value MUST contain a filesystem path, hostname, user name, command line,
  sensor, thing or datastream identifier. Run identity MUST be carried as an opaque
  reference derived from the run manifest digest. (SRD FR-42)
- **FR-018**: Bundles MUST be written to the offload staging area, which MUST NOT be
  reachable through the released path prefix defined by feature 013. (SRD FR-41, FR-42)
- **FR-019**: The packager MUST read exactly one environment variable, `HARNESS_CONFIG`,
  and MUST validate its configuration file against `config.offload.schema.json` before
  any other I/O. (Constitution IV; SRD NFR-04)
- **FR-020**: The packager MUST publish a heartbeat on `ctl/heartbeat` at its declared
  interval carrying its component identifier, the simulation time and a status, and MUST
  publish bundle-state counts and verification failures on `ctl/telemetry`. Illumination
  of this component in the client follows from that heartbeat alone.
  (`docs/architecture/repo-layout.md`; SRD FR-45, FR-52)
- **FR-021**: `docs/standards/cf-conventions.md` MUST explain the conventions the export
  follows, why `trajectoryProfile` is the geometry that fits, how ragged profiles are
  represented, and which attributes are deliberately not emitted and why. (SRD PR-09,
  FR-43)

### Key Entities

- **Bundle**: one NetCDF file plus its sidecar manifest, covering one simulation time
  window of one run. The unit of transfer, verification and eviction.
- **Bundle manifest**: what the bundle contains and what its bytes hash to. Written with
  the bundle and never regenerated from a bundle that has been transferred.
- **Profile**: a vertical series of measurements at one horizontal position and one
  simulation time. Profiles are ordered along the sampling path; the ordering is the
  trajectory.
- **Receipt**: the destination's statement of what it received, independently computed.
  The only thing that can make a bundle eligible for eviction.
- **Ledger**: the durable record of every bundle's state and the receipt that justified
  each transition. The source of truth across restarts; the filesystem is not.
- **Retention policy**: the configured rule that asks for space. The only thing that
  causes an eviction.
- **Destination**: the receiving endpoint, identified in configuration. One
  implementation; a second would need an ADR (Constitution VI).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every bundle produced in CI passes the CF compliance check with zero
  errors, and the check runs on every build rather than on request.
- **SC-002**: Across the full set of injected transfer and receipt failures, the number
  of local files deleted is zero, asserted by byte-for-byte comparison after each case.
- **SC-003**: Crash injection at every ledger transition, on both sides of the write,
  leaves a state from which restart never evicts a bundle without a recorded matching
  receipt. Every transition is covered; the count of covered transitions is reported.
- **SC-004**: Replaying a run from its manifest produces byte-identical bundle files and
  identical bundle identifiers.
- **SC-005**: The echoing-destination case fails verification, demonstrating that the
  local check does not trust the digest it sent.
- **SC-006**: An attribute scan of every produced bundle finds zero attributes off the
  allow-list, and feature 013's provenance scanner reports zero hits on the same bundle.
- **SC-007**: A worked example in `docs/standards/cf-conventions.md` opens a produced
  bundle with a standard CF-aware reader and plots one profile, and that example runs in
  CI so the primer cannot drift from the file.
- **SC-008**: A reader can determine, from the primer alone, every attribute the export
  emits and every attribute it deliberately omits.

## Assumptions

- The offload destination is the harness's own archive, reached over HTTP, and is not a
  downstream release surface. SRD FR-42's withholding of point observations,
  measurement locations and planned routes governs what feature 013 releases through the
  proxy; this feature's obligation under FR-42 is limited to the leakage path FR-42
  names for it, which is provenance metadata embedded in exported files. A bundle is
  never placed under the released path prefix.
- The destination is stubbed within the harness deployment. Only one destination
  implementation is built; the transport is not claimed as a port, and a second would
  require an ADR under Constitution VI.
- The ragged representation is chosen over an incomplete multidimensional array because
  profiles are truncated at different depths by bathymetry, so a rectangular array would
  require fill values that a reader could mistake for data.
- CF compliance is checked with an off-the-shelf compliance checker pinned to a
  specific convention version, recorded in configuration. The specific version is a
  choice this feature makes; the SRD requires CF, not a version.
- The eviction trigger is a retention policy expressed as a staging-area size or age
  bound in configuration. The SRD fixes the precondition for eviction, not its cause.
- Byte-identity under replay is claimed for a fixed code and library version, matching
  the wording of Constitution II. The library writes its own version into the file, so a
  library bump changes bytes without changing content; the test pins the version.
- `contracts/schemas/config.offload.schema.json` is added additively by this feature,
  per the ownership rule in `docs/architecture/repo-layout.md`.
- `docs/standards/cf-conventions.md` is owned by this feature and consumed by feature
  015, which owns the surrounding documentation area and publishes it. Per the
  repository ownership rule, the earlier-numbered feature owns the file.
- The digest algorithm is SHA-256 for both the sidecar manifest and the receipt.
