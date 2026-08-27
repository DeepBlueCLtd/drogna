/**
 * The order the page comes up in, and what happens when the configuration is not there.
 *
 * FR-019: the shell and the honesty statement render before, and independently of, any
 * successful network call. FR-018: no transport opens against a document that has not
 * validated. The second is the one worth testing hardest, because a client that
 * connected first and validated afterwards would look identical on a good day.
 */
import { describe, expect, it, vi } from "vitest";

import { startTransport } from "../src/bootstrap";
import { loadRuntimeConfig, readRuntimeConfig } from "../src/config/runtime";
import type { ControlSink } from "../src/transport/mqtt";

const VALID = {
  broker: { url: "ws://broker.invalid/ctl", client_id: "client_test" },
  clock: { stale_after_seconds: 10 },
  // Where the client reads the fields and the conditions along a route. Required, because
  // a page that cannot reach the query layer cannot draw either.
  query: { endpoint: "http://query.invalid", collections_path: "/released" },
  liveness: { default_window_seconds: 15 },
  display: { frame_interval_ms: 100 },
};

const sink: ControlSink = { message: () => undefined, connection: () => undefined };

function responding(body: unknown, ok = true, status = 200) {
  return () => Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

describe("reading the configuration document", () => {
  it("accepts a document of the declared shape", () => {
    const outcome = readRuntimeConfig(VALID);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.config.broker.clientId).toBe("client_test");
      expect(outcome.config.liveness.defaultWindowSeconds).toBe(15);
      // Applied where the sender declares an interval but no window.
      expect(outcome.config.liveness.windowMultiplier).toBe(3);
    }
  });

  it("refuses a document with an unknown key rather than ignoring it", () => {
    expect(readRuntimeConfig({ ...VALID, demo: true }).ok).toBe(false);
  });

  it("refuses a document missing a required section", () => {
    expect(readRuntimeConfig({ broker: VALID.broker }).ok).toBe(false);
  });

  it("composes the clock snapshot location from the document, never from source", () => {
    const outcome = readRuntimeConfig({
      ...VALID,
      clock: { stale_after_seconds: 10, endpoint: "http://clock.invalid", routes: { snapshot: "/clock/snapshot" } },
    });
    expect(outcome.ok && outcome.config.clock.snapshotUrl).toBe("http://clock.invalid/clock/snapshot");
  });
});

describe("fetching the configuration document", () => {
  it("reports a document that cannot be reached", async () => {
    const outcome = await loadRuntimeConfig(() => Promise.reject(new Error("network down")));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("network down");
    }
  });

  it("reports a document that is served as an error", async () => {
    const outcome = await loadRuntimeConfig(responding(null, false, 404));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toContain("404");
    }
  });

  it("validates what it fetched before anything else uses it", async () => {
    const outcome = await loadRuntimeConfig(responding({ broker: {} }));
    expect(outcome.ok).toBe(false);
  });
});

describe("the document served for local development", () => {
  it("validates against the schema the client checks it with", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const served = await readFile(
      fileURLToPath(new URL("../public/config.json", import.meta.url)),
      "utf8",
    );
    // The deployment serves its own document in place of this one; this is the local
    // destination's copy, and it is held to the same contract so that a mistake in it
    // fails here rather than in a browser.
    expect(readRuntimeConfig(JSON.parse(served)).ok).toBe(true);
  });

  /*
   * Whether the broker URL in that document points at the proxy rather than at the
   * client's own server is asserted in `tests/unit/test_client_reaches_the_proxy.py`, not
   * here. Answering it needs the destination's port map and the proxy's path policy, and
   * `tests/unit/test_profile_not_liveness.py` forbids anything under `client/` from
   * reading a deployment artefact at all — a rule worth keeping blunt, since the reason
   * for it is that a display must never learn what exists from a deployment file.
   */

  it("names the buffer bounds and the clock control route this client needs", async () => {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const served = await readFile(
      fileURLToPath(new URL("../public/config.json", import.meta.url)),
      "utf8",
    );
    const outcome = readRuntimeConfig(JSON.parse(served));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.config.display.bufferDepth).toBeGreaterThan(0);
    expect(outcome.config.display.coalescingThreshold).toBeGreaterThan(0);
    expect(outcome.config.display.maximumDrawnCells).toBeGreaterThan(0);
    expect(outcome.config.clock.controlUrl).toBeDefined();
  });
});

describe("starting the transport", () => {
  it("does not open a connection when the document cannot be reached", async () => {
    const open = vi.fn();
    const started = await startTransport(
      () => loadRuntimeConfig(() => Promise.reject(new Error("network down"))),
      open,
      sink,
    );
    expect(started.started).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("does not open a connection when the document fails validation", async () => {
    const open = vi.fn();
    const started = await startTransport(() => loadRuntimeConfig(responding({})), open, sink);
    expect(started.started).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("opens exactly one connection when the document validates", async () => {
    const open = vi.fn(() => ({ close: () => undefined }));
    const started = await startTransport(() => loadRuntimeConfig(responding(VALID)), open, sink);
    expect(started.started).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
