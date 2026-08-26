/**
 * Build and test configuration for C-18.
 *
 * The two contract schemas live outside this package, in the repository's neutral
 * masters, and are imported rather than copied: Constitution III admits one definition
 * of a shape that crosses a language boundary, and a copy under `client/` would be a
 * second. The directory above is therefore readable by the dev server, and every path
 * here is assembled from segments rather than written as a literal (Constitution IV).
 */
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  root: packageRoot,
  plugins: [react()],
  server: {
    fs: {
      // The contracts directory sits above this package; the dev server must be able to
      // read it in order to serve the schemas the client validates against.
      allow: [repositoryRoot],
    },
  },
  build: {
    // A capture compares two images. Deterministic asset names keep the difference to
    // the thing under evidence.
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: [["tests", "**", "*.test.ts?(x)"].join("/")],
  },
});
