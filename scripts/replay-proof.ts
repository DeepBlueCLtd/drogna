/**
 * The one-command AT-04 replay proof (deferred from 105 and 107 to the arc's
 * close-out, deliberately): runs every byte-identity test in the suite — the
 * generator's, the whole loop's, and the advisories-and-bundles one — and states
 * the claim's exact terms before it starts, so the proof and its boundary travel
 * together. Exit status is the verdict, propagated (a wrapper that does not check
 * what it wrapped is the fault CLAUDE.md documents).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

console.log(`AT-04 replay proof
==================
Claim: for a fixed seed, code revision and configuration, a lockstep run
reproduces byte-identical published holdings and identical control traffic.
Boundary: lockstep mode only (free-running modes reproduce drawn values, not
interleaving), and operator commands are ephemeral — deliberately outside the
claim, as the Intro states beside it. Since feature 113 a platform demand is a
command of that kind: the manifest carries no demand, so a demanded run replays
identically only when the same demands are issued at the same ticks. Feature 120's
pre-roll meets that proviso by construction and is therefore inside the claim: a
start condition's demands and prompts are configuration, issued at ticks the
configuration fixes, and the manifest records which condition the run began in. Inside the
claim, and new in 113: the platform's motion, and the sensors' sampling
positions, which are no longer a closed form over simulation time but the last
ownship report the sensors heard. That is a dependency on delivery order, which
lockstep makes deterministic and registration order makes stable — stated here
rather than left to be discovered. The run manifest is sufficient input.
`);

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const result = spawnSync('pnpm', ['exec', 'vitest', 'run', '-t', 'replay'], {
  cwd: appDir,
  stdio: 'inherit',
});
if (result.status !== 0) {
  console.error('replay proof FAILED: a replay diverged, or the suite could not run');
  process.exit(result.status ?? 1);
}
console.log('replay proof held: every replay test reproduced its run byte-identically');
