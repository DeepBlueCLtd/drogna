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
