# App Platform and pull requests spike

**The question**: DigitalOcean's console offers a droplet or an App Platform app. App
Platform integrates with GitHub and, since the 2024 overhaul of `digitalocean/app_action`,
can stand up a preview app per pull request. Should drogna use that — for the hosted
backend, for pull-request previews, or for both?

**The answer**: use App Platform exactly where it runs drogna unchanged — the client,
which is a static bundle — and nowhere it would run a translation. A per-PR preview of the
client on App Platform's free static tier is cheap, real value; the hosted backend stays a
droplet running the Compose file; full-stack previews are priced here and shelved rather
than rejected. Read [FINDING.md](FINDING.md).

## The requirements it was given

Stated in conversation on 28 August 2026, before the options were weighed. Three of them
move the ground under [`backend-hosting`](../backend-hosting/FINDING.md), which is why this
is a new spike rather than an amendment to that one:

| | |
|---|---|
| Prompting question | Couldn't App Platform integrate with GitHub to support PRs? |
| Inertia | None. Nothing is integrated with DigitalOcean yet; droplets hold no incumbency. |
| Must survive, non-negotiable | Local Docker bring-up for local testing, **and** agent sessions bringing the stack up in-container for feature testing. Both run `deploy/compose.yaml`. |
| Purpose of the DO hosting | A hosted backend for demonstrations when away from a development laptop. |
| Appetite for change | "I don't mind a degree of disruption to drogna if it delivers overall value." |

The second row does most of the work in the finding. Because the Compose file must keep
serving local and agent sessions whatever else happens, no option here ever *replaces* it —
a platform's deployment description would be a second, permanent description of the same
system, and one that neither CI nor any local session can execute.

## This is a desk spike

Nothing was deployed: no DigitalOcean account was touched, no app was created, no droplet
was started. The evidence is of three kinds, kept apart in the finding:

- **Read out of this tree**, with the command beside each claim: what runs on every pull
  request today, which services the droplet's profiles activate, how the client bootstraps
  its configuration, and where the TLS gap still is.
- **Read off vendor documentation, on 28 August 2026**, each with its source: App Platform's
  preview-app mechanics, its storage and scaling limits, its prices, and Let's Encrypt's
  January 2026 general availability of IP-address certificates. Prices and limits decay;
  re-read before spending.
- **Established by the neighbouring spikes**, which measured or probed rather than read:
  the memory arithmetic that rules out two stacks on one host
  ([`container-size`](../container-size/FINDING.md)), and the mixed-content wall that
  killed the Pages-hosted client
  ([`backend-hosting/DEPLOYMENT-WORKFLOW.md`](../backend-hosting/DEPLOYMENT-WORKFLOW.md)).

The one thing this spike could not do is still the thing most worth doing, and it is
unchanged from yesterday: nobody has ever run `deploy/droplet/`, and nobody has ever
created an App Platform app from this repository either. Both recommendations in the
finding begin with an hour of somebody actually doing the thing.
