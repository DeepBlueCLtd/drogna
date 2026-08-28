# long-run-01 — decisions

Append-only, newest last. See issue #19 for the entry shape.

## 2026-08-27T00:00 — this machine has a Docker daemon; `CLAUDE.md`'s first trap is stale

**Where**: `CLAUDE.md`, traps section; every command in this session that touches `deploy/`

**What I found**: `CLAUDE.md` opens its traps with "This container has no Docker daemon.
The CI runner has one." That is no longer true of this machine. `docker info` fails, but
not for want of a daemon: `systemctl is-active docker` is `active`, `dockerd` is at
`/usr/bin/dockerd`, `docker info` under `sudo` reports server 29.7.2, and
`getent group docker` lists `ian` as a member. `id -nG` does *not* list `docker` — the
group membership postdates this login session, so the shell has not picked it up. The
socket is `srw-rw---- root:docker`, dated 26 Aug 2026, which matches.

So the failure is a stale process credential, not a missing daemon.

**Options**:
- A. `sg docker -c '<cmd>'` around anything that talks to the daemon. Costs a wrapper on
  every such command and nothing else; changes no state on the machine; reversible by
  simply not doing it.
- B. `sudo docker`. Runs the client as root, which is exactly what the third trap says
  produced twenty-seven CI-only errors, and would leave root-owned files in the tree.
- C. `newgrp docker` / re-login. Cannot be done from a non-interactive tool session.

**What I did**: A. Verified `sg docker -c 'docker info'` reports server 29.7.2 and
overlayfs before relying on it. The assumption is that a subshell with the group applied
is indistinguishable from a fresh login for the daemon's purposes — which the successful
`docker info` already evidences.

The consequence matters more than the workaround: **container-backed tests that
`CLAUDE.md` promises will skip here will now run.** The trap's advice — reason about
container configuration statically, because anything that skips locally is untested — is
inverted for this session. I get to watch them fail, which is the better position. I have
not edited `CLAUDE.md`: the trap is a claim about a machine, this is one machine, and
rewriting a shared warning on one session's evidence is how a warning stops being true.

**What I need from you**: is `ian` in the `docker` group deliberate and permanent on this
box — should `CLAUDE.md`'s first trap be rewritten to say "a daemon may be present; check
rather than assume", or is this box the exception and the trap right about the norm?

## 2026-08-27T22:05 — the second `run_local.sh` empties `/etc/drogna` in every running container

**Where**: `deploy/lib/render_credentials.py:129-136` (`render_destination`)

**What I found**: The stack came up healthy — six containers, all six `(healthy)` — and the
client at `:8080` showed "Not connected to the broker" and "0 of 18 components heard from".
The browser and the health checks disagreed, so I went to the browser.

The client reaches the broker at `ws://localhost:8081/ctl`, which is the proxy. Uncleared,
that path answers 401; with the credential from `HARNESS_PROXY_SECRET` it answers 403.
Authentication succeeding into a refusal is the wrong shape, so I read the log rather than
the config:

    open() "/etc/drogna/proxy.htpasswd" failed (2: No such file or directory)

`ls -la /etc/drogna/` inside the proxy reported `total 0`. On the host the same directory
holds twenty files including `proxy.htpasswd`. The mount is declared correctly in
`compose.yaml` (`x-config-mount`) and `HARNESS_CONFIG_HOST_DIR` points at the right place.

`render_destination` does this:

    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True)

That is the directory every container bind-mounts. A bind mount resolves to an inode, not
to a path, so `rmtree` does not empty the mount — it orphans it. Every container already
running keeps a mount on the deleted directory and sees it empty for the rest of its life.

So the *first* bring-up works, because the directory is written before anything starts.
The *second* one silently guts every running container. `scripts/up.sh` is required to
converge, and `run_local.sh` is documented as safe to run again, so the second run is part
of the behaviour and not a nicety — this is the same trap `CLAUDE.md` already records
about the broker password file ("never clear the artefact before re-running"), one
directory up.

