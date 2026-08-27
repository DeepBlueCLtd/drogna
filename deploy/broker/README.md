# The broker (C-03)

Owned by `007-observation-path`. `deploy/compose.yaml` declares the service, pins the image
by digest and mounts this directory read-only at the container path the destination
configuration names; the contents are this feature's, because the access control lists are
the substance of FR-14 and belong beside the components they constrain.

| File | What it is |
|---|---|
| `mosquitto.conf` | Listeners, persistence, logging, and the two files below. |
| `acl` | Who may publish and subscribe where. FR-14, and ADR-0008's browser identity. |
| `passwd` | Generated at deploy time. Untracked, and never committed. |
| `two-broker/` | The documented physical-separation fallback (FR-15). |

Every value in `mosquitto.conf` is container-internal and identical at both destinations,
which is why none of it is interpolated: Mosquitto expands no environment variables in its
configuration, so a value that had to differ per destination could not live in this file at
all. What differs per destination — the host address and port the broker is published on —
is in `config/<destination>/deployment.json` under `network.publish.broker`.

---

## Two listeners

**1883, MQTT over TCP.** Every component reaches the broker here, by service name over the
internal network.

**9001, MQTT over WebSockets.** This is the far end of ADR-0008. The browser reaches the
control namespace through a WebSocket upgrade location at the reverse proxy, and the proxy
proxies to this listener. It is deliberately not published to the host: a listening port
outside the reverse proxy is the option ADR-0008 rejected, and it would contradict FR-41's
default deny.

ADR-0008 is also explicit about where the browser is constrained, and it is not at the
proxy. Path policy is evaluated once, at the upgrade; the connection then persists carrying
traffic the proxy does not inspect per message. What a subscriber may receive is settled by
the access control list here, and `tests/integration/test_topic_isolation.py` tests it at a
running broker rather than by reading this file back.

---

## The roles

Credentials are per role, not per client instance. Ten sensors share one role, so adding a
sensor needs no rule here and gains no permission.

| Role | May publish | May subscribe |
|---|---|---|
| `drogna_sensor` | `obs/#` | `ctl/clock` only |
| `drogna_ingest` | `ctl/heartbeat`, `ctl/telemetry` | `obs/#`, `ctl/clock` |
| `drogna_control` | `ctl/#` | `ctl/#`, `obs/#` |
| `drogna_viewer` | nothing at all | `ctl/#` |

Mosquitto denies by default, so an omission is a denial rather than a hole, and a role with
no block can do nothing once it has authenticated.

### The two exceptions, and why they are here

The sensor and ingest roles may read `ctl/clock`, which FR-14's wording would refuse them.
Two requirements conflict there — a component with no clock sample can only pace itself on
the host clock, which Constitution I forbids — and the decision, with what it costs the
two-broker fallback, is **ADR-0012**. It is not restated here: a decision recorded twice is
a decision that will be amended once.

The sensor role may also write `ctl/heartbeat`, which the same wording would refuse. Without
it the heartbeat is denied at the broker — silently, the client's return code being zero for
a message it accepted locally — so C-04 announces itself to nobody and can never light its
box in the shell. The decision, and why the forgery objection that had kept it out is not
held anywhere else in this file, is **ADR-0015**.

What follows from them for these lists is only this. The property to test is not that a
sensor's subscription to `ctl/#` is refused; it is that subscribing to `ctl/#` delivers the
clock and nothing else. And on the write side it is not that the sensor role is refused
`ctl/`; it is that it is granted exactly `ctl/heartbeat` and refused every other control
topic by name.

### A mechanical detail that decides how the lists are tested

Mosquitto grants every subscription and enforces read rules **at delivery**, so a denied
subscription does not show up as a failed SUBACK — it shows up as nothing arriving. Every
subscription assertion in the tests is therefore a delivery assertion: an authorised
publisher sends, and the subscriber under test either receives it or does not. A test that
checked the SUBACK would pass against a broker enforcing nothing.

---

## Credentials

`passwd` is produced at deploy time and is never tracked. It is a Mosquitto password file:
one line per role, with the password hashed by `mosquitto_passwd`.

