/*
 * The query layer and the clock, answered inside the browser.
 *
 * This is spike code. It is written as the worker a per-pull-request preview would ship
 * at `<base>/sw.js`, and `run.sh` copies it into the served tree for the length of one
 * run. Nothing imports it in the committed tree.
 *
 * What it is for: the client reaches a backend at exactly three `fetch` call sites, and
 * one of them is the bootstrap document. This worker stands behind the other two — the
 * query layer and the clock's HTTP interface — so that a page with no backend still
 * issues a genuine GET, gets a genuine status code, and can be read in the network panel
 * by somebody who does not believe it. An in-page handler would answer the same values
 * and show nothing, which is the difference between demonstrating a standard and
 * asserting one.
 *
 * What it deliberately does not do: serve the bootstrap document. That is a static file
 * on the origin, and the finding explains why the race makes it have to be.
 *
 * Scope is the directory the worker is served from, which is what makes one preview per
 * pull request possible: `/drogna/pr/17/sw.js` cannot see `/drogna/pr/18/`, and neither
 * can see the site root. That is a rule of the platform rather than a convention here.
 */

/** Everything below the directory this worker was served from. */
const BASE = self.location.pathname.replace(/sw\.js$/, "");

/** The collections this preview carries. A published slice has a fixed extent (F7). */
const COLLECTIONS = {
  "drogna-forecast": {
    id: "drogna-forecast",
    title: "Forecast — synthetic, fake numerics",
    extent: {
      spatial: { bbox: [[-4.0, 49.0, -2.0, 51.0]] },
      temporal: { interval: [["2026-08-26T00:00:00Z", "2026-08-26T12:00:00Z"]] },
    },
    parameter_names: ["sea_water_temperature", "sea_water_practical_salinity"],
  },
  "drogna-uncertainty": {
    id: "drogna-uncertainty",
    title: "Uncertainty — synthetic, fake numerics",
    extent: {
      spatial: { bbox: [[-4.0, 49.0, -2.0, 51.0]] },
      temporal: { interval: [["2026-08-26T00:00:00Z", "2026-08-26T12:00:00Z"]] },
    },
    parameter_names: ["sea_water_temperature_uncertainty"],
  },
};

const BBOX = COLLECTIONS["drogna-forecast"].extent.spatial.bbox[0];

/**
 * A response the page can tell apart from the server's.
 *
 * The header is the spike's instrument, not a proposal: a shipped worker would not need
 * to announce itself, because the network panel already says `(ServiceWorker)`. The proof
 * reads it because a test cannot read the network panel.
 */
function served(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "content-type": "application/json",
      "x-served-by": "worker",
      // A preview is one origin serving itself. Nothing here is cacheable across runs.
      "cache-control": "no-store",
    },
  });
}

/** An error shaped like the query layer's, because a wrong answer is worse than none. */
function refused(status, detail) {
  return served({ code: status === 404 ? "NotFound" : "InvalidParameterValue", description: detail }, status);
}

/** Every vertex of a WKT LINESTRING ZM, or null when it is not one. */
function verticesOf(coords) {
  const match = /^\s*LINESTRING\s*ZM\s*\((.+)\)\s*$/i.exec(coords || "");
  if (match === null) {
    return null;
  }
  const vertices = [];
  for (const part of match[1].split(",")) {
    const ordinates = part.trim().split(/\s+/).map(Number);
    if (ordinates.length !== 4 || ordinates.some(Number.isNaN)) {
      return null;
    }
    vertices.push({ x: ordinates[0], y: ordinates[1], z: ordinates[2], m: ordinates[3] });
  }
  return vertices;
}

function withinExtent(vertex) {
  return vertex.x >= BBOX[0] && vertex.y >= BBOX[1] && vertex.x <= BBOX[2] && vertex.y <= BBOX[3];
}

/**
 * CoverageJSON for a trajectory, sampled at each vertex's own time.
 *
 * The numerics are a deliberate stand-in and say so in the domain's own description. What
 * this proves is the shape and the transport, never the physics.
 */
function coverage(collection, vertices) {
  const values = vertices.map((vertex) => 10 + Math.sin(vertex.x) + vertex.z / 1000);
  return {
    type: "Coverage",
    domain: {
      type: "Domain",
      domainType: "Trajectory",
      axes: {
        composite: {
          dataType: "tuple",
          coordinates: ["x", "y", "z", "t"],
          values: vertices.map((v) => [v.x, v.y, v.z, new Date(v.m * 1000).toISOString()]),
        },
      },
    },
    parameters: {
      [collection.parameter_names[0]]: {
        type: "Parameter",
        unit: { symbol: "degC" },
        observedProperty: { label: { en: collection.parameter_names[0] } },
      },
    },
    ranges: {
      [collection.parameter_names[0]]: {
        type: "NdArray",
        dataType: "float",
        axisNames: ["composite"],
        shape: [values.length],
        values,
      },
    },
    "drogna:provenance": "synthetic; fake numerics; computed in the browser",
  };
}

function answer(url, request) {
  const path = url.pathname.slice(BASE.length);

  if (path === "query/collections") {
    return served({ collections: Object.values(COLLECTIONS) });
  }

  const collectionMatch = /^query\/collections\/([^/]+)(?:\/(trajectory))?$/.exec(path);
  if (collectionMatch !== null) {
    const collection = COLLECTIONS[collectionMatch[1]];
    if (collection === undefined) {
      return refused(404, `no collection named ${collectionMatch[1]} in this preview`);
    }
    if (collectionMatch[2] === undefined) {
      return served(collection);
    }
    const vertices = verticesOf(url.searchParams.get("coords"));
    if (vertices === null) {
      return refused(400, "coords must be a WKT LINESTRING ZM with four ordinates a vertex");
    }
    const outside = vertices.filter((vertex) => !withinExtent(vertex));
    if (outside.length > 0) {
      // F7: a published slice has a fixed extent, and a query outside it gets an error
      // rather than a plausible-looking answer.
      return refused(400, `${outside.length} vertex/vertices outside this preview's extent`);
    }
    return served(coverage(collection, vertices));
  }

  if (path === "clock/snapshot") {
    return served({
      run_id: "run-0001",
      tick: 0,
      sim_time: "2026-08-26T00:00:00.000000Z",
      mode: "paused",
      rate: 0,
    });
  }

  if (path === "clock/rate" && request.method === "POST") {
    // The clock decides. A preview's clock is pinned, so it answers with what is in force
    // rather than with what was asked for, which is the behaviour FR-49 describes.
    return served({ requested: null, in_force: 0, reason: "this preview runs at a pinned rate" });
  }

  return null;
}

self.addEventListener("install", (event) => {
  // No cache to warm: everything is computed. Taking over immediately is the whole point.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) {
    return; // not ours; the network answers
  }
  const response = answer(url, event.request);
  if (response !== null) {
    event.respondWith(response);
  }
});
