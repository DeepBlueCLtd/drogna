"""C-11, the divergence monitor: the sense half of the control loop.

The monitor listens to observation traffic as it passes on the broker, keeps a bounded
window of recent soundings in memory, and compares the sound speed each sounding implies
against the sound speed the current forecast predicts at that position and that moment.
When the disagreement is large enough *and* stays large enough it says so, once, on
``ctl/divergence``.

Over-sensitivity is the failure this component owns (SRD §4). Everything downstream is
triggered by what it publishes, so a monitor that fires on noise makes the rest of the loop
worthless however correct the rest of the loop is. Two rules follow from that and are
enforced by tests rather than by care:

- the residual is defined on **sound speed**, derived from temperature, salinity and
  pressure by the one implementation in :mod:`harness_core.soundspeed` (ADR-0005), so a
  temperature excursion that salinity compensates for raises nothing;
- a single sample above threshold is never sufficient. Persistence — over neighbouring
  positions or over consecutive samples — is what separates a divergence from a spike.

The monitor raises requests only. It never invokes the model, never publishes a run
request, and never writes to the coverage store (SRD FR-26).
"""

from harness_monitor.version import MONITOR_NAME, MONITOR_VERSION

__all__ = ["MONITOR_NAME", "MONITOR_VERSION"]
