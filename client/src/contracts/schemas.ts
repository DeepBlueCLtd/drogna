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
import heartbeatSchema from "../../../contracts/schemas/heartbeat.schema.json";

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

export const validateHeartbeat: ValidateFunction = ajv.compile(heartbeatSchema);
export const validateClockSample: ValidateFunction = ajv.compile(clockSchema);
export const validateClientConfig: ValidateFunction = ajv.compile(configSchema);

/** Why a message was refused, in one line a viewer can read. */
export function rejectionReason(validate: ValidateFunction): string {
  const first = validate.errors?.[0];
  if (first === undefined) {
    return "failed validation";
  }
  const where = first.instancePath === "" ? "the message" : first.instancePath;
  return `${where} ${first.message ?? "failed validation"}`;
}
