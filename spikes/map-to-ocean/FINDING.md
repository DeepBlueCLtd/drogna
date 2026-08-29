> **V1 record — describes retired software; superseded for V2 by `srd.md`, constitution 2.0.0 and ADR-0027.**

# Finding: six links between the map and the ocean, five of them broken, none of them the map

**Run date**: 28 August 2026

**Spike**: none — this is an investigation raised by feature 017 (`specs/017-map-surface/`)
against the merged tree, not a question that was scheduled

**Reproduction**: bring the local profile up (`dockerd &`,
`export HARNESS_PROXY_CA_FILE="$SSL_CERT_FILE"`, `./scripts/up.sh local`) and run the
commands in `results/measurements.txt`. Every claim below is one of those lines.

**Tracked as**: DeepBlueCLtd/drogna#34, which carries the work list as a checklist in
dependency order, with the decisions of 28 August recorded on it. This file is the
evidence and the argument; the issue is the state. If the two disagree, the tree is the
authority and both are wrong until somebody has looked.

---

## The result, in one sentence

Feature 017 built the map surface, and the map draws nothing because **five separate links
between the coverage store and the browser are broken** — an empty store, no current run,
a proxy pointing at a path the query layer does not serve, three different names for one
collection, and a released prefix no browser at this destination can authenticate to —
**and none of the five is in the client**, so no amount of client work will draw a field.

### Where each one lives

| # | Link | Where | Whose |
|---|---|---|---|
| 1 | nothing authors a coverage run | `profiles.active`, `deploy/seed.d/` | lane A, plus a lane D profiles decision |
| 2 | no run is made current | the publisher's run loop (009 T052–T058) | lane A |
| 3 | the proxy proxies to `/query/collections/…`, which 404s | `config/*/proxy.json`, `query/render_config.py` | unowned since lane C closed its bug |
| 4 | released names are not served ids | `config/*/proxy.json` | unowned, same fix |
| 5 | the announcement names a third set again | `services/publisher/…/catalogue.py`, then `client/src/map/fieldRequest.ts` | a decision, then feature 017 |
| 6 | the browser cannot authenticate to `/released` | `config/local/deployment.json` topology | **the owner's, not a lane's** |

## The question

Feature 017's specification asks for a map that draws the published uncertainty field, and
is explicit that it must also be demonstrable against an empty stack. The second half was
delivered and can be looked at. The first half has never drawn a cell, and the feature's
own plan recorded the reason as one open disagreement about collection identifiers. That
was too small an answer. This is what is actually in the way.

## The method

Bring the local profile up on the merged tree and walk the chain from the coverage store
outwards, asking each component directly rather than through the one in front of it: the
store on disk, the query layer on its own port, the proxy on its published port, and the
document the browser is actually served. No code was changed to take these measurements.

## What was found

### 1. Nothing authors a coverage run

`/var/lib/drogna/coverage` exists and contains nothing — not an empty `runs/`, no `runs/`
at all. The only thing in production code that writes one is the publisher
(`services/publisher/`); everything else that touches the layout is test support.

The destination cannot produce one either. `profiles.active` is `core, broker, foundation,
query, edge, shell`; `generator` (C-02) and `control` (the model runner and publisher) are
absent, so neither the field nor its publication has a process at this destination. And
`deploy/seed.d/` holds `010-observations.sh` and `020-features.sh` and nothing for
coverage — the two stores that are seeded are seeded, and the third is not.

**This is worth separating from lane A's work.** Lane A makes the *loop* publish runs
live, which is wave 6's exit criterion and is the right goal. But the *read path* could be
demonstrable independently, and today is not, because there is no seeded coverage run for
it to serve. A third seed step authoring one run through the publisher's own code path
would be seed data in exactly the sense the constitution's Data section already permits —
"produced by scripts, never accumulated" — and would not be a fixture in Constitution
VII's sense, because the client would fetch it from the real query layer over the real
boundary. It is a smaller thing than the live loop and it is not the same thing.

### 2. No run is current

Even with a run staged, the catalogue resolves the current run from a pointer file the
publisher writes. Asked for a cube today, the query layer answers 400 and says exactly
that: *"no run is current: current names none."* That is correct behaviour and a good
error; it is recorded here so that (1) and (2) are not mistaken for one item.

