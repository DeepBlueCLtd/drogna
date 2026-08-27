"""C-16, telemetry and forecast quality: what the harness says about itself.

Two jobs, and one rule that governs both.

The first job is FR-37. The monitor already computes a residual — measured sound speed
minus forecast sound speed — for every observation it scores, and uses it to decide
whether to trigger a run. This component takes the same residuals and keeps running
statistics of them, per forecast run and per region, in memory that does not grow with
the length of the scenario. Same data, two purposes: triggering runs and reporting
confidence. Nothing here recomputes a residual, queries the observation store or asks the
query layer for anything; every number published came from a message this component
subscribed to.

The second job is FR-38, and it has teeth. Forecast skill is reported against a
persistence reference — the field that was current immediately before the latest
publication, held constant, which is the claim that conditions stay the same. A model not
beating that claim is not earning its compute, and the message says so in a state and in
words rather than leaving a negative number for a display to interpret. Both mean-square
errors and the sample count travel with the score, so a reader can recompute it instead of
believing it (Constitution IX).

The rule governing both: **silent degradation is the failure mode this component owns**
(SRD §4). A statistic that keeps showing a comforting number after its input has dried up
is worth less than no statistic, so every figure carries the simulation time of its last
real update and a freshness state, and goes stale on its own. Nothing here is suppressed,
smoothed or gated for being unflattering, and below the configured minimum sample count no
score is published at all — no default, no zero, no carried-forward previous value.

Telemetry reports and does not decide. It publishes nothing the scheduler consumes
(FR-013) and no list of components that ought to exist (FR-012): the client lights
components from ``ctl/heartbeat`` alone.
"""

from harness_telemetry.version import TELEMETRY_NAME, TELEMETRY_VERSION

__all__ = ["TELEMETRY_NAME", "TELEMETRY_VERSION"]
