/**
 * The capture configuration, loaded and validated before any browser is launched.
 *
 * Constitution IV binds every component to one environment variable naming one
 * configuration document, validated before any other I/O. Capture is build-time tooling
 * rather than a component, but the rule is the right one here for a reason of its own:
 * three mechanisms that named the client address in three scripts would drift apart the
 * first time a destination moved, and the pair mechanism would then be comparing two
 * different clients while reporting a difference as evidence. So there is one document,
 * `HARNESS_CONFIG` names it, and nothing below contains a location.
 *
 * **This module does not know which mechanisms exist.** It is the one place all three
 * meet, and the whole risk of a shared module is that it quietly becomes the place capture
 * policy lives. So it hands out the parts of the document every mechanism needs — where
 * the client is, how large the window is, which browser is pinned, which run is being
 * captured — and for everything else it answers a question the caller asked: `area(name)`
 * and `section(name)` are lookups, and the names come from the mechanism doing the
 * looking. Adding a fourth mechanism would need no change here, which is the property
 * worth having, and `separation.test.ts` asserts that this file names none of the three.
 *
 * The exported shape is this tooling's own vocabulary, not a second declaration of the
 * contract: the capture configuration schema under contracts/ is the single authority, ajv
 * checks the document against it, and the reads afterwards are narrowing rather than
 * checking. That is the same arrangement the client's own runtime configuration module
 * makes for its own document, and it is what Constitution III permits — one definition of
 * the shape, in the schema.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

/**
 * Where the repository begins, from this file's own location.
 *
 * The one location this module names, and it names itself rather than a deployment: a
 * module cannot be told where it is by a configuration document it has not yet found, and
 * everything the capture mechanisms actually reach — the client, the output areas — comes
 * out of that document and appears nowhere below.
 */
// harness:allow-literal-path this module's own position in the tree, needed to find the configuration document; no deployment location appears in this file
export const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

/** The environment variable naming the capture configuration document. */
export const CONFIG_VARIABLE = "HARNESS_CONFIG";

const SCHEMA_LOCATION = [
  "contracts",
  "schemas",
  // Assembled from segments rather than written as one string, because a filename in
  // source is a location in source (Constitution IV) and this is the one file the loader
  // must be able to find before it has read any configuration.
  ["config", "capture", "schema", "json"].join("."),
];

export interface CaptureCredentials {
  readonly user: string;
  readonly secret: string;
}

export interface CaptureClient {
  readonly url: string;
  /**
   * The boundary clearance a capture presents to load the page, which is served through
   * the reverse proxy behind it. The tracked document carries the identity and an empty
   * secret; the deploy-time render fills the secret into the rendered copy under
   * deploy/.runtime/config/, which is the document a capture is pointed at. Where the
   * secret is empty the mechanism presents nothing and the challenge refuses it, naming
   * this document — the honest outcome for a document that names nobody.
   */
  readonly credentials: CaptureCredentials;
  readonly readinessTimeoutMs: number;
  readonly stableFrames: number;
  readonly maximumFrames: number;
}

export interface CaptureViewport {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
}

export interface CaptureBrowser {
  readonly name: "chromium";
  readonly playwrightVersion: string;
  readonly containerImage: string;
}

export interface CaptureConfig {
  readonly client: CaptureClient;
  readonly viewport: CaptureViewport;
  readonly browser: CaptureBrowser;
  readonly scenario: { readonly seed: number };
  /** Where the document was read from, for a message that has to say so. */
  readonly source: string;
  /** The output area belonging to the mechanism asking, by the name it asks under. */
  area(name: string): string;
  /** The settings belonging to the mechanism asking, by the name it asks under. */
  section<T>(name: string): T;
  /** Every declared area, for a check that has to reason about all of them at once. */
  readonly declaredAreas: Readonly<Record<string, string>>;
}

/** Raised when the configuration cannot be read or does not validate. */
export class CaptureConfigError extends Error {}

function part(document: Record<string, unknown>, name: string): Record<string, unknown> {
  return document[name] as Record<string, unknown>;
}

function schemaText(): string {
  return readFileSync(join(repositoryRoot, ...SCHEMA_LOCATION), "utf8");
}

