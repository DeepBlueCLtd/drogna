/*
 * Spike code. A static server for the served tree, and nothing else.
 *
 * A service worker needs a secure context, and `http://127.0.0.1` is one by definition,
 * so no certificate is involved in proving any of this. What it cannot prove is GitHub
 * Pages itself; the finding says so plainly and says which parts are platform rules that
 * hold identically either way.
 *
 * It binds port zero and prints the port it got, so two runs never collide.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../served", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const relative = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  const target = relative.endsWith("/") ? join(relative, "index.html") : relative;
  try {
    const body = await readFile(join(root, target));
    response.writeHead(200, {
      "content-type": TYPES[extname(target)] ?? "application/octet-stream",
      // Never let the browser hold a worker between runs of this spike.
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: "NotFound", description: `no file at ${target}` }));
  }
});

server.listen(0, "127.0.0.1", () => {
  process.stdout.write(`${server.address().port}\n`);
});
