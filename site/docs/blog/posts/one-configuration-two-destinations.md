---
date: 2026-08-26 13:00:00
categories:
  - Architecture
slug: one-configuration-two-destinations
feature: specs/005-compose-deployment
description: >-
  A laptop and a small cloud server run the same stack, and the only thing that
  differs between them is a directory of values — checked by a script, because
  the drift starts on the day the second destination exists.
---

# One configuration, two destinations

drogna runs in two places: a laptop, and a small cloud server that exists so a
demonstration has an address which persists. The usual arrangement for that is two
compose files, or one plus a pile of overrides, and by the third month they are two
systems that share a git repository.

<!-- more -->

The alternative here is a rule with no exceptions. There is one Compose file, naming
every service drogna will ever have. A destination is a directory of values under
`config/`. Nothing else distinguishes one from another: no service definition, no
image, and no source file knows where it is running.

That is held up by a constitutional rule about source code. No component contains a
literal filename, directory path, hostname, port or URL. Each reads exactly one
environment variable, which names its own configuration file, and validates that file
against its schema as the first thing it does — before any I/O, so that invalid
configuration is a startup failure with a readable message rather than a surprise
three hours in. A [lint gate](the-gate-that-examined-nothing.md) fails the build on a
literal that slips through.

## The exceptions, and why they are the honest kind

A browser reads no environment variables. So for the client the single-variable rule
becomes a single served document, fetched at start-up from one relative URL, and that
URL is the only location named anywhere in the client's source. It carries an inline
exemption marker giving that reason, and appears in the repository's list of
exemptions where a reviewer will see it.

Postgres and nginx read no drogna configuration file at all. They are configured
through the interfaces their own publishers define — `POSTGRES_DB` and its siblings,
a template directory and the values substituted into it. Every one of those values
still comes from the destination's configuration, by way of an environment file that
is generated at deploy time from a tracked template carrying names and no values.
Nothing is written literally anywhere; the third-party images are simply the boundary
where drogna's convention stops and someone else's begins, and saying so is more
useful than pretending the convention is universal.

## The check that exists from day one

Two destination directories must hold the same files and, within each file, the same
keys. Only values may differ. A script compares them and fails the build otherwise,
reporting every difference rather than stopping at the first.

The reason it was written on the day the second destination appeared, rather than the
day it first caused trouble, is that this particular drift has no symptom. A key added
to one destination and forgotten in the other does not break anything until the code
consuming it runs at the destination that lacks it, which is usually the remote one,
usually during a demonstration. Adding a third destination, for the same reason, is a
directory of the same shape and not a code change.

## What a profile means, and what it must never mean

Compose profiles decide which services start at a destination. Most of drogna's
eighteen components do not exist yet, so their service entries sit there complete and
profiled out, and arriving at one of them is a matter of writing the component and
adding its profile rather than designing the deployment again.

A profile says what runs here today. It says nothing about what ought to exist and —
this is the part with a test guarding it — nothing whatever about which components the
[client draws as alive](eighteen-boxes-none-of-them-lit.md). That is heartbeats, only
heartbeats. A test asserts that nothing under the client reads the Compose file, the
generated environment file, the active profile list or a component list from any
configuration key, and it is tested against a fabricated offender as well as against
the real client so that it still means something later. The two mechanisms look
similar enough to join, and joining them would turn the display into something that
believes a file.

## Seed data is produced, never accumulated

Every volume holds derived data, and removing any of them loses nothing that cannot be
made again: the stores are refilled by a seeding script from the root seed, and the
broker's persistence by the messages a running stack produces inside its own liveness
windows. That is what makes an instance disposable, and it is why a fresh instance is
equivalent to one that has been running for a week.

"Equivalent" is worth little as an assertion, so seeding writes a record: the root
seed, the version of the seeding driver, the active profiles, a digest of every
configuration file the destination carries, and a digest of every artefact each
seeding step produced. It is written whole or not at all, so an interrupted seed can
never be mistaken for a completed one.

The record carries no timestamp, for two reasons that happen to agree. There is no
host clock to read — the constitution forbids it, and would forbid it here even if
nobody minded — and a timestamp would make two equivalent instances compare unequal,
which is the exact opposite of what the record is for.

So the question becomes a diff. Seed; copy the record aside; reset, which removes
every volume, brings the stack back up and reseeds; diff the two records. That has
been run from this checkout and they match. The same comparison across two machines
answers the same question about two instances.

Base images are pinned by digest rather than by tag, for the same family of reasons. A
replay resting on a floating base image is not a replay, and two destinations pulling
different content for the same tag are two destinations again, whatever the
configuration says.

## What has not been done

There are no seeding steps. Not one, because no component with a store has been built
yet. The record is still written and still fixes the seed, the profiles and the
configuration digests, and it grows a step per store as components arrive — but the
machinery above is currently seeding nothing into an empty database.

And the second of the two destinations has never been run. No cloud server was
available while this was written, so the provisioning script, the boot unit and the
pruning step are unexercised: they follow the documented installation and conventional
practice, and they are recorded in the deployment's own documentation as untested
until somebody runs them and corrects that paragraph. The local destination has been
taken through bring-up, repeat bring-up, seed, reseed, down, up and reset.

One destination is a thing that works. The other is a claim, and it is labelled as one
in the place a person would look.
