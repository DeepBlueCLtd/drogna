# Tasks: Something to press at every node, and it comes first

All ticked items were built on `claude/operator-tab-mobile-ux-g1ais1` and are green under
`pnpm check` and `pnpm capture:mobile`.

## The prompts

- [x] T01 Amend `config.sensors`, `config.platform`, `config.coverage-store` and
      `config.telemetry` masters with the new `*_event` keys, and the two stores' command
      topic. Masters are amended, never rewritten.
- [x] T02 Subscribe `coverage-store` and `telemetry` to `ctl/operator/command` in the
      broker's roles; topology re-derives from there.
- [x] T03 `sensors` answers `sample-now`. `sampleAll` returns whether it sampled, so a
      prompt that finds no fresh position no longer inflates the skipped-sampling-tick
      count that belongs to the cadence.
- [x] T04 `platform` answers `report-now`.
- [x] T05 `coverage-store` answers `announce-holdings`; the announcement is written once
      and called from both the write path and the prompt.
- [x] T06 `telemetry` answers `skill-now` and `statistics-now`.
- [x] T07 Prompted counts as heartbeat figures, absent until asked for.
- [x] T08 The events-answered check reads any `*_event` key rather than naming two by
      hand — it reported all five new events as offered to nobody, which is how the
      defect was found.

## The panel

- [x] T09 `Actions.tsx`: one presentation for every action, with the descriptions in a
      disclosure below the row.
- [x] T10 `probes.ts`: the six probes and the three deferrals, declared once.
- [x] T11 `ProbeControl.tsx`, and `EventControl` rebuilt on `Actions`.
- [x] T12 `Lifecycle`: stop, start and restart move from the foot of the drawer into the
      actions row; a protected component still says why it has none.
- [x] T13 The step commands leave the panel header for the clock's drawer.
- [x] T14 Wires, region table, tuning, legend and the two footnotes behind named
      disclosures at every width.
- [x] T15 The list view at four columns when narrow.
- [x] T16 `undeclared_probe` declared in `config.shell`'s endpoints, with the reason.
- [x] T17 The panel counts what is actionable from the three declarations.

## The proofs

- [x] T18 `capture:mobile` opens all twenty-two accounts at a phone's width, waits for
      the 200ms tween to settle, and holds each to the sideways rule and the 44px target.
- [x] T19 Form controls excluded from the sideways rule, for the reason SVG already is.
- [x] T20 Fix what it found: the card's border outside its slot, three faces clipping
      their label columns, the demand fields side by side at a phone's width, and the
      range input content-box under a filling width.
- [x] T21 Plant and revert, every check: nine plants across the backend, the panel and
      the capture proof, each caught by the assertion aimed at it.

## Not done

- [ ] ~~A prompt for the analyst~~ — it analyses for a run request; prompting it directly
      would put a second copy of the scheduler's policy in the control plane. See spec.
- [ ] ~~An announcement from the advisory store~~ — no write rule in the topology; it
      would need a new topic and a new master for a message nothing consumes. See spec.
- [ ] ~~A universal "beat now"~~ — reachable only for the twelve components that already
      have buttons.
