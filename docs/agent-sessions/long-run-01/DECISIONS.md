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
