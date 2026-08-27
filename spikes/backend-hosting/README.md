# Backend hosting spike

**The question**: is a persistent backend for drogna easier to obtain on DigitalOcean, on
Fly.io, or somewhere else?

**The answer**: DigitalOcean, and not because DigitalOcean is better. Every alternative
examined needs a second deployment description alongside `deploy/compose.yaml`, and the
constitution allows one. Read [FINDING.md](FINDING.md).

## And then: what is *in* it

[DEPLOYMENT-WORKFLOW.md](DEPLOYMENT-WORKFLOW.md) is the follow-on. The hosting finding
settled where the backend lives; that document settles how it is kept current and how a
feature is developed around it — deployment on push to `main`, a feature's two halves as two
pull requests with the backend first, and combined work done locally. It supersedes a
per-pull-request environment design written earlier the same day, and records why.

It is also where the wall lives: the client is to be published to GitHub Pages, which
serves it over HTTPS and will not let it speak `http` to anything. So a domain name and a
certificate are on the critical path rather than at the end of it. It is a proposal to be
argued with rather than a specification, and it becomes `specs/017-*` if the shape is agreed.

## This is a desk spike

There is no `run.sh` and there is no code here. Nothing was deployed and nothing was
measured: no account was charged, no droplet was created, and no `fly launch` was run. The
evidence is of two kinds, and the finding keeps them apart —

- **Read out of this tree.** Counts, keys and constraints taken from `deploy/compose.yaml`,
  `config/droplet/`, `.specify/memory/constitution.md` and `scripts/gates.registry`. These
  are checkable by running the commands quoted beside them.
- **Read off vendor documentation, on 27 August 2026.** Prices and platform limits, each
  with its source. These decay. A price quoted here is worth re-reading before it is spent.

The one thing this spike could not do is the one thing most worth doing, and it is named in
the finding's handover: nobody has ever run `deploy/droplet/`. That is an hour of somebody's
evening and about four pence, and it retires more risk than any amount of comparison.

## The requirements it was given

Gathered by interview on 27 August 2026, before any option was looked at:

| | |
|---|---|
| Purpose | An always-on demonstration address. Lives for months. |
| Running around the clock | The web tier — proxy, client, query layer. The simulation loop started on demand. |
| Public exposure | Undecided at interview. The finding settles it: port 443 and nothing else. |
| Budget | £/$20–30 a month. |
| Durability | A reset on every deploy is acceptable. Seeding is deterministic. |
| Ops appetite | As little host babysitting as possible. |
| Deployment | Push-to-deploy from CI, and agent sessions able to deploy unattended. |
| Already held | DigitalOcean and Fly.io accounts. No domain name yet. |

Two of those answers do most of the work. *Reset on every deploy is acceptable* removes
backups, restores and schema migration from the comparison entirely, which is most of what
makes a long-lived VM tiring. *Web tier always, loop on demand* is a description of Compose
profiles, which is the mechanism drogna already has and the one the platform candidates
discard.
