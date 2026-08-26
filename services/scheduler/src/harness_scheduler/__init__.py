"""C-12, the run scheduler: the one component that turns a divergence into a run.

Thrashing is the failure this component owns (SRD §4). A control loop whose second step
says yes to everything is an oscillator: each run publishes a field, each publication
invalidates the monitor's evidence, the next divergence arrives, and the harness spends its
compute going round. Two rules prevent it, both in simulation time and both configuration:

- a **minimum interval** between run requests;
- **at most one outstanding request** — a request is outstanding until the run it asked for
  is published or the outstanding timeout elapses.

Every divergence gets a recorded decision, including the ones declined. A decision that is
not recorded is indistinguishable from a message that was lost, and the difference between
those two is exactly what somebody debugging a stalled loop needs to know.
"""

from harness_scheduler.version import SCHEDULER_NAME, SCHEDULER_VERSION

__all__ = ["SCHEDULER_NAME", "SCHEDULER_VERSION"]
