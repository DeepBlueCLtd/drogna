"""What a component has been asked to do to itself, and what it decides to do about it.

Spike code, written as it would appear at ``libs/harness_core/src/harness_core/fault.py``
and grafted there by ``spikes/operator-plane/run.sh`` for the length of one run. Nothing
imports it in the committed tree.

The shape follows the one precedent the repository already has for an operator asking a
component for something: the clock's rate control (FR-10, FR-49, ADR-0009). There, a rate
is *requested* over HTTP and the answer arrives on ``ctl/clock`` as the rate in force,
which may not be the rate that was asked for. The client displays what the clock reports,
never what somebody wanted. This module generalises that to impairment.

Three rules are structural here rather than asserted in a comment.

**A fault is a state the component enters, not a status the console sets.** Every service
already maps its own state to a heartbeat status through a pure function — the planner's
``heartbeat_status`` is the model, where ``no-field`` becomes ``degraded`` because "the
process is alive and is doing nothing useful". An impairment joins that state; it does not
bypass it. So the display keeps saying what the component said about itself, which is the
whole of Constitution VII.

**Truth is monotone downward.** :meth:`FaultState.status_for` may worsen a status and can
never improve one. A component that is genuinely degraded stays degraded however cheerful
the request, because the operator plane exists to provoke failures and must never be able
to conceal one.

**An injected impairment says so in the message.** The detail carries the request's mark,
so a reader can tell a provoked failure from a real one. Without that, a demonstration
fault is indistinguishable from a genuine one in the record, which corrupts exactly the
evidence the harness exists to produce.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from harness_core.heartbeat import HeartbeatStatus

#: The mark an injected impairment leaves in a heartbeat's detail.
INJECTED = "impairment-requested"


class Impairment(StrEnum):
    """What an operator can ask a component to do to itself.

    Deliberately not an open string. Each of these is a distinct thing the display can
    already tell apart, and a fifth would need a display that could show it.
    """

    NONE = "none"
    #: Alive, and doing its job badly. The client shows it lit, reporting degraded.
    DEGRADE = "degrade"
    #: Alive, and not progressing at all. Lit, reporting stalled.
    STALL = "stall"
    #: Stop publishing. The client stops hearing from it and shows it dark — a different
    #: and equally true claim, and the one an operator most often wants to provoke.
    SILENCE = "silence"
    #: Slower, and still working. Status is unchanged: a slow component is not a sick one,
    #: and saying otherwise would be the console deciding something it cannot know.
    THROTTLE = "throttle"


@dataclass(frozen=True)
class FaultRequest:
    """An operator's request. What is asked for, of whom, and for how long.

    ``expires_after_ticks`` is simulation time, not host seconds. Constitution I admits no
    host clock in operational code, and an impairment measured in real seconds would also
    behave differently at every clock rate — so an impairment injected for a demonstration
    at rate 10 would outlast the same demonstration at rate 1.
    """

    component: str
    impairment: Impairment
    reason: str
    expires_after_ticks: int | None = None


@dataclass(frozen=True)
class Acceptance:
    """What the component decided. A request is not an instruction."""

    accepted: bool
    in_force: Impairment
    detail: str


class FaultState:
    """The impairment in force at one component, and the arithmetic around it.

    Held by the component, consulted by the component. Nothing here publishes, and there is
    no argument through which a console could reach a heartbeat directly.
    """

    def __init__(self, component: str) -> None:
        self._component = component
        self._impairment = Impairment.NONE
        self._reason = ""
        self._expires_at_tick: int | None = None

    @property
    def in_force(self) -> Impairment:
        return self._impairment

    def request(self, request: FaultRequest, tick: int) -> Acceptance:
        """Consider a request. The component decides, as the clock decides a rate."""
        if request.component != self._component:
            return Acceptance(
                accepted=False,
                in_force=self._impairment,
                detail=f"this is {self._component}, not {request.component}",
            )
        if not request.reason:
            # An impairment with no reason is one nobody can account for afterwards, and
            # the record is the only reason to have an operator plane at all.
            return Acceptance(
                accepted=False,
                in_force=self._impairment,
                detail="a request must carry a reason",
            )
        if request.expires_after_ticks is not None and request.expires_after_ticks <= 0:
            return Acceptance(
                accepted=False,
                in_force=self._impairment,
                detail="an expiry must be a positive number of ticks",
            )
        self._impairment = request.impairment
        self._reason = request.reason
        self._expires_at_tick = (
            None
            if request.expires_after_ticks is None or request.impairment is Impairment.NONE
            else tick + request.expires_after_ticks
        )
        return Acceptance(accepted=True, in_force=self._impairment, detail=request.reason)

    def expire(self, tick: int) -> None:
        """Let a timed impairment lapse. Called by the component as its tick advances."""
        if self._expires_at_tick is not None and tick >= self._expires_at_tick:
            self._impairment = Impairment.NONE
            self._reason = ""
            self._expires_at_tick = None

    def publishes(self) -> bool:
        """Whether the component should publish a heartbeat at all this tick."""
        return self._impairment is not Impairment.SILENCE

    def status_for(self, natural: HeartbeatStatus) -> HeartbeatStatus:
        """The status to publish, given what the component would have said unimpaired.

        Worsens and never improves. ``STARTING`` and ``STOPPING`` are lifecycle statements
        rather than health ones and are left alone: a component being asked to degrade
        while it is still starting is still starting, and saying otherwise would be a
        smaller lie than the alternative but a lie all the same.
        """
        if natural in (HeartbeatStatus.STARTING, HeartbeatStatus.STOPPING):
            return natural
        if self._impairment is Impairment.STALL or natural is HeartbeatStatus.STALLED:
            return HeartbeatStatus.STALLED
        if self._impairment is Impairment.DEGRADE or natural is HeartbeatStatus.DEGRADED:
            return HeartbeatStatus.DEGRADED
        return natural

    def detail_for(self, natural: str) -> str:
        """The detail to publish, marked so a provoked failure is never read as a real one."""
        if self._impairment in (Impairment.NONE, Impairment.SILENCE):
            return natural
        mark = f"{INJECTED}: {self._impairment.value} ({self._reason})"
        return f"{natural}; {mark}" if natural else mark