### 3. The proxy proxies to a path the query layer does not serve

The rendered nginx sends `/released/drogna-forecast/` to
`http://query:8080/query/collections/drogna-forecast/`. Measured: `/query/collections/…`
answers 404 and `/collections/…` answers 200. The query layer serves at the root.

The `/query` in that upstream comes from `collection_prefix` in the destination's
`query.json`, which reaches pygeoapi's `server.url`. That field is **link generation, not
routing**: it changes the URLs the service advertises and moves none of its routes. So the
service advertises `/query/…`, the proxy proxies to `/query/…`, and the service serves
`/collections/…`.

**This is the same fault lane C chased under another name, and lane C fixed only half of
it.** The `long-run-01` BLOCKED entry of 2026-08-28T10:15 recorded the SensorThings entity
sets as 404 with the observation that "its own links advertise `<public>/query/Things`;
both 404 against the running query layer. The two disagree, so one of them is wrong rather
than merely unreachable." That is this. Lane C's fix (`adbc46f`, merged 28 August)
corrected the advertised links and closed the item — "the routing was sound and the
advertised links were a collection short of it". The advertised links were indeed a
collection short. The *proxy's upstream* was never in that reading, still names `/query`,
and still 404s, which is measured above on the tree that carries the fix.

So the entry is closed, the delivery plan's outstanding-work table has struck the row, and
the half of the fault that stands between the browser and the coverage store now has
nobody looking at it. That is the reason this file exists.

### 4. The released names are not the served ids

The proxy releases `drogna-forecast` and `drogna-uncertainty`. The query layer serves
`forecast` and `observations`. Neither released name exists, and `drogna-uncertainty`
never will: `query/plugins/edr_coverage.py` states the design in its first paragraph —
one collection carries the forecast parameters and the uncertainty parameter together,
"rather than two collections that could disagree about the run they describe". The
`forecast` collection advertises `position`, `cube`, `trajectory` and `instances`, and
carries `temperature_uncertainty` among its four parameters.

So links 3 and 4 are one config change in `config/*/proxy.json` and possibly one in
`query.json`, and the shape they should take is decided by (5).

### 5. The announcement names a third set again

`run-published` carries `collections.forecast` and `collections.uncertainty`, and the
publisher fills them with `forecast-<run_id>` and `uncertainty-<run_id>`. Given (4) there
is nothing for those to name. The query layer's own answer to "how is a particular run
addressed" is an EDR **instance** of the fixed collection, which is what
`pygeoapi-config.yaml.template` says in as many words: "Adding a run therefore adds no
collection, edits no file and restarts nothing."

Three readings are available and this file does not choose between them:

- the announcement should carry the fixed collection identifier and the run separately, so
  a consumer addresses `…/forecast/cube?…` for the current run and an instance for a named
  one. Smallest change; makes `collections.uncertainty` redundant, which is honest, because
  it is;
- the announcement is right and the query layer should serve a collection per run. This
  contradicts `edr_coverage.py`'s stated reason and would reintroduce the disagreement it
  exists to prevent;
- the announcement's identifiers are advisory and consumers resolve them through the
  collections listing. The boundary forbids that: the listing is not released (see 6).

Feature 017's field fetch and feature 012's trajectory query both address the announced
identifier today, because SRD FR-31 says that is what the identifier is for. Neither has
ever run against a live publication. Whichever reading wins, the client change is small.

### 6. The browser cannot authenticate to the released prefix, by design

Everything under `/released` answers 401 with `WWW-Authenticate: Basic`, and neither the
proxy nor the query layer sends any `Access-Control-Allow-Origin`. At the local
destination the client is published on `:8080`, the proxy on `:8081` and the clock on
`:8090` — three origins. So a `fetch` from the page to the released prefix is refused
twice over: cross-origin with no CORS, and unauthenticated with no way for a browser
`fetch` to carry a Basic credential it was never challenged for on that origin.

**The clock is the exception, and it is instructive.** It answers
`Access-Control-Allow-Origin: *` and handles the preflight for its control route
(`GET, POST, OPTIONS`), so the page reaches it cross-origin and the rate control works —
which is why feature 016's pair capture can pin the clock to zero and why that job is
green. Three services sit off the page's origin; the one that opted into being reached
from a browser is reachable, and the two that did not are not. The obstacle is a policy,
consistently applied, rather than an oversight.

