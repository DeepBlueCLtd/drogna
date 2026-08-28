/**
 * The configuration is loaded and validated before any browser is launched (FR-020).
 *
 * Every capture mechanism's first act is to read this document, and every failure of it
 * must be a sentence naming the file, because the alternative is a browser launched at a
 * location nobody chose and a picture nobody can place afterwards. The failure messages
 * are therefore the subject of this test rather than an afterthought to it.
 *
 * The shipped documents are loaded too. A schema nothing validates against is a schema
 * that drifts, and a destination whose capture configuration stopped validating would
 * otherwise be discovered by somebody trying to take a screenshot.
 */
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CONFIG_VARIABLE,
  CaptureConfigError,
  loadCaptureConfig,
  loadCaptureConfigFrom,
} from "../shared/config";

const configFile = ["capture", "json"].join(".");
const destinations = ["local", "droplet"];

/**
 * The environment a test loads the shipped documents under. The page sits behind the
 * proxy's clearance (issue #34 link 6), so the documents declare a credential and the
 * loader refuses to run without the named variable — these tests are about the documents,
 * not the deployment, so they supply a stand-in the way every credential test here does.
 */
const WITH_SECRET = { HARNESS_PROXY_SECRET: "secret-for-the-capture" };

describe("the shipped capture configurations", () => {
  for (const destination of destinations) {
    it(`${destination} validates and carries a client address`, () => {
      const capture = loadCaptureConfigFrom(join("config", destination, configFile), WITH_SECRET);
      expect(capture.client.url).toMatch(/^https?:\/\//);
      expect(capture.viewport.width).toBeGreaterThan(0);
      expect(capture.viewport.deviceScaleFactor).toBeGreaterThan(0);
      expect(capture.browser.name).toBe("chromium");
      expect(capture.scenario.seed).toEqual(expect.any(Number));
    });
  }

  it("agree on the viewport, so a curated image is the same size at either destination", () => {
    const [first, ...rest] = destinations.map((destination) =>
      loadCaptureConfigFrom(join("config", destination, configFile), WITH_SECRET),
    );
    for (const other of rest) {
      expect(other.viewport).toEqual(first!.viewport);
    }
  });

  it("resolve the page's clearance from the variable the document names", () => {
    const capture = loadCaptureConfigFrom(join("config", "local", configFile), WITH_SECRET);
    expect(capture.client.httpCredentials).toEqual({
      username: "drogna_reader",
      password: WITH_SECRET.HARNESS_PROXY_SECRET,
    });
  });

  it("refuse to load a credentialled document when the named variable is unset", () => {
    // The failure this shape exists to prevent: a browser launched without the credential
    // reports readiness never arriving, three layers away from the cause. The refusal
    // happens at load, and it names the variable.
    expect(() => loadCaptureConfigFrom(join("config", "local", configFile), {})).toThrow(
      /HARNESS_PROXY_SECRET/,
    );
  });
});

describe("a configuration that cannot be used", () => {
  it("says so when the environment variable is not set, and names it", () => {
    expect(() => loadCaptureConfig({})).toThrow(CaptureConfigError);
    expect(() => loadCaptureConfig({})).toThrow(new RegExp(CONFIG_VARIABLE));
  });

  it("says so when the file is not there, and names the location it looked at", () => {
    const missing = join("config", "nowhere", configFile);
    expect(() => loadCaptureConfigFrom(missing)).toThrow(/could not be read at .*nowhere/);
  });

  it("says so when the document is not JSON, and names the file", () => {
    expect(() => loadCaptureConfigFrom(["README", "md"].join("."))).toThrow(
      /is not valid JSON/,
    );
  });

  it("names the failing field when the document does not satisfy the schema", () => {
    // The repository's own client configuration is a valid JSON document of the wrong
    // shape, which is the case worth checking: a document that parses and is wrong is the
    // one a person will actually produce.
    expect(() => loadCaptureConfigFrom(join("client", "public", ["config", "json"].join(".")))).toThrow(
      /must have required property/,
    );
  });
});

describe("looking up a mechanism's own settings", () => {
  const capture = loadCaptureConfigFrom(join("config", "local", configFile), WITH_SECRET);

  it("answers the name the caller asked under", () => {
    expect(capture.area("glance")).toBeTypeOf("string");
    expect(capture.section<{ retention_days: number }>("pair").retention_days).toBeGreaterThan(0);
  });

  it("says what is declared when asked for an area that is not", () => {
    expect(() => capture.area("nonesuch")).toThrow(/declares no output area/);
    expect(() => capture.area("nonesuch")).toThrow(/glance/);
  });
});
