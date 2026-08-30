/**
 * Gate: the Intro drawing accounts for every component that runs (SRD-v2 FR-77).
 *
 * The Intro tab draws a **subset** — thirteen of the twenty declared components, chosen
 * for the four flows a reader arrives wanting. A subset is a legitimate picture and a
 * dangerous one: the way it goes wrong is silently, when a component lands and nobody
 * decides whether it belongs. So the storyboard carries both lists — what is drawn, and
 * what is deliberately left out with its reason — and this gate fails the build when a
 * declared component is in neither.
 *
 * It also fails on the ways the drawing can quietly stop meaning what it says: a node for
 * something the configuration declares nothing for (Constitution VII, applied to the
 * diagram), two nodes claiming one cell, an omission with no reason or one that is drawn
 * anyway, a component in the plane strip that does not declare the plane, and a component
 * inside the loop band that is not part of the loop.
 *
 * Deliberately NOT a drift check against a committed picture: there is no committed
 * picture to drift from, which is the point — the same reasoning as
 * `check-flow-completeness.ts`, which holds the Operator flow chart to the whole
 * topology. The findings are sentences, because a gate that says "incomplete" tells
 * nobody what to do about it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { storyboardFindings } from '../../app/src/panels/intro/storyboard.js';
import type { ConfigRun } from '../../app/src/generated/types.js';
import { type Finding, REPO_ROOT } from './lib.js';

export function runGate(root: string = REPO_ROOT): Finding[] {
  const configPath = join(root, 'app', 'config', 'run.json');
  let config: ConfigRun;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8')) as ConfigRun;
  } catch (error) {
    // The outcome that proves nothing must not look like a pass (`run-gates.ts`).
    throw new Error(
      `could not read ${join('app', 'config', 'run.json')} to find out which components exist: ${(error as Error).message}`,
    );
  }
  if (!config.shell?.components?.length) {
    throw new Error(
      'the configuration declares no components — the gate has nothing to hold the Intro drawing to',
    );
  }
  return storyboardFindings(config.shell).map((message) => ({
    file: 'app/src/panels/intro/storyboard.ts',
    line: 1,
    message,
  }));
}
