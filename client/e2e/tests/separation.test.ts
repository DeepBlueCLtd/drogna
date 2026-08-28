/**
 * The three mechanisms stay three mechanisms.
 *
 * PR-10 asks for three capture mechanisms that do not share plumbing, and separations that
 * are only intended do not survive. The instinct on seeing three similar scripts is to
 * merge them behind one command with flags, and the argument against is written down in
 * `scripts/capture/README.md` for the person contemplating it — but an argument in a
 * document is not a constraint. This is the constraint.
 *
 * Four assertions, and a control for the first.
 *
 * 1. **No entry point imports another.** The one module all three may share is
 *    `client/e2e/shared/`, which holds selectors, page objects, the readiness signal and
 *    the configuration loader: knowledge of the client rather than capture policy.
 * 2. **No code in `shared/` names a glance, a pair or a curated shot.** The narrow sharing
 *    point stays narrow by being unable to name the things sharing it: a lookup by a name
 *    the caller supplies cannot grow a branch per mechanism, and a branch per mechanism is
 *    what capture policy looks like when it leaks. Prose is exempt and deliberately so —
 *    the argument for the separation has to be written somewhere a reader will find it,
 *    and beside the shared module is one of the right places.
 * 3. **The output areas are disjoint.** Three lifetimes need three places; two mechanisms
 *    writing into one area would have one retention rule between them.
 * 4. **Only the curated area is tracked by git.** A glance or a pair in the repository is
 *    a throwaway image in the PR-01 review queue for ever.
 *
 * The control matters more than any of them. A separation test run over a tree where
 * nothing has ever crossed is indistinguishable from a separation test that reads no
 * imports at all, so the same import check is run over
 * `tests/fixtures/merged-tree/`, in which the glance imports the pair's clock pinning, and
 * is asserted to reject it and to name the import (SC-010).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadCaptureConfigFrom } from "../shared/config";
import { codeLines } from "./support/code";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const captureScripts = join(repositoryRoot, "scripts", "capture");
const e2e = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mergedTree = join(e2e, "tests", "fixtures", "merged-tree");

const MECHANISMS = ["glance", "pair", "curate"] as const;
type Mechanism = (typeof MECHANISMS)[number];

/** Every source file under a directory, recursively. */
function sources(directory: string, skip: readonly string[] = []): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (skip.includes(path)) {
      continue;
    }
    if (statSync(path).isDirectory()) {
      found.push(...sources(path, skip));
    } else if (/\.(mjs|ts|tsx)$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

const IMPORT = /(?:^|\n)\s*(?:import\b[^;\n]*?from\s*|import\s*|export\b[^;\n]*?from\s*)["']([^"']+)["']/g;

/** Every module specifier a file imports. Deliberately syntactic: an absence is checked by looking. */
function specifiers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(IMPORT)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      found.push(specifier);
    }
  }
  return found;
}

/**
 * Which mechanism a path belongs to, by the directory or file name it sits under.
 *
 * The physical separation is what makes this answerable at all. A single directory with a
 * mode flag would have no answer to give, which is the argument in `README.md` restated as
 * a property of the tree.
 */
function owner(path: string, root: string): Mechanism | null {
  const parts = relative(root, path).split("/");
  for (const mechanism of MECHANISMS) {
    if (parts.some((part) => part === mechanism || part.startsWith(`${mechanism}.`))) {
      return mechanism;
    }
  }
  return null;
}

/** One message per import that crosses from one mechanism into another. */
function crossImports(root: string, skip: readonly string[] = []): string[] {
  const found: string[] = [];
  for (const path of sources(root, skip)) {
    const from = owner(path, root);
    if (from === null) {
      continue;
    }
    for (const specifier of specifiers(readFileSync(path, "utf8"))) {
      if (!specifier.startsWith(".")) {
        continue; // a package, not a sibling mechanism
      }
      const target = resolve(path, "..", specifier);
      const to = owner(target, root);
      if (to !== null && to !== from) {
        found.push(`${relative(root, path)} imports ${specifier}: ${from} reaches into ${to}`);
      }
    }
  }
  return found;
}

