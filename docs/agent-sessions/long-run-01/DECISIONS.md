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
