"""C-13, the model runner: analytic advection behind a port, and an honest spread.

Being irreplaceable is the failure this component owns (SRD §4), and the whole of the
answer is the shape of its interface. The numerics are deliberately fake — features are
advected by the drift velocities the environment generator recorded, and seeded noise is
added — so what is worth anything here is that the fakery sits behind the model kernel port:
initialisation state in, gridded field out, with two implementations in the tree and no
component outside this package depending on either.

The second thing it owns is the spread. A run executes a small ensemble whose members are
perturbed from derived seeds, and publishes the per-cell mean as the forecast and the
per-cell spread as the uncertainty field. A single deterministic field would be cheaper and
would tell the planner and the client nothing about how much to believe it.

The runner writes into staging and nowhere a reader can reach. Making a run visible is one
indivisible operation and it belongs to the publisher (C-14).
"""

from harness_model_runner.version import RUNNER_NAME, RUNNER_VERSION

__all__ = ["RUNNER_NAME", "RUNNER_VERSION"]