I proved it rather than inferred it: `docker compose restart proxy` and the twenty files
appear immediately, `/released/drogna-forecast` goes 403 → 500 (upstream reached, nothing
seeded yet) and 401 uncleared. Nothing was rebuilt and no file changed on the host, so the
only thing that can have changed is which inode the mount points at.

Two things this also says. **`drogna-healthcheck` reported healthy throughout** — the
proxy's health listener is a separate `server` block with no `auth_basic`, so it answers
200 with no credential file present at all. `CLAUDE.md` already warns that it answers "am I
configured", not "am I serving"; here it answered while the boundary was refusing every
caller. And `mount_lint.py` passes, correctly: the directory *is* mounted. What is wrong is
its lifetime, which no check looks at.

**Options**:
- A. Write in place: keep the directory, remove the files that are no longer wanted, write
  the rest over the top. Costs a slightly longer function and one more thing to get right
  (a stale file left behind is a real risk, so it must be an explicit sweep, not an
  overwrite-and-hope). The mount survives, so a converging run stops destroying the stack.
- B. Recreate the directory but restart every running container afterwards. Costs a
  restart on every convergence, which makes `run_local.sh` not converge so much as
  bounce, and turns a documented no-op into downtime.
- C. Leave it and document "bring the stack down before re-running". Costs the property
  the script is written to have, and PR/AT criteria depend on it.

**What I did**: A, and it is the next commit. The assumption is that no consumer depends
on the directory's *inode* changing — nothing reads it by handle, every container names
files under it by path, and the whole point of the change is that the inode must not
change. I am adding a test that runs the render twice and asserts the directory's `st_ino`
is unchanged across the second run while its contents are still correct, because that is
the property, and asserting on the file contents alone is what let this through.

I will watch it fail against the current code first.

**What I need from you**: the seeded state is empty, so `/released/drogna-forecast`
answers 500 rather than data. Is a 500 from the query layer on an unseeded collection the
intended answer, or should an empty-but-valid collection answer 200 with no coverage? I
have not touched it either way.

## 2026-08-27T22:50 — item 1's twenty open tasks were eighteen done and two outstanding

**Where**: `specs/015-published-site/tasks.md`

**What I found**: Issue #19 puts `015-published-site` first, "20 open tasks, the largest
coherent block", and says "`site/` exists and has content; the gates are what is missing."
The gates are not missing. `site/gates/` holds seven gates and their tests — 5,303 lines —
and `tasks.md` says beside them, in as many words, "there is no `site/gates/run_gates.py`
and no `site/gates/` directory."

Rather than count files I ran the thing. Built the site with the pinned toolchain
(`mkdocs build --strict`, clean), then `site/gates/run_gates.py --site site/build`:
seven gates ran, six reported zero findings, and the seventh refused to report anything
because no OCR engine was on PATH. It exited 2 and said so — the runner treats
could-not-run as its own outcome and does not let it pass for clean, which is why the gap
was visible at all. `site/gates/tests/`: 160 tests, all passing.

That left the image half of the vocabulary gate unproven here, which by this repository's
own standard means it was worth nothing. I installed `tesseract-ocr` — the same package
`pages.yml` and `ci.yml` install — and pointed the gate at
`site/gates/fixtures/seeded_violation/`. All sixteen expected findings fired, the four
image controls among them: an address bar, a host path and an email address read out of
published PNGs, and two tracked-entity terms out of a third.
`check_deployment_hostnames.py` against the same fixture reported its two. Then back at
the real built site: zero. So the gate has now been seen both catching and clearing, on
this machine, which it never had been.

Eighteen of the twenty are done. Two are not, and their notes are accurate:

- **T044**, a build-time size budget for published images. Nothing bounds them.
- **T045**, the gate suite on the pull-request workflow in report-only mode. `ci.yml` runs
  the Python suite, the client suite and `scripts/gates.sh`, and no site gate; `pages.yml`
  has no `pull_request` trigger by design (T012). So a site fault is first seen on the
  publishing run *after* merge.

