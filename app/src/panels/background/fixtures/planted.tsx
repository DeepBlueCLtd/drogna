/**
 * Two faults, planted and kept.
 *
 * SC-007 and SC-002 are both assertions about an absence, and an assertion about an
 * absence passes by simply not finding what it did not look for. Two of this
 * repository's original four gates reported a file of deliberate violations as
 * clean, and a regression test for a real fault once passed against the unfixed
 * code. So the checks that read the course also read these, and are seen failing
 * against them on every run.
 *
 * Neither is in `registry.ts`, so neither is in the course. Both are imported only
 * by `background.test.tsx`.
 */
import { useEffect, type ReactNode } from 'react';
import type { Explainer } from '../model.js';

/**
 * An explainer with no Consequences panel, which FR-020 forbids. The value-panel
 * audit must report it; if the audit ever passes this, the audit is finding nothing
 * rather than finding everything correct.
 */
export const noValuePanel: Explainer = {
  id: 'planted-no-value-panel',
  title: 'A planted explainer that states no consequences',
  form: 'slides',
  idea: 'Held to be caught. FR-020 says no explainer omits the value panel.',
  steps: [{ title: 'The only step', prose: ['And then it simply stops.'] }],
};

/**
 * An explainer that omits an axis without saying why — the other half of FR-008.
 * An axis is filled or omitted with its reason; padding and silence are both faults,
 * and silence is the one an assertion over markup will miss.
 */
export const axisWithoutReason: Explainer = {
  id: 'planted-axis-without-reason',
  title: 'A planted explainer that omits an axis in silence',
  form: 'slides',
  idea: 'Held to be caught. FR-008 says an omitted axis states its reason.',
  steps: [{ title: 'The only step', prose: ['And then it simply stops.'] }],
  value: {
    'through-life cost': { kind: 'filled', body: 'Something.', qualitative: true },
    interoperability: { kind: 'filled', body: 'Something else.' },
    'what you do not have to build': { kind: 'omitted', reason: '' },
  },
};

/**
 * A panel that reaches for the running system on mount. The gate cannot see this —
 * it is a call, not an import — which is the whole reason the runtime half of SC-002
 * exists. The traps in `background.test.tsx` must report it.
 */
export function WiredPanel(): ReactNode {
  useEffect(() => {
    void fetch('a request this tab must never make');
  }, []);
  return <p>a panel that asks the running system for something</p>;
}
