# Feature Specification: One Environment-Agnostic Compose Configuration

**Feature Branch**: `005-compose-deployment`

**Created**: 2026-08-26

**Status**: Draft

**Input**: One Docker Compose configuration serving two destinations — a local machine (including an ephemeral agent session) and a small DigitalOcean droplet used for demonstrations that need a persistent URL. Hostnames, ports and paths come from configuration, never from source. Seed data is produced by scripts and never accumulates, so a fresh instance behaves exactly like one that has been running for a week. (SRD NFR-05, NFR-06, NFR-07; delivery priority 5.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bring the harness up locally with one command (Priority: P1)

Someone with a clean checkout and a working Docker installation runs a single script. The
stack that exists today starts, becomes healthy, seeds itself, and prints the URL of the
client. No manual step, no interactive prompt, no editing of a file that the repository
did not ship. Tearing it down and running the script again produces the same result.

This includes the ephemeral case: an agent session that clones the repository, brings the
stack up, exercises it, and is then discarded. Nothing may depend on state left behind by
a previous session.

**Why this priority**: Every other feature is demonstrated by running it. The constitution
defines "demonstrable" as runnable from a clean checkout with one command, so this story is
the precondition for the demonstrability gate on every later stage. Until it exists, each
feature invents its own way to start, and those ways drift.

**Independent Test**: Clone the repository into an empty directory on a machine with Docker
and nothing else from this project, run `scripts/run_local.sh`, and confirm the advertised
URL serves the client and every declared health check reports healthy. Delivers a running
harness with no prior knowledge required.

**Acceptance Scenarios**:

1. **Given** a clean checkout and no existing harness volumes, **When** `scripts/run_local.sh` runs, **Then** every service in the active profile reaches its healthy state and the script exits zero having printed the client URL taken from the local destination configuration.
2. **Given** a stack already running, **When** `scripts/run_local.sh` runs again, **Then** it converges on the same running state and exits zero rather than failing on existing containers or ports.
3. **Given** a machine with no network access beyond the container image registry, **When** the stack starts, **Then** no service waits on any other outbound host and startup completes.
4. **Given** an ephemeral session that has been discarded and recreated, **When** the stack is brought up again, **Then** its behaviour and seeded content are indistinguishable from the previous session's.

---

### User Story 2 - The same configuration runs on the droplet (Priority: P2)

The author deploys to a small DigitalOcean droplet so a demonstration has a persistent URL.
The droplet runs the same Compose file as the local machine. The only difference between the
two destinations is the contents of `config/droplet/` versus `config/local/`: hostnames,
ports, paths, resource sizing and the presence of TLS termination. No service definition,
no image, and no source file knows which destination it is on.

**Why this priority**: SRD §10 ranks this fifth by cost-of-getting-it-wrong-late, but the
greyed-out shell (SRD FR-45, priority 3) has to be live on the droplet early, so the droplet
path is needed sooner than its ranking suggests. Drift between the two destinations quietly
doubles maintenance, and the drift starts on the day the second destination is added.

**Independent Test**: Run the droplet deployment script against a freshly provisioned droplet
and confirm the advertised persistent URL serves the client, then diff the two destination
configuration directories and confirm they differ only in values, never in structure.

**Acceptance Scenarios**:

1. **Given** a freshly provisioned droplet with Docker installed, **When** `scripts/run_droplet.sh` runs, **Then** the stack starts and the persistent URL declared in `config/droplet/` serves the client.
2. **Given** both destination configuration directories, **When** the parity check runs, **Then** the set of files and the set of keys within each file are identical across the two destinations and only values differ.
3. **Given** the running droplet stack, **When** the repository's source tree is searched for literal hostnames, ports and absolute paths, **Then** the literal-path gate reports none in service source, in the Compose file, or in the query layer configuration.
4. **Given** a droplet that has been rebooted, **When** the host comes back, **Then** the stack restarts unattended and reaches the same healthy state without a human running anything.

---

### User Story 3 - Seed, reset, and be sure a fresh instance is a true instance (Priority: P3)

All data in a running harness is produced by seeding scripts. A single command resets an
instance to its post-seed state. An instance that has been running for a week and an instance
created five minutes ago carry the same content for the same seed, so nothing observed in a
demonstration depends on accumulated history nobody can reproduce.

**Why this priority**: SRD NFR-07 is what makes the harness disposable, and disposability is
what makes the ephemeral agent-session case in User Story 1 honest. It is third only because
the first two stories must exist for there to be anything to seed.

**Independent Test**: Seed an instance, record digests of the seeded content, run the reset
script, seed again with the same root seed, and confirm the digests match. Then do the same
on a second, freshly created instance and confirm they match across instances.

**Acceptance Scenarios**:

1. **Given** an empty instance, **When** `scripts/seed.sh` runs with a given root seed, **Then** it populates every store the active profile requires and records the seed and the content digests in a seeding record.
2. **Given** a seeded instance, **When** `scripts/seed.sh` runs a second time with the same root seed, **Then** the resulting content digests are unchanged.
3. **Given** an instance that has been running and accumulating derived data, **When** `scripts/reset.sh` runs, **Then** all volumes carrying derived data are removed, the stack is reseeded, and the content digests equal those of a fresh instance seeded with the same root seed.
4. **Given** a seeded instance, **When** its stores are inspected, **Then** no data is present that no script produced.

---

### User Story 4 - Start only the components that exist (Priority: P4)

The harness has eighteen components and they arrive over months. The Compose configuration
names all of the services it has, and a profile mechanism selects which are started. A
feature that has not been built yet is simply absent from the active profile; it is not a
disabled service pretending to exist.

**Why this priority**: Needed as soon as the second feature lands, but only after the first
three stories give it something to select between. It also carries a constitutional hazard
worth stating explicitly: the profile decides what runs, and nothing else. The client's
display of which components are alive is driven by heartbeats and never by this profile.

**Independent Test**: Bring the stack up with the shell-only profile and confirm exactly the
expected containers run; bring it up with the full profile and confirm the rest join. In both
cases confirm the client's component display is derived from heartbeats and is unchanged by
the profile selection mechanism itself.

**Acceptance Scenarios**:

1. **Given** the shell-only profile, **When** the stack starts, **Then** only the services in that profile run and the script still reports success.
2. **Given** a new service added to the Compose file under a profile that is not active, **When** the stack starts, **Then** no container for it is created and no other service fails on its absence.
3. **Given** any profile, **When** the client renders the component layout, **Then** components are greyed or lit purely on observed heartbeats, and no artefact of this feature is consulted to decide.

---

### Edge Cases

- A port declared in the destination configuration is already occupied on the host. Startup fails with a message naming the port, the service and the configuration key, not with a container runtime stack trace.
- A destination configuration file is missing a required key, or carries a key of the wrong type. The configuration check fails before any container starts, and names the file and the key.
- Two destination directories drift: someone adds a key to `config/local/` and forgets `config/droplet/`. The parity check fails in CI, not on the droplet.
- The droplet's disk fills with images and volumes from repeated deployments. The deployment script prunes what it created and the reset path is the documented remedy.
- A partially completed seed run is interrupted. Re-running the seed script converges rather than producing a half-seeded store; the seeding record is written only on completion.
- The stack is brought up before any seed exists. Services that require seeded content report unhealthy with a readable reason instead of serving empty results as if they were real.
- An image build takes long enough on a small droplet to look like a hang. The deployment script reports progress and its expected duration.
- A secret is required for the droplet but no template has been filled in. Deployment fails at the configuration check, and no secret value is ever written into a tracked file.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A single Compose configuration at `deploy/compose.yaml` MUST define every service in the harness. No second Compose file may redefine a service, and no destination may carry its own copy. (SRD NFR-05, NFR-06)
- **FR-002**: No service definition, image, entrypoint or source file may contain a literal hostname, port, absolute path or URL. Every such value MUST arrive from the destination configuration. (SRD NFR-05, NFR-04; Constitution IV)
- **FR-003**: Each service MUST receive exactly one environment variable carrying operational meaning, `HARNESS_CONFIG`, giving the path of its configuration file inside the container. Any other environment variable used by the Compose file MUST be confined to composing that path, image tags, and published ports. (repo-layout configuration contract)
- **FR-004**: The two destination directories `config/local/` and `config/droplet/` MUST contain the same set of files, and each corresponding pair of files MUST carry the same set of keys. Only values may differ. (SRD NFR-06)
- **FR-005**: Every configuration file in a destination directory MUST validate against its JSON Schema under `contracts/schemas/config.<component>.schema.json` before any container is started. (SRD NFR-04; Constitution IV)
- **FR-006**: `scripts/run_local.sh` MUST bring the harness up on a local machine from a clean checkout in one invocation, with no interactive prompt, and MUST be safe to run repeatedly. (SRD NFR-06; Constitution, Demonstrability)
- **FR-007**: `scripts/run_droplet.sh` MUST bring the same stack up on the droplet using `config/droplet/`, and MUST be safe to run repeatedly against an already-deployed droplet. (SRD NFR-06)
- **FR-008**: Every long-lived service MUST declare a health check, and the run scripts MUST NOT report success until every service in the active profile is healthy or has exited successfully by design. (SRD NFR-06)
- **FR-009**: `scripts/seed.sh` MUST produce all seed content required by the active profile from scripts alone, taking its root seed from configuration, and MUST be idempotent for a given root seed. (SRD NFR-07; Constitution II)
- **FR-010**: `scripts/seed.sh` MUST write a seeding record naming the root seed, the seeding script version and a digest of each seeded artefact, so two instances can be compared without inspecting their stores by hand. (SRD NFR-07; Constitution II)
- **FR-011**: `scripts/reset.sh` MUST remove every volume carrying derived data and reseed, such that the resulting seeding record equals that of a freshly created instance seeded with the same root seed. (SRD NFR-07)
- **FR-012**: No volume in the Compose configuration may carry data that no script can reproduce. Each declared volume MUST be listed in `deploy/README.md` with the script that fills it. (SRD NFR-07)
- **FR-013**: Compose profiles MUST select which services start, so that services for components not yet built can be present in the file without being run. The active profile MUST come from the destination configuration. (SRD §10 staged delivery)
- **FR-014**: No artefact of this feature may be read by the client to decide which components are shown as alive. Component illumination is driven by heartbeats alone. (SRD FR-45; Constitution VII)
- **FR-015**: The droplet MUST serve the client at a persistent URL declared in `config/droplet/`, and the stack MUST restart unattended after a host reboot. (SRD NFR-06, FR-45)
- **FR-016**: Secrets MUST be produced at deploy time from a tracked template `deploy/env.template` into an untracked destination file. No secret value may appear in a tracked file, and the untracked file MUST be excluded from version control by an ignore rule shipped with this feature. (SRD NFR-05, PR-01)
- **FR-017**: The bring-up path MUST require no outbound network access beyond container image pull, so it works inside an ephemeral agent session behind a proxy. (SRD NFR-06)
- **FR-018**: A destination-parity check and a configuration-validation check MUST both run in CI and fail the build on drift. (SRD NFR-06; Constitution, Quality gates)
- **FR-019**: `deploy/` MUST document the two destinations, the meaning of each configuration key, and the resource expectations of the droplet, in enough detail that the droplet can be rebuilt from nothing. (SRD NFR-06)
- **FR-020**: Container images MUST be built reproducibly from the repository, pinned by base image digest, so that the same checkout yields the same image content on both destinations. (Constitution II, in spirit: a replay that depends on an unpinned base image is not a replay)

### Key Entities

- **Destination**: A named place the harness runs — `local` or `droplet`. Carries a directory of configuration files, one per component plus a shared file, and nothing else. Adding a third destination means adding a directory of the same shape.
- **Destination configuration file**: One JSON file per component per destination, of the shape fixed in the repository layout: `component`, `clock`, `seed`, `broker`, `logging`, plus component-specific sections. Validated against its schema before use.
- **Compose service**: One entry in the single Compose configuration, carrying an image build context, a profile membership, a health check, and exactly one meaningful environment variable.
- **Profile**: A named subset of services, selected per destination, describing what exists today rather than what ought to exist.
- **Volume**: A named store of derived data, each one reproducible by a named seeding script and removable by the reset script.
- **Seeding record**: The written result of a seeding run — root seed, script version, and a digest per seeded artefact. The evidence that two instances are equivalent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a clean checkout on a machine with only a container runtime installed, one command yields a healthy stack with no manual step and no editing of shipped files.
- **SC-002**: The number of Compose files defining services is exactly one, and the number of service definitions duplicated between destinations is zero.
- **SC-003**: The literal-path gate reports zero literal hostnames, ports, absolute paths or URLs across service source, the Compose configuration and the query layer configuration.
- **SC-004**: The file sets and key sets of `config/local/` and `config/droplet/` are identical; the automated parity check reports zero structural differences.
- **SC-005**: Seeding an instance twice with the same root seed produces identical seeding records, and so does seeding a second, independent instance.
- **SC-006**: After `scripts/reset.sh`, the seeding record of an instance that has been running equals that of a freshly created instance with the same root seed.
- **SC-007**: Every declared volume appears in the deployment documentation with the script that fills it; the count of volumes without a named producing script is zero.
- **SC-008**: The droplet's persistent URL serves the client after an unattended host reboot, with no human intervention.
- **SC-009**: Deploying to the droplet from a checkout on a freshly provisioned host requires exactly one command after Docker is installed.
- **SC-010**: Both destination checks run in CI on every change and fail the build when either drifts.

## Assumptions

- The container runtime is Docker Engine 24 or later with Compose v2 available as `docker compose`. Podman compatibility is not pursued.
- The droplet is a small DigitalOcean instance — two virtual CPUs and four gigabytes of memory is the working assumption — running a current Ubuntu LTS with Docker installed by the provisioning script. The SRD says "small droplet" and no more; if that sizing proves inadequate, the remedy is a larger droplet, not a different configuration.
- Images are built from the repository on each destination rather than pulled from a container registry. This keeps the deployment path to one command and no external account. If building on the droplet proves too slow, introducing a registry is a change of configuration values plus an image tag, not a redesign; this is recorded here so that the change is expected rather than surprising.
- Deployment to the droplet is a checkout of the repository on the droplet plus the run script, driven over SSH by the author. The SRD does not specify a deployment mechanism, and no continuous-deployment pipeline is assumed.
- TLS termination, authentication and path policy belong to the reverse proxy feature (SRD C-10, FR-40 to FR-41). This feature carries only the configuration keys that tell the stack whether a destination terminates TLS and at what hostname; local runs plain HTTP on a loopback port.
- The configuration schemas under `contracts/schemas/` and the shared configuration loader in `libs/harness_core/` are owned by the deterministic-foundations feature; this feature consumes them and adds only the per-destination values and the destination-parity rule.
- Individual components add their own configuration files to both destination directories as they are built. This feature owns the two directories, the shared file, the shape rule and the parity check, not every file that will eventually sit in them.
- "Fresh instance equivalent to a long-running one" is taken to mean equal seeded content for an equal root seed, not equal simulation state. A long-running instance has advanced its simulation clock; that is expected and is not drift.
