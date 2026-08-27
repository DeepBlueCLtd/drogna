/**
 * What the message that just passed actually is: decoded, validated, and said plainly.
 *
 * Three outcomes, deliberately not two. **Valid** means the payload was JSON and the
 * schema that governs the topic accepted it. **Invalid** means the schema refused it, and
 * the refusal travels with the message so a viewer sees what was wrong rather than an
 * absence (FR-005). **Unvalidated** means this build carries no master for the topic: the
 * message is shown exactly as received and is not dressed up as having passed anything.
 *
 * That third outcome is not a hedge, and it is not dead code kept for symmetry. It is
 * what a topic falls into when this build carries no master for it, and the alternative
 * — showing such a payload as valid — would be the display asserting a check that never
 * happened, which is the same class of error as lighting a component nothing was heard
 * from. Every control topic this client subscribes to is currently governed; the state
 * exists so that subscribing to one that is not cannot silently produce a false claim.
 *
 * Nothing here lights anything or draws anything. It reads bytes and reports on them.
 */
import { CONTROL_SCHEMAS, rejectionReason, schemaTitle } from "../contracts/schemas";
// One line, deliberately: the literal-path gate reads a wrapped import's closing line as a bare string.
import { CLOCK_TOPIC, CONTROL_TOPICS, DIVERGENCE_TOPIC, HEARTBEAT_TOPIC, PLAN_TOPIC, RUN_PUBLISHED_TOPIC, RUN_REQUEST_TOPIC, RUN_STARTED_TOPIC, TELEMETRY_TOPIC } from "../data/topics";

export type ValidationState = "valid" | "invalid" | "unvalidated";

/** The schema that governs each control topic, where this build carries one. */
const GOVERNING = new Map<string, (typeof CONTROL_SCHEMAS)[keyof typeof CONTROL_SCHEMAS]>([
  [HEARTBEAT_TOPIC, CONTROL_SCHEMAS.heartbeat],
  [CLOCK_TOPIC, CONTROL_SCHEMAS.clock],
  [DIVERGENCE_TOPIC, CONTROL_SCHEMAS.divergence],
  [RUN_REQUEST_TOPIC, CONTROL_SCHEMAS.runRequest],
  [RUN_STARTED_TOPIC, CONTROL_SCHEMAS.runStarted],
  [RUN_PUBLISHED_TOPIC, CONTROL_SCHEMAS.runPublished],
  [PLAN_TOPIC, CONTROL_SCHEMAS.plan],
  [TELEMETRY_TOPIC, CONTROL_SCHEMAS.telemetry],
]);

/**
 * Topics this build carries no master for. Empty, and a test keeps it honest.
 *
 * Kept as a computed list rather than a written one, so it cannot say "empty" while the
 * subscription quietly grows a topic nothing governs.
 */
export const UNGOVERNED_TOPICS: readonly string[] = CONTROL_TOPICS.filter(
  (topic) => !GOVERNING.has(topic),
);

/** The name of the schema governing a topic, or null where this build carries none. */
export function schemaNameFor(topic: string): string | null {
  const governing = GOVERNING.get(topic);
  return governing === undefined ? null : schemaTitle(governing.schema);
}

/** The schema document governing a topic, for the panel that shows it beside the instance. */
export function schemaFor(topic: string): unknown {
  return GOVERNING.get(topic)?.schema ?? null;
}

/** One received message, examined. Everything the inspector shows comes from here. */
export interface Inspected {
  readonly topic: string;
  /** The bytes exactly as they arrived. Shown even when nothing could be made of them. */
  readonly raw: string;
  /** The decoded payload, pretty-printed, or null where it was not JSON. */
  readonly payload: string | null;
  /** The simulation time the message carried, or null where it carried none. */
  readonly simTime: string | null;
  /** The tick the message carried, or null. */
  readonly tick: number | null;
  /** The run identifier the message carried, under whichever of its two names. */
  readonly runId: string | null;
  readonly schemaName: string | null;
  readonly validation: ValidationState;
  /** Why the schema refused it, or why it could not be checked. */
  readonly detail: string | null;
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

/**
 * The run identifier, under either of the two names the control contracts use.
 *
 * A divergence event names the model run it scored against as `forecast_run_id` and
 * carries its own `divergence_id`; the three later messages all name the run `run_id`.
 * The inspector shows whichever is there rather than insisting on one spelling, because
 * the point of the panel is to let a viewer follow one identifier through four messages.
 */
function runIdentifier(record: Record<string, unknown>): string | null {
  return nullableString(record, "run_id") ?? nullableString(record, "forecast_run_id");
}

/** Decode and check one received payload against the contract that governs its topic. */
export function inspect(topic: string, raw: string): Inspected {
  const schemaName = schemaNameFor(topic);
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw) as unknown;
  } catch (error) {
    return {
      topic,
      raw,
      payload: null,
      simTime: null,
      tick: null,
      runId: null,
      schemaName,
      validation: "invalid",
      detail: `the payload is not JSON: ${error instanceof Error ? error.message : "unreadable"}`,
    };
  }

  const record =
    typeof decoded === "object" && decoded !== null && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>)
      : {};
  const tick = record["tick"];
  const base = {
    topic,
    raw,
    payload: JSON.stringify(decoded, null, 2),
    simTime: nullableString(record, "sim_time"),
    tick: typeof tick === "number" ? tick : null,
    runId: runIdentifier(record),
    schemaName,
  };

  const governing = GOVERNING.get(topic);
  if (governing === undefined) {
    return {
      ...base,
      validation: "unvalidated",
      detail:
        "no schema for this topic is compiled into this build, so the payload is shown as received and is not claimed to have passed anything",
    };
  }
  if (!governing.validate(decoded)) {
    return { ...base, validation: "invalid", detail: rejectionReason(governing.validate) };
  }
  return { ...base, validation: "valid", detail: null };
}

/** How each outcome is put into words and a mark, so greyscale carries it (PR-08). */
export const VALIDATION_WORDS: Readonly<Record<ValidationState, { label: string; glyph: string }>> =
  {
    valid: { label: "validates against its schema", glyph: "✓" },
    invalid: { label: "received, and refused by its schema", glyph: "✗" },
    unvalidated: { label: "received; no schema in this build governs it", glyph: "?" },
  };