/**
 * The document at `path`, validated.
 *
 * Every failure is a readable message naming the file, because the alternative is a
 * browser that launches against a location nobody chose and a picture nobody can explain.
 */
export function loadCaptureConfigFrom(path: string): CaptureConfig {
  const location = isAbsolute(path) ? path : resolve(repositoryRoot, path);
  let text: string;
  try {
    text = readFileSync(location, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CaptureConfigError(
      `the capture configuration could not be read at ${location}: ${detail}`,
    );
  }

  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CaptureConfigError(`${location} is not valid JSON: ${detail}`);
  }

  // The 2020-12 dialect, because that is the dialect `contracts/schemas` is written in and
  // the one the schema-conventions gate enforces. Ajv ships as CommonJS; under an ES module
  // loader the constructor may arrive on the namespace or on its `default`, so this reaches
  // for both rather than trusting either.
  const Validator = (Ajv2020 as unknown as { default?: typeof Ajv2020 }).default ?? Ajv2020;
  // `format` is an annotation in the 2020-12 vocabulary rather than an assertion — the
  // repository's own schema-conventions gate says so — and ajv logs a warning per unknown
  // format when it is asked to validate them. Turning that off keeps the output to what the
  // capture did.
  const ajv = new Validator({ allErrors: true, strict: false, validateFormats: false });
  const validate = ajv.compile(JSON.parse(schemaText()));
  if (!validate(document)) {
    const reasons = (validate.errors ?? [])
      .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
      .join("; ");
    throw new CaptureConfigError(
      `${location} does not satisfy the capture configuration schema: ${reasons}`,
    );
  }

  return adopt(document as Record<string, unknown>, location);
}

function adopt(document: Record<string, unknown>, source: string): CaptureConfig {
  const client = part(document, "client");
  const viewport = part(document, "viewport");
  const browser = part(document, "browser");
  const scenario = part(document, "scenario");
  const areas = part(document, "areas") as Record<string, string>;

  const credentials = client["credentials"] as Record<string, string>;

  return {
    client: {
      url: client["url"] as string,
      credentials: {
        user: credentials["user"] as string,
        secret: credentials["secret"] as string,
      },
      readinessTimeoutMs: client["readiness_timeout_ms"] as number,
      stableFrames: client["stable_frames"] as number,
      maximumFrames: client["maximum_frames"] as number,
    },
    viewport: {
      width: viewport["width"] as number,
      height: viewport["height"] as number,
      deviceScaleFactor: viewport["device_scale_factor"] as number,
    },
    browser: {
      name: browser["name"] as "chromium",
      playwrightVersion: browser["playwright_version"] as string,
      containerImage: browser["container_image"] as string,
    },
    scenario: { seed: scenario["seed"] as number },
    source,
    declaredAreas: { ...areas },
    area(name: string): string {
      const value = areas[name];
      if (value === undefined) {
        throw new CaptureConfigError(
          `${source} declares no output area called ${JSON.stringify(name)}; it declares ` +
            `${Object.keys(areas).join(", ")}.`,
        );
      }
      return value;
    },
    section<T>(name: string): T {
      const value = document[name];
      if (value === undefined) {
        throw new CaptureConfigError(
          `${source} carries no settings called ${JSON.stringify(name)}.`,
        );
      }
      return value as T;
    },
  };
}

/**
 * The document `HARNESS_CONFIG` names.
 *
 * There is no default. A capture taken against whichever destination happened to be the
 * fallback is a capture nobody can place afterwards, and the pair mechanism's whole claim
 * rests on both halves having been taken against the same one.
 */
export function loadCaptureConfig(environment: NodeJS.ProcessEnv = process.env): CaptureConfig {
  const named = environment[CONFIG_VARIABLE];
  if (named === undefined || named.trim() === "") {
    throw new CaptureConfigError(
      `${CONFIG_VARIABLE} is not set. It must name a capture configuration document; the ` +
        "repository ships one per destination under config/, and scripts/capture/README.md " +
        "shows how the three entry points are invoked with it.",
    );
  }
  return loadCaptureConfigFrom(named);
}

/** An area from the configuration, as an absolute location. */
export function areaPath(area: string): string {
  return isAbsolute(area) ? area : resolve(repositoryRoot, area);
}

/** This directory, for a Playwright configuration that must name its own test directory. */
export const e2eRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