**Options**:
- A. Tick the eighteen with the evidence for each, leave the two, and do the two.
- B. Leave the record alone and just do the two. Cheaper now, and it leaves a file that
  says the gates do not exist sitting next to the gates — which is the exact failure
  `CLAUDE.md` describes, where an unmaintained task list is read as evidence.
- C. Delete the stale notes without replacing them. Loses the reason each task was
  considered done, which is the part that cannot be reconstructed later.

**What I did**: A. Each ticked task carries a one-line note saying what was checked and,
where the old note was wrong about a *location* rather than about existence, what it had
been looking at — T004 looked for the manifest under `site/docs/` when it is at the
repository root, and T028 looked for the architecture overview under `docs/architecture/`
rather than `site/docs/architecture/`. Two entries out of eighteen were wrong that way,
and the rest simply predated the work.

The assumption is that the tree is right and the record is a claim about it, per
`CLAUDE.md`; I have not amended a single spec to match an implementation, only the task
list, and only where I ran something and watched the answer.

**What I need from you**: nothing on 015. Going on to T044 and T045, which are the real
remainder.

## 2026-08-28T00:20 — report-only had to mean reported; `continue-on-error` hides a failure

**Where**: `.github/workflows/ci.yml`, the `site` job (015 T045)

**What I found**: T045 asks for the site gate suite on the pull-request workflow "in
report-only mode, so a contributor sees a failure before merge rather than at
publication". I wrote it with `continue-on-error: true` on the two steps, which is the
obvious reading, and pushed a deliberate PR-01 breach — a host path and an email address
in `site/docs/index.md` prose — to watch it caught.

It was caught, and it was invisible. The run:

    site: success
      Report — the site's own publication gates: success

with `vocabulary: 4 findings` and `Process completed with exit code 1` in the step's log.
`continue-on-error` sets the step's *conclusion* to success — that is what the flag is
for; `outcome` keeps the real result and nothing surfaces it. So the checks list showed a
green tick over four findings. That is worse than not running the gates at all: it is a
check that has been seen to pass while failing, which is the exact failure mode
`CLAUDE.md` opens with.

I would not have found this by reading the YAML. It looked right, and it is what the flag
is normally used for.

**Options**:
- A. Let the step fail honestly and rely on the `site` job not being a required check.
  Visible, but it puts a red cross on every pull request with a site finding, and whether
  these gates block a merge is a decision about branch protection that is not mine.
- B. Report deliberately: run the command, and on failure write the output to
  `$GITHUB_STEP_SUMMARY`, emit `::warning::` annotations, and exit 0. Costs a dozen lines
  of shell in the workflow instead of one flag.
- C. Leave it and note the limitation. Costs the whole of the task's stated purpose.

**What I did**: B, and watched it on a real run with the violation still planted:
`##[warning]check_vocabulary: see the job summary for what it reported`, the findings in
the job summary, the job green and the workflow's status untouched. Then reverted the
violation and confirmed clean.

Two things I got wrong on the way and fixed rather than left:

- The first annotation pass grepped finding-shaped lines out of the report and produced
  **thirteen** annotations on a run with four findings. Several gates print scope notes
  beside a clean result — the glossary gate names the pages it does not hold to the
  first-use rule, the blog gate lists the recorded screenshot allowances — and those lines
  are shaped exactly like findings. Annotations now come from the runner's own closing
  block, which names the gates that concluded something. Two, and both true.
- My first planted violation was "detection" and "tracklet" in page prose, and the gate
  reported clean — **correctly**. `check_vocabulary`'s zone table marks tracked-entity as
  "no" in prose, inheriting `_gate_lib`'s exclusion of `site` from the source scan, because
  documentation has to be able to discuss a prohibition in order to state it. I had planted
  the one cell that is deliberately permitted. Recording it because a gate reporting clean
  on a planted violation is indistinguishable from a broken gate, and the ten minutes
  between the two readings is the whole value of the habit.

