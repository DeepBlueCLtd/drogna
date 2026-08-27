"""C-01, the simulation clock, as a component rather than as arithmetic.

The arithmetic already existed. :mod:`harness_core.clock_service` holds the engine that
answers what tick ``n`` is and whether the clock may advance, and the real-time driver that
turns rate into emission pace; :mod:`harness_core.clock` holds the port every other
component reads time through. What this package adds is the running thing: the process that
publishes simulation time on ``ctl/clock``, publishes its own liveness on ``ctl/heartbeat``,
answers the browser's rate commands over a small HTTP interface, and writes the run manifest
a replay is started from.

Three decisions govern it, and each is recorded rather than assumed.

ADR-0009 settled the transport. Time goes on the broker's control namespace, not down a
second channel of its own; the HTTP interface is for setting the rate and for a component
catching up at startup, and for nothing else. It also added lockstep mode, in which the
clock does not advance until every registered participant has acknowledged the current tick
— so a participant that dies stalls the clock rather than being outrun, which is the right
failure for a replay mode.

ADR-0006 settled the heartbeat. Cadence and liveness windows are real time, and the
simulation time a heartbeat carries is payload rather than schedule, so a rate of zero stops
simulated time and stops nothing else. This is the component that could most easily get that
backwards, being the one holding the time that is not advancing.

Constitution VII settled what any of it means. This heartbeat is drogna's first genuine
liveness signal (FR-52) and the first thing that will ever light a box in the client's
eighteen-component shell. Nothing about it may be mocked, defaulted or configured into
existence: the box is lit because a message arrived, or it is dark.
"""

from harness_clock.service import ClockService, OpenedRun, open_run
from harness_clock.version import CLOCK_NAME, CLOCK_VERSION

__all__ = [
    "CLOCK_NAME",
    "CLOCK_VERSION",
    "ClockService",
    "OpenedRun",
    "open_run",
]
