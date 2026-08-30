/**
 * Gate: nothing forecasts from the true field (feature 116).
 *
 * The environment generator evaluates the archive and a rolling now-cast from the
 * analytic true ocean. That is legitimate and load-bearing — it is the reference the
 * monitor scores residuals against and the field the Map can draw truth from — but for
 * nine features the model runner also *initialised* from it, which meant no
 * measurement the platform took ever changed a field value. The loop converged because
 * truth leaked into it on a timer, and nothing in the tree said so.
 *
 * The analyst is now the only component that may read the now-cast, and only for the
 * stated cold start, which its manifest records. This gate is what stops the leak
 * being reintroduced by a component reaching for `currentNowcast()` because it happens
 * to be the easiest field to hand.
 *
 * Reading the *manifest* of a truth holding is not a leak and is not caught: the
 * planner derives τ from the published ground-truth manifest by ADR-0002, which is a
 * declared parameter rather than the field. What this gate refuses is reaching for the
 * bytes.
 */
import { join, relative } from 'node:path';
import { walk, readLines, isTestFile, type Finding, REPO_ROOT } from './lib.js';

/**
 * The accessors that hand back a truth-derived field with its bytes.
 *
 * `departureHolding` joined the list with feature 118. The departure brief is the true
 * field held constant from the scenario origin, which makes it exactly as tempting and
 * exactly as poisonous to initialise from as the now-cast: a run that started from it
 * would be a run no measurement had changed, and the loop would converge on truth that
 * leaked in at provisioning. One accessor guarded and the other open would have left
 * the gate reporting clean on the same fault it was written for.
 */
const TRUTH_ACCESSOR = /\b(?:currentNowcast|departureHolding)\s*\(/;

/**
 * Who may call it, by the directory the call lives in, and why.
 *
 *  - coverage-store: it is the accessor's own home.
 *  - analyst:        the stated cold start, once per scenario, recorded in the lineage
 *                    of the analysis it produces.
 *  - monitor:        scoring against ground truth is the point (Constitution IX).
 *  - planner:        τ from the published manifest (ADR-0002), never the field.
 */
const PERMITTED = new Set(['coverage-store', 'analyst', 'monitor', 'planner']);

export function runGate(root: string = REPO_ROOT): Finding[] {
  const backendRoot = join(root, 'app', 'src', 'backend');
  const files = walk(backendRoot, (path) => /\.tsx?$/.test(path) && !isTestFile(path));
  const findings: Finding[] = [];
  for (const file of files) {
    const component = relative(backendRoot, file).split('/')[0];
    if (PERMITTED.has(component)) continue;
    readLines(file).forEach((line, index) => {
      const match = TRUTH_ACCESSOR.exec(line);
      if (!match) return;
      // The accessor is named because there are two of them: a message that always
      // said "now-cast" would misreport a departure-brief leak as a now-cast one, and
      // send the reader to the wrong holding.
      const held = match[0].startsWith('departureHolding') ? 'departure brief' : 'now-cast';
      findings.push({
        file: relative(root, file),
        line: index + 1,
        message: `'${component}' may not read the truth-derived ${held}: a forecast initialises from the analysis, never from the true field (feature 116, extended by 118)`,
      });
    });
  }
  return findings;
}