The assumption behind B is that a warning annotation plus a job summary is enough for a
contributor to act on. If it turns out to be ignored in practice, A is the escalation and
it is one flag away.

**One thing I am leaving, and flagging rather than fixing**: the new gate needs the
`capture.json` filename, so it carries a `harness:allow-literal-path` marker with a reason,
like `check_deployment_hostnames.py` does for `deployment.json`. That marker will **not**
appear in the exemption inventory `./scripts/gates.sh` prints, because
`_gate_lib.GATE_EXCLUSIONS["inventory"]` excludes `site`. The seeded-violation README
already records that as a real gap belonging to `_gate_lib`; I am now the second thing to
land in it, which is worth knowing when it is next weighed up.

**What I need from you**: nothing. 015 is closed — 27 ticked, none open.

## 2026-08-28T01:10 — the feature store cannot be seeded from the host, and that is why the `features` service exists

**Where**: `deploy/seed.d/`, `stores/features/provision.py`, `deploy/compose.yaml`,
`specs/007-observation-path` T009 and T043

**What I found**: Item 2 of issue #19 says the `full` profile cannot come up because
`deploy/compose.yaml` builds a `features` service from `harness_features` and
`services/features` does not exist — "either build it or narrow the profile", and building
it is the suggested default. I set out to narrow it, because `specs/007-observation-path`
records the opposite in its "Not done, and why" section:

> What is missing is a step file in `deploy/seed.d/`, which belongs to
> `005-compose-deployment`; the contract in `deploy/seed.d/README.md` is one executable per
> store and each is a few lines of `psql`.

That note is right about the observation store and wrong about the feature store, and the
difference is the whole answer.

I wrote both steps. `010-observations.sh` works: `stores/observations/apply.py` imports
`hashlib`, `pathlib`, `sys` and `collections.abc` and nothing else, so it composes its SQL
on a bare interpreter. `020-features.sh` failed immediately:

    ModuleNotFoundError: No module named 'harness_core'

`stores/features/provision.py` needs the workspace — `harness_core.config`,
`harness_core.rng` — because its content is a seeded draw and its configuration is
schema-validated. It cannot run on a bare interpreter, and `deploy/README.md` promises in
as many words that it will never have to:

> A destination needs a container runtime and a Python interpreter, and nothing else from
> this project. […] They use the standard library only, so no virtual environment is
> required to bring the stack up.

`tests/unit/test_deploy_lib_is_standard_library_only.py` holds that promise, and the README
records that it was written because the promise had quietly stopped being true once before.

So a seed step that ran `uv run` would break a documented and tested guarantee about what a
destination needs. The feature store's provisioning has to happen **inside a container**,
which is exactly what the `features` service in `compose.yaml` is: `profiles:
[provisioning, full]`, `harness.lifecycle: one-shot`, `depends_on: observations
service_healthy`. The service is not vestigial. It is the shape this constraint forces, and
the 007 note simply generalised from the store whose script happens to be stdlib-only.

**Options**:
- A. Build `services/features` as the one-shot the compose file already declares. Keeps the
  destination's prerequisites where the README promises. The wrinkle is the seeding record:
  digests must reach `DROGNA_ARTEFACT_DIR` on the host, and the service mounts only the
  configuration — solvable by having the seed step invoke it with `docker compose run --rm`
  and capture stdout, which is how a one-shot returns something to the host.
- B. Narrow the profile: drop `features` from `full`. Cheap, and it leaves the feature store
  unprovisioned at every destination — the client would have no bathymetry to draw and the
  planner nothing to avoid. It converts a broken profile into a quietly incomplete one.
- C. Add `uv` to the destination's prerequisites. One line in a README and one deleted test,
  and it undoes a guarantee this repository has already had to repair once.

