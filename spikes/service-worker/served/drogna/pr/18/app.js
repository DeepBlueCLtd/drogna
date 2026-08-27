/*
 * Spike code. What the client does, reduced to the parts this spike is about.
 *
 * The real client fetches its bootstrap document by one relative URL, validates it, and
 * only then opens anything (FR-019). This page keeps that order and adds the one step a
 * backend-less preview needs: it waits for the worker to be *controlling* before it makes
 * the calls that the worker answers.
 *
 * Everything it learns is written to `window.drognaProbe` in one go at the end, so a test
 * waits on a condition rather than on a timer.
 */
const BASE = location.pathname.replace(/[^/]*$/, "");
const REGISTER = document.body.dataset.register === "true";

/** Whether a response came from the worker. Null means it did not, or there was none. */
function servedBy(response) {
  return response.headers.get("x-served-by");
}

async function probe(path, init) {
  try {
    const response = await fetch(BASE + path, init);
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, servedBy: servedBy(response), body };
  } catch (error) {
    return { status: null, servedBy: null, error: String(error) };
  }
}

/**
 * Wait until the worker is controlling this page, not merely active.
 *
 * `navigator.serviceWorker.ready` resolves on an *active* registration, which can happen
 * a beat before `clients.claim()` has taken this already-loaded page over. Awaiting only
 * `ready` therefore races on the very first visit — the visit a preview link always is.
 * The controller, or the `controllerchange` that installs one, is the real signal.
 */
async function controlling(registration) {
  await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller !== null) {
    return "already-controlling";
  }
  await new Promise((resolve) => {
    navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
  });
  return "claimed";
}

async function main() {
  const record = {
    base: BASE,
    supported: "serviceWorker" in navigator,
    controlledAtLoad: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
  };

  // Before anything is registered: does the worker answer? On a first visit it must not.
  record.beforeRegistration = await probe("query/collections");

  if (!REGISTER) {
    window.drognaProbe = record;
    return;
  }

  if (!record.supported) {
    record.workerState = "unsupported";
    window.drognaProbe = record;
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("sw.js");
    record.scope = new URL(registration.scope).pathname;
    record.howControlled = await controlling(registration);
    record.workerState = "controlling";
  } catch (error) {
    // The page says it has no query layer. It does not pretend to have one.
    record.workerState = "unavailable";
    record.reason = String(error);
    window.drognaProbe = record;
    return;
  }

  // The bootstrap document. A static file on the origin, deliberately not the worker's.
  record.bootstrap = await probe("config.json");

  record.afterControlling = await probe("query/collections");
  record.collection = await probe("query/collections/drogna-forecast");
  record.unknownCollection = await probe("query/collections/drogna-nonesuch");
  record.trajectory = await probe(
    "query/collections/drogna-forecast/trajectory?coords=" +
      encodeURIComponent("LINESTRING ZM(-3.5 50.0 10 1787788800, -3.0 50.2 10 1787792400)"),
  );
  record.outsideExtent = await probe(
    "query/collections/drogna-forecast/trajectory?coords=" +
      encodeURIComponent("LINESTRING ZM(20.0 50.0 10 1787788800)"),
  );
  record.badCoords = await probe("query/collections/drogna-forecast/trajectory?coords=POINT(1 2)");
  record.clock = await probe("clock/snapshot");
  record.rate = await probe("clock/rate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rate: 10 }),
  });

  window.drognaProbe = record;
}

main();
