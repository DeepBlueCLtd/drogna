# Feature 114 — tasks

- [x] T001 `operator-command.schema.json`: one master for both command kinds, addressed
      to a target, on one topic — rather than a topic and a master per command.
- [x] T002 `operator-controls.schema.json`: what the plane offers, with the tunable and
      event shapes in `$defs` so the operator's configuration `$ref`s the same
      definitions it is served from. No value in force appears in it.
- [x] T003 `config.operator` amended: the command topic, the three new paths, the step
      bound, the demand's target, the tunables and the events. `config.monitor`,
      `config.scheduler` and `config.advisory-source` gain the command topic; the two
      promptable components name the event id they answer to, as both sides name a topic.
- [x] T004 `run-request` admits cause `operator`; `telemetry`'s scheduler decision admits
      a null `divergence_id`, because a prompt has no divergence and naming one would be
      an invention.
- [x] T005 Operator surface: the controls statement, the tuning endpoint with the bound
      enforced by name, the event prefix, and a bounded burst on the step endpoint.
- [x] T006 Monitor: hears tuning addressed to it, reports both settings in force as
      heartbeat figures, and scores against them everywhere — streak rule, residual
      sample, divergence.
- [x] T007 Scheduler: hears tuning of both intervals, and weighs a prompt under the
      policy a divergence gets; the decision is published either way.
- [x] T008 Advisory source: authors the next advisory in its sequence on a prompt, and
      counts how many were prompted.
- [x] T009 `DemandControl` rebuilt: sliders bounded by the platform's reported limits,
      typed entry beside each, presets that demand only what they name, and the honest
      fallback where nothing has been reported yet.
- [x] T010 `TuningControl` and `EventControl`: the ask, the bound and the value in force
      kept visibly separate; a prompt described in terms that admit a decline.
- [x] T011 Panel: the controls statement fetched and validated, the ▸ mark on every node
      that takes a control, the burst button, and the scheduler's last decision drawn in
      its own drawer.
- [x] T012 Walkthrough updated: the clock, platform, monitor, scheduler, advisory-source
      and operator steps say what can be done and what the component will do about it;
      the opening step names the ▸; the closing step asks the reader to drive it.
- [x] T013 Tests, each watched failing against a planted defect: eleven plants, eleven
      catches, listed in the specification's acceptance evidence.
- [x] T014 `srd.md` §5.14, FR-63 to FR-66, written from the feature as built.
- [x] T015 Blog entry `site/docs/blog/posts/the-button-that-can-say-no.md`.
- [x] T019 Second round, from the author's interview: three more events (now-cast,
      replan, stage a window), two more tunables (sampling cadence, usable doubt), and
      fault injection from the components that would really fail.
- [x] T020 `config.env-generator`, `config.planner`, `config.offload` gain the command
      topic and the event they answer to; `config.sensors` and `config.platform` gain
      the command topic and a `fault_event` that says plainly what it is.
- [x] T021 The sampling-cadence trap, found by a failing test: shortening the cadence
      below the platform's reporting interval starves the sensors. The platform's
      reporting interval became the seventh tunable rather than the coupling being
      hidden, and the sensors publish their skipped count as a figure.
- [x] T022 srd.md FR-67: a component may be asked to publish one deliberately faulty
      message, from the component a real fault would come from, counted and reported.
- [x] T023 Panel: messages are validated against their master before anything is drawn
      from them, and the count refused is stated. The first injected fault had taken
      the whole flow chart down.
- [x] T024 Panel: holding sizes read from the inventory the store serves, after the
      announcement was found to carry none and the stack to have never drawn a bar.
- [x] T025 The packager's most recent decline reaches its heartbeat, so a refused
      prompt is legible at the node where it was asked for.
- [x] T026 Tests for all of it, each watched failing against a planted defect — and
      three planted defects that nothing caught, each resolved by deleting the line
      that was doing no work rather than by adding a test for it.
- [x] T016 A prompted offload — *done in the second round, and the reservation was
      answered rather than overridden: it stages over the release it last heard, under
      the rules it already had, and says so when there is nothing to stage over.*
- [x] T017 Tuning the planner's usable-doubt threshold — *done in the second round: it
      was asked for, which was the only thing it was waiting on.*
- [ ] T018 A second publisher of platform demands — *deliberately not done, and not this
      feature's to do: FR-53 reserves that for an adaptive-sampling component, and
      Constitution VIII governs whether one may exist.*