**What I did**: took A as the direction and did the half that is unambiguous — committed
`010-observations.sh`, which works, converges on a re-run, and has been watched refusing:
appending a line to an already-applied migration produced *"migration
0001_observations.sql was applied from different content"*, the step failed, and no seeding
record was written. Reverting restored it. The store now genuinely holds its seven tables,
which it did not before: every seeding run in this session before this one reported "no
seeding steps are installed yet".

I removed my `020-features.sh` rather than leave a step that cannot pass. A failing step
aborts the whole seeding run, so a broken one is worse than an absent one.

The assumption: that the README's promise outranks the 007 note, because the promise is
tested and dated and the note is an aside about a sibling store. If that is wrong, C is one
line away.

**What I need from you**: A is a new workspace package and a change to how the seeding step
invokes it, which is more than a tidy-up and touches `deploy/compose.yaml`. Do you want me
to build `services/features`, or would you rather take B for now and leave the feature
store unprovisioned with a note saying so? I have not touched `compose.yaml` either way.

## 2026-08-28T08:50 — item 2 built: `services/features`, and the database half of ADR-0016's gap

**Where**: `services/features/`, `deploy/compose.yaml`, `deploy/lib/render_credentials.py`,
`contracts/schemas/config.features.schema.json`, `deploy/seed.d/020-features.sh`

**What I found**: I had stopped on this and logged it as blocked, on the ground that every
route needed `stores/` inside the image. That was the wrong call — the issue authorised
building it, and the rule is to take the reversible option and keep going. Resuming it:
`stores/` does not need to be *copied* into the image. It can be *mounted*, exactly as the
destination configuration already is, because the `features` service is a deploy-time
one-shot that only ever runs from a checkout. No Dockerfile change, no dockerignore change,
no relocation, no workspace reshaping.

Then the one-shot reached the database and stopped on
`fe_sendauth: no password supplied`. `render_credentials.py` injects broker secrets into
`broker.url` and had never touched a DSN, so **every tracked DSN named a role and carried no
secret** — the observation store's exact analogue of the broker gap ADR-0016 records, and
invisible until now because nothing in the active profile had ever opened a connection.

**Options for the DSN half**: give every database role a generated password (widest, and
`stores/observations/roles.sql` creates `drogna_ingest`, `drogna_read` and
`drogna_telemetry` with `LOGIN` and no password, so it means changing what the store's SQL
declares); inject only the owner's, which is the one role that *does* have a generated
secret; or leave it and let provisioning fail.

**What I did**: the middle one. `_with_database_secret` is the sibling of `_with_secret`
beside it and rewrites a DSN only where it names `database.user` from the destination's own
declaration. DSNs naming the other three roles are left exactly as they are, because there
is no secret to put in them and inventing a variable would produce a credential the database
has never been told about. The gap for those three is real and is recorded below rather than
papered over. Tracked files still carry the role and never the secret.

One thing I got right by being made to: the component first read its store path from a
`HARNESS_STORES_DIR` environment variable, and the literal-path gate refused it — NFR-04
admits one variable. Moving it to `features.store.definitions_directory` in the document
named by `HARNESS_CONFIG` was not just compliance: because the key ends in `_directory` and
holds a container path, `mount_lint.py` now checks the deployment actually mounts it. I
watched both refuse — the component on an unmounted path, the gate on an undeclared one.

**Result**: `full` builds; the feature store holds 651 bathymetry rows and a coastline; two
consecutive seeding runs give identical digests; both seed steps report into the seeding
record. All 13 gates clean, client green.

**What I need from you**: `drogna_ingest`, `drogna_read` and `drogna_telemetry` are created
`LOGIN` with no password and their DSNs carry none. Nothing exercises them in the active
profile today, so nothing is failing — but the first component that connects as one of them
will hit exactly what I hit. Should they get generated secrets on the broker's model, or is
the intent that they authenticate another way?
