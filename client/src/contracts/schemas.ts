/**
 * The contract masters, compiled once.
 *
 * Constitution III admits one definition of a shape that crosses a language boundary,
 * so the schemas are imported from the repository's `contracts/schemas` directory rather
 * than copied into this package. Feature 006 generates TypeScript types from the same
 * files into `src/generated`; until that chain lands, this client validates at runtime
 * and reads the validated document through the adapters in `liveness` and `config`,
 * declaring no second copy of either shape.
 *
 * The clock sample schema belongs to feature 001, which publishes the messages. It is
 * consumed here and not modified.
 */
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";

import clockSchema from "../../../contracts/schemas/clock.schema.json";
import configSchema from "../../../contracts/schemas/config.client.schema.json";
import divergenceSchema from "../../../contracts/schemas/divergence.schema.json";
import heartbeatSchema from "../../../contracts/schemas/heartbeat.schema.json";
import ingestTelemetrySchema from "../../../contracts/schemas/ingest-telemetry.schema.json";
import offloadTelemetrySchema from "../../../contracts/schemas/offload-telemetry.schema.json";
import planSchema from "../../../contracts/schemas/plan.schema.json";
import runPublishedSchema from "../../../contracts/schemas/run-published.schema.json";
import runRequestSchema from "../../../contracts/schemas/run-request.schema.json";
import runStartedSchema from "../../../contracts/schemas/run-started.schema.json";
import telemetrySchema from "../../../contracts/schemas/telemetry.schema.json";

// Ajv ships as CommonJS; under an ES module loader the constructor may arrive on the
// default export or as the namespace itself, depending on the bundler's interop.
const AjvConstructor = (
  Ajv2020 as unknown as { default?: typeof Ajv2020 }
).default ?? Ajv2020;

function compiler(): InstanceType<typeof AjvConstructor> {
  // The schemas describe messages from other components, not this client's own values,
  // so unknown keywords are tolerated while unknown *properties* are not: every schema
  // sets additionalProperties to false, which is what makes a typo a failure.
  return new AjvConstructor({ allErrors: false, strict: false });
}

const ajv = compiler();

// The schemas annotate locations with `format: uri` to say what they are for. The client
// does not police URL syntax — the transport will fail loudly on an address it cannot
// reach, which is a better report than a validator's — so the format is registered as
// accepting anything rather than left to produce a warning on every compile.
ajv.addFormat("uri", () => true);

/*
 * The telemetry master is a union that refers to the per-component telemetry masters by
 * identifier rather than restating them, which is the right way round: an ingest report is
 * one of the shapes a telemetry message can be. Registering them here is what lets those
 * references resolve, and registering rather than inlining a copy is Constitution III
 * applied to a schema as well as to a type.
 *
 * The list grows when a component starts publishing telemetry of its own. It is written
 * out rather than discovered so that a master added elsewhere and not registered here
 * fails the build loudly, which is the right failure: the alternative is a validator that
 * cannot compile at run time, in the browser, where nobody is watching.
 */
for (const referenced of [ingestTelemetrySchema, offloadTelemetrySchema]) {
  ajv.addSchema(referenced);
}

export const validateHeartbeat: ValidateFunction = ajv.compile(heartbeatSchema);
export const validateClockSample: ValidateFunction = ajv.compile(clockSchema);
export const validateClientConfig: ValidateFunction = ajv.compile(configSchema);
export const validateDivergence: ValidateFunction = ajv.compile(divergenceSchema);
export const validateRunRequest: ValidateFunction = ajv.compile(runRequestSchema);
export const validateRunStarted: ValidateFunction = ajv.compile(runStartedSchema);
export const validateRunPublished: ValidateFunction = ajv.compile(runPublishedSchema);
export const validatePlan: ValidateFunction = ajv.compile(planSchema);
export const validateTelemetry: ValidateFunction = ajv.compile(telemetrySchema);

/**
 * The name a schema gives itself, for the inspector to show beside an instance.
 *
 * Read off the imported master rather than written out here, so the name shown and the
 * document validated against are the same artefact. Writing the title as a string in this
 * file would be a second declaration of it, and a second declaration is what drifts.
 */
export function schemaTitle(schema: unknown): string {
  const document = schema as { title?: unknown; $id?: unknown };
  if (typeof document.title === "string") {
    return document.title;
  }
  return typeof document.$id === "string" ? document.$id : "an unnamed schema";
}

/** The masters this client validates control traffic against, by their own titles. */
export const CONTROL_SCHEMAS = {
  heartbeat: { schema: heartbeatSchema, validate: validateHeartbeat },
  clock: { schema: clockSchema, validate: validateClockSample },
  divergence: { schema: divergenceSchema, validate: validateDivergence },
  runRequest: { schema: runRequestSchema, validate: validateRunRequest },
  runStarted: { schema: runStartedSchema, validate: validateRunStarted },
  runPublished: { schema: runPublishedSchema, validate: validateRunPublished },
  plan: { schema: planSchema, validate: validatePlan },
  telemetry: { schema: telemetrySchema, validate: validateTelemetry },
} as const;

/** Why a message was refused, in one line a viewer can read. */
export function rejectionReason(validate: ValidateFunction): string {
  const first = validate.errors?.[0];
  if (first === undefined) {
    return "failed validation";
  }
  const where = first.instancePath === "" ? "the message" : first.instancePath;
  return `${where} ${first.message ?? "failed validation"}`;
}
