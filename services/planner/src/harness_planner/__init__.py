"""C-15, the adaptive sampling planner: where sampling would most reduce uncertainty.

The planner maintains an uncertainty field over planning cells — H3 in the horizontal, a
separate index in depth — evaluates candidate routes by simulating the collapse of
uncertainty as each candidate is traversed, selects one committed route as a prize-collecting
problem under a budget, replans on a receding horizon as fields and measurements arrive, and
projects forward to say when each region will fall below usable confidence.

Everything it emits is a **recommendation**, published on ``ctl/plan``. It commands nothing,
addresses nobody, and renders nothing. Crossing into tactical advice is the failure this
component owns (Constitution VIII), and the defence is structural rather than editorial:
every string in the plan contract is an enumeration, a constant, an identifier matching a
declared pattern, or a simulation instant, so there is nowhere in the message a sentence
addressed to a person could be written.

Three rules are enforced by tests rather than by care, because each is wrong in a way that
looks right:

- **A route is valued against the field as it will be at arrival**, not as it stands when the
  recommendation is computed. On a field that does not move the two agree exactly, which is
  why the second is so easy to write and so hard to see; the moment a feature drifts, a
  planner scoring the present recommends the water that used to be interesting.
- **Each visit collapses the uncertainty its footprint informs, and every later stop is
  valued against what remains.** A value function that sums independent per-cell values
  double-counts, prefers routes through one dense blob, and produces recommendations that are
  confidently useless (SRD FR-32).
- **tau is a field defined everywhere** (ADR-0002). Every planning cell has a decorrelation
  timescale, open background water included, and there is no fallback constant in this
  package for a cell outside a seeded feature.

The derivation of the value function, the sensing model, the orienteering formulation and the
selection heuristic is written up in the algorithm document this feature also owns.
"""

from harness_planner.version import PLANNER_NAME, PLANNER_VERSION

__all__ = ["PLANNER_NAME", "PLANNER_VERSION"]
