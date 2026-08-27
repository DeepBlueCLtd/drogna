# C-10, the reverse proxy

This is plumbing, and it is documented as plumbing (Constitution VI). There is no proxy
port, no abstraction over nginx, and no claim that nginx could be swapped for something
else without anybody noticing. What there is: a template, a release policy, and a renderer
that turns a destination's configuration into the file nginx serves.

It is also the whole exposure boundary. Everything a caller can reach is named in
`config/<destination>/proxy.json`, and nothing else is reachable.

| File | What it is |
|---|---|
| `policy.py` | The release policy, path normalisation, and what the boundary does with a request. The reference the request matrix checks nginx against; **not** consulted at run time. |
| `render_config.py` | `HARNESS_CONFIG` in, served configuration out. Validates against the packaged schema before any other I/O. |
| `templates/` | The only place policy is expressed. |
| `schemas/` | Copies of the schema and the common sections, written by `scripts/generate_types.sh`. |
| `entrypoint.sh` | Render, `nginx -t`, exec nginx. In that order, and it fails loudly rather than serving the previous policy. |
| `tests/` | The unit tests. The request matrix is `tests/integration/test_request_matrix.py`, because it needs a container. |

**The rendered file is a build artefact and is never edited.** It is written where
`proxy.rendered.output` says, checked with `nginx -t`, and rewritten from the template on
every start. An edit to it survives until the next restart, which is the worst possible
lifetime for a change to a security boundary.

## The three claims the template makes

**1. Everything is refused unless a location admits it.** `location /` is the whole of the
default deny. A collection absent from `proxy.released.collections` has no location in the
served file at all, so a collection the query layer began serving on its own (SRD FR-21)
has no way in. Releasing is an act.

**2. Access is binary.** One clearance per deployment: cleared for every released
collection in full, or for nothing. No directive in the served file can alter a response
body — there is no `sub_filter`, no `xslt_stylesheet`, and `proxy_intercept_errors` is left
off, so even an upstream error reaches the caller as upstream wrote it. The argument is
[ADR-0001](../docs/adr/0001-binary-access.md), and softening it would be a different
architecture rather than a configuration change.

**3. An uncleared caller is told the same thing about every path.** A released path, an
unreleased path and a path that exists nowhere produce one response, so the released set
cannot be enumerated by somebody holding nothing.

### Why the deny locations are `try_files` and not `return 404`

This is the least obvious line in the template and the one most likely to be "tidied".

`return` is executed in nginx's **rewrite phase**, which runs *before* the access phase
where `auth_basic` lives. A deny location written as `return 404` therefore answers without
the credential ever being examined — and an uncleared caller then sees 401 on released
paths and 404 on everything else, which is the released set, enumerable, by somebody
holding nothing. That is exactly what FR-006 forbids.

`try_files` runs in the **precontent phase**, after the access phase. So the uncleared
caller meets the same challenge on every path alike, and only a cleared caller ever reaches
the refusal. The probe `try_files` looks for can never be found, whatever the document root
is or is not, because no file is named for a request path with a suffix appended to it: it
is a way of reaching `=404` after authentication, not a location, and nothing is ever
served from a filesystem here.

`proxy/tests/test_render_config.py` asserts it, and
`tests/integration/test_request_matrix.py` proves it against a running nginx.

## The upgrade location (ADR-0008)

One WebSocket upgrade location at a dedicated prefix, proxying MQTT-over-WebSockets to the
broker's WebSocket listener — which feature 007 deliberately does not publish to the host,
so this is the only way into the control namespace.

It is exactly one path, not a subtree. A static prefix can afford a subtree because every
request beneath it is inspected; this cannot, because **policy here is evaluated once, at
the upgrade, and the connection then persists carrying traffic the proxy does not inspect
per message.**

What a subscriber may then receive is therefore not settled here and cannot be. It is
settled by the broker's access control lists in `deploy/broker/acl`, where the browser
identity is subscribe-only on the control namespace and is granted no rule reaching `obs/`
— which is where measurement locations travel. That is tested at a running broker in
`tests/integration/test_topic_isolation.py`, and asserted from this side in
`tests/leakage/test_released_list.py`.

## Running it

```bash
HARNESS_CONFIG=config/local/proxy.json uv run python -m proxy.render_config /tmp/harness.conf
```

With no argument it writes to the location the configuration names. In a container,
`entrypoint.sh` does that and then hands over to nginx.

## What is not here

- **TLS material.** Provisioned by the deployment (SRD NFR-06). This consumes its location
  from configuration and manages no certificate.
- **The credential file.** Produced at deploy time from the deployment's own secrets, never
  tracked, and named by `proxy.credentials.file`.
- **The leakage gates.** They run over an artefact rather than over a running system, so
  they live in `tests/leakage/` and are runnable on their own with
  `uv run python scripts/check_leakage.py`.