**This is not an oversight and no lane will fix it.** The `long-run-01` BLOCKED entry of
2026-08-27T22:35 found the same shape for the broker socket, set out three answers, and
said an unattended agent must not choose among them. The decision recorded on 28 August
took the second answer **for `/ctl` only**, and reaffirmed the other half in the same
sentence: "binary clearance for `/released`, delegation to the broker's ACL for the
control upgrade" (ADR-0001's amendment, now accepted; ADR-0020). So the released prefix
keeps its clearance deliberately, and the map's fetch is refused deliberately.

What remains is the third of that entry's three answers — serve the client *from* the
proxy, so the page and its data share one origin and one challenge covers both. The entry
already judged it "the largest change and probably the intended shape", and noted that
`deployment.json` publishes the client on `:8080` and advertises it as `public_url`, so it
is a topology change rather than a configuration one.

**The droplet does not have this problem. It has a worse one.** Its `client.json` names
`https://drogna.invalid` for both the clock and the query layer, and only the proxy binds
`0.0.0.0` there — the client and the clock bind `127.0.0.1`. But the proxy has six
locations and not one of them is the page or the clock:

    location /                                  the default deny
    location /released/                         deny-not-released
    location = /released/drogna-forecast        and its ^~ pair
    location = /released/drogna-uncertainty     and its ^~ pair
    location = /ctl                             the websocket upgrade
    location = /health                          on the internal server, never published

So `https://drogna.invalid/` — the address `public_url` advertises — answers 401, and
behind the credential it default-denies. **The droplet has never served the client**, and
the clock endpoint its own client document names does not answer. Both destinations'
configuration was written for a shape nobody built: local publishes the page directly and
so is merely awkward; the droplet does not publish it at all and so is fatal.

### What was decided, 28 August

Put to the owner as three questions, with the costs of each answer stated:

- **The page is served through the proxy, behind the same clearance as everything else.**
  One credential for the page, the data and the control socket. `auth_basic` stays
  declared once at server level, which is the property `harness.conf.template` defends in
  as many words, and no per-location exception is introduced. drogna becomes a private
  demonstration whose address is handed out, rather than a public page with private data.
- **The clock is not proxied.** It already permits cross-origin and works; the droplet's
  client document is corrected instead, since it names an endpoint that cannot answer
  there. A destination that publishes no clock route renders the speed control as
  unavailable and says why, which is a state feature 012 already built.
- **The local direct publish of the client is dropped.** The client binds `127.0.0.1` as
  it already does on the droplet, `public_url` and the capture configuration point at the
  proxy, and the two destinations finally have one shape and one door.

The third has a consequence worth stating before it is met: with the page behind the
clearance, **every capture mechanism needs the credential** to load the page at all.
Playwright takes one through `httpCredentials`, and `config.capture.schema.json` has no
field for it. That is feature 016's contract and its three mechanisms.

## What this costs if it is left

Each link on its own reads as somebody else's item, and every one of them has a component
on each side that is internally coherent. That is the shape of fault this repository has
already paid for twice — the bind mount that every container saw as empty while every
container reported healthy, and the health check naming a program its image did not carry.
Nothing is red. The map states, correctly and in plain words, that no field has been
received. The six statements are each true and the system does not work.

The specific risk of leaving it unwritten is (3): lane C's item is closed, the delivery
plan's row is struck through, and a future session reading the record will find the read
path's bug marked done. It is half done, the other half is measured above, and the tree is
the authority.

## Recommendation

In this order, because each is cheap once the one before it is settled:

1. **A `030-coverage.sh` seed step** authoring one run through the publisher's code path.
   Makes the read path demonstrable without waiting for the loop, and gives 3–6 something
   to be tested against.
2. **Fix the proxy's upstream and the released names** (3 and 4). One config change, and
   the measurements above are its test.
3. **Settle the collection identifier** (5). A decision, then a small change in the client.
4. **Decide the local topology** (6). The owner's, not a lane's.

1–3 make the droplet draw a field. All four make the local stack draw one.

The checklist for all four, with the files each touches, is on
DeepBlueCLtd/drogna#34. Nothing in this file is ticked as work proceeds — a finding
records what was true on the day it was taken, and a finding edited to stay current stops
being evidence of anything.