```sh
docker run --rm -v "$PWD/deploy/broker:/work" <the pinned broker image> sh -c '
  mosquitto_passwd -c -b /work/passwd drogna_sensor "$SENSOR_SECRET" &&
  mosquitto_passwd    -b /work/passwd drogna_ingest "$INGEST_SECRET" &&
  mosquitto_passwd    -b /work/passwd drogna_control "$CONTROL_SECRET" &&
  mosquitto_passwd    -b /work/passwd drogna_viewer "$VIEWER_SECRET" &&
  chown 1883:1883 /work/passwd && chmod 0600 /work/passwd'
```

**Create the file with its final owner and mode inside the container, and do not touch it
from the host afterwards.** The container writes as root; a deploying user who is not root
then cannot change the mode of a file they do not own, and the attempt fails with
`Operation not permitted`. Doing all of it in the one place also gives the file the
ownership Mosquitto asks for, which removes its warning about a credential file it will
refuse to load in a future version.

The directory matters too. The broker runs as its own unprivileged user, so it needs to be
able to traverse the mounted configuration directory and read `mosquitto.conf` and `acl` —
0755 on the directory and 0644 on those two files. They are not secrets; the credential
file is, and it is the one with the restrictive mode.

A missing credential file stops the broker rather than opening it, which is the failure we
want: `allow_anonymous` is `false`, and a broker that cannot read its password file refuses
to start.

**Two things this feature does not own and has therefore not done.** The environment
template and the render step live in `deploy/env.template` and `deploy/lib/render_env.py`,
which belong to `005-compose-deployment`. Producing `passwd` at deploy time needs a
generated secret per role there, exactly as `HARNESS_DATABASE_PASSWORD` already is, and
`deploy/broker/passwd` needs an entry in `.gitignore`. Both are one-line additions in
another feature's files and are reported rather than made.

Components receive their credentials in the broker URL their configuration carries —
`mqtt://<role>:<secret>@<host>:<port>`. The tracked configuration files carry the role and
no secret; the render supplies the secret. No component holds more than one broker endpoint
in source, which is what makes the fallback below a configuration change.

---

## The two-broker fallback (FR-15)

Physical separation of the two namespaces onto two brokers, documented and demonstrated
once. `two-broker/` holds the control broker's `mosquitto.conf` and `acl`, and a Compose
overlay that adds the second service without editing `deploy/compose.yaml`:

```sh
docker compose --file deploy/compose.yaml \
               --file deploy/broker/two-broker/compose.control-broker.yaml \
               --env-file deploy/.runtime/.env up
```

The observation broker keeps this directory unchanged. The control broker carries the
control namespace alone, with the same roles and the same rules minus the observation
branch, so there is nothing on it to contaminate.

`tests/integration/test_topic_isolation.py` demonstrates it: two brokers started from the
two tracked configurations, observation traffic flowing through one and control traffic
through the other, with no source file involved.

### The diff of taking it

What changes is a set of values, and the list is short:

1. `deployment.host_paths.broker_config_dir` gains a sibling pointing at
   `deploy/broker/two-broker`, rendered as `HARNESS_BROKER_CONTROL_CONFIG_HOST_DIR`.
2. The overlay file is added to the `docker compose` invocation.
3. Each component's `broker.url` in `config/<destination>/` points at whichever broker
   carries the traffic it publishes: sensors and ingest at the observation broker, the
   control components at the control broker.
4. The reverse proxy's upgrade location points at the control broker instead.

No source file changes, and none of the four is a code decision.

### The one consequence that is not free

Two components need both namespaces: the sensors and the ingest client both publish or read
observations *and* subscribe to `ctl/clock` for simulation time (ADR-0009). With one broker
that is one connection. With two it is two, and a component's configuration carries one
broker endpoint — so the fallback needs `broker` in
`contracts/schemas/config.common.schema.json` to gain an optional second endpoint for the
control namespace.

That schema belongs to `001-deterministic-foundations`, so this feature has not amended it.
The fallback is complete and demonstrated at the broker; the component-side half is a
declared consequence and is reported rather than smuggled in. It does not weaken FR-15's
claim — the change is still configuration only — but it is a change to a shared schema and
the owning feature should make it.
