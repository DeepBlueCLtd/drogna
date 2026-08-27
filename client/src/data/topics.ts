/**
 * The control namespace, as this client subscribes to it.
 *
 * Feature 003 opened the transport on two topics — `ctl/heartbeat`, the only thing that
 * lights a component, and `ctl/clock`, which carries simulation time. This module extends
 * that list to the rest of the control branch and records, for each topic, the schema its
 * payloads validate against. It records nothing else: a topic in this list is a topic the
 * client will listen on, never a claim that anything publishes on it.
 *
 * The topic names stay in source for the reason feature 003 gave for the first two. A
 * topic is a convention of the harness rather than a deployment location; where the broker
 * *is* comes from the configuration document, and this list says nothing about that.
 *
 * The order of the four run topics is the order of a run — divergence, request, started,
 * published — and `tests/acceptance/test_at_02_threshold_breach_triggers_run.py` asserts
 * the services produce them in it. The cycle drawn in `loop/` is that ordering, and this
 * is where it is written down once.
 */
export const HEARTBEAT_TOPIC = "ctl/heartbeat";
export const CLOCK_TOPIC = "ctl/clock";
export const DIVERGENCE_TOPIC = "ctl/divergence";
export const RUN_REQUEST_TOPIC = "ctl/run-request";
export const RUN_STARTED_TOPIC = "ctl/run-started";
export const RUN_PUBLISHED_TOPIC = "ctl/run-published";
export const PLAN_TOPIC = "ctl/plan";
export const TELEMETRY_TOPIC = "ctl/telemetry";

/**
 * The four control messages of one run, in the order a run produces them.
 *
 * Named separately from the whole subscription because the cycle view traverses exactly
 * these and nothing else. A message on any other control topic is still received, still
 * buffered and still inspectable; it simply does not advance the cycle.
 */
export const RUN_TOPICS = [
  DIVERGENCE_TOPIC,
  RUN_REQUEST_TOPIC,
  RUN_STARTED_TOPIC,
  RUN_PUBLISHED_TOPIC,
] as const;

/** Every topic the client subscribes to on the control namespace. */
export const CONTROL_TOPICS: readonly string[] = [
  HEARTBEAT_TOPIC,
  CLOCK_TOPIC,
  DIVERGENCE_TOPIC,
  RUN_REQUEST_TOPIC,
  RUN_STARTED_TOPIC,
  RUN_PUBLISHED_TOPIC,
  PLAN_TOPIC,
  TELEMETRY_TOPIC,
];