const capture = loadCaptureConfigFrom(join("config", "local", ["capture", "json"].join(".")), {
  // The page sits behind the proxy's clearance; these tests are about mechanism
  // separation, so the credential the loader insists on is a stand-in.
  HARNESS_PROXY_SECRET: "secret-for-the-capture",
});

describe("the control: a tree in which the mechanisms have been merged", () => {
  it("is rejected, and the offending import is named", () => {
    const found = crossImports(mergedTree);
    expect(
      found,
      "the separation test read a tree in which the glance imports the pair's clock " +
        "pinning and reported nothing. It is therefore not reading imports, and every " +
        "clean run it has ever produced over the real tree means nothing.",
    ).toHaveLength(1);
    expect(found[0]).toContain("glance/run.mjs");
    expect(found[0]).toContain("../pair/pin.mjs");
    expect(found[0]).toContain("glance reaches into pair");
  });
});

describe("the three entry points", () => {
  it("do not import one another, under scripts/capture/", () => {
    expect(crossImports(captureScripts)).toEqual([]);
  });

  it("do not import one another, under client/e2e/", () => {
    expect(crossImports(e2e, [mergedTree])).toEqual([]);
  });

  it("are three separate files, not one file with a mode flag", () => {
    for (const mechanism of MECHANISMS) {
      expect(sources(join(captureScripts, mechanism)).length).toBeGreaterThan(0);
      expect(readdirSync(e2e)).toContain(`${mechanism}.config.ts`);
      expect(readdirSync(join(e2e, "specs"))).toContain(`${mechanism}.spec.ts`);
    }
  });
});

describe("the shared library", () => {
  it("has no code that names a glance, a pair or a curated shot", () => {
    const policy = /\bglance\b|\bcurated?\b|\bpair\b/i;
    for (const path of sources(join(e2e, "shared"))) {
      const offending = codeLines(readFileSync(path, "utf8"))
        .map((line, index) => [index + 1, line] as const)
        .filter(([, line]) => policy.test(line));
      expect(
        offending,
        `${relative(e2e, path)} has code that names a capture mechanism. shared/ holds ` +
          "knowledge of the client — selectors, page objects, the readiness signal, the " +
          "configuration — and nothing that knows which mechanism is asking. Capture " +
          "policy that leaks in here is shared plumbing arriving through the one door " +
          "PR-10 leaves open. (Prose is exempt; this reads code.)",
      ).toEqual([]);
    }
  });
});

describe("the output areas", () => {
  it("are disjoint", () => {
    const areas = Object.entries(capture.declaredAreas);
    for (const [nameA, valueA] of areas) {
      for (const [nameB, valueB] of areas) {
        if (nameA === nameB) {
          continue;
        }
        const a = `${valueA.replace(/\/+$/, "")}/`;
        const b = `${valueB.replace(/\/+$/, "")}/`;
        expect(
          a.startsWith(b),
          `${nameA} (${valueA}) is inside ${nameB} (${valueB}). Two mechanisms sharing an ` +
            "area share a retention rule, and their retention rules are three of the " +
            "things that must differ.",
        ).toBe(false);
      }
    }
  });

  it("leave only the curated area tracked by git", () => {
    const tracked = (area: string): string[] => {
      const listed = execFileSync("git", ["ls-files", "--", area], {
        cwd: repositoryRoot,
        encoding: "utf8",
      });
      return listed.split("\n").filter((line) => line !== "");
    };
    expect(
      tracked(capture.area("glance")),
      "a glance is disposable and unreviewed; one in the repository is a throwaway image " +
        "in the PR-01 review queue for ever (FR-004, SC-008).",
    ).toEqual([]);
    expect(
      tracked(capture.area("pair")),
      "a pair's life is the life of the branch (FR-012, SC-008).",
    ).toEqual([]);
    expect(tracked(capture.area("curated_review")), "the review area holds candidates").toEqual([]);
    expect(
      tracked(capture.area("published")).filter((path) => path.endsWith(".png")).length,
      "the published-screenshot location is the only capture output tracked by git, and " +
        "it should hold something (FR-014).",
    ).toBeGreaterThan(0);
  });
});
