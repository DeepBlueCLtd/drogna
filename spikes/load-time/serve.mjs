/**
 * A static server that gzips, because the thing being measured is a first load and
 * GitHub Pages gzips. `vite preview` and the usual one-liners serve the 1.9 MB bundle
 * uncompressed, which makes every network-throttled reading roughly four times too
 * slow and points the finger at the wrong half of the problem.
 *
 *   node spikes/load-time/serve.mjs app/dist 4174
 *
 * Nothing is cached across restarts: the response bodies are held in memory per file,
 * so a rebuilt bundle needs a restarted server (the index.html it hands out otherwise
 * names the previous chunk hash, and the measurement silently reads the old build).
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.argv[2] ?? 'app/dist';
const port = Number(process.argv[3] ?? 4174);

const TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

const bodies = new Map();

createServer((request, response) => {
  let path = decodeURIComponent(request.url.split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(root, path);
  if (!existsSync(file)) {
    response.writeHead(404);
    return response.end('not here');
  }
  let body = bodies.get(file);
  if (!body) {
    body = gzipSync(readFileSync(file));
    bodies.set(file, body);
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'content-encoding': 'gzip',
    'content-length': body.length,
    // What GitHub Pages sends, and not configurable there.
    'cache-control': 'max-age=600',
  });
  response.end(body);
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
