"""The collapse of uncertainty when a cell is sampled, and its regrowth afterwards.

Four functions and one law. They are here on their own, with no state and no configuration,
because they are the part of this component that can be wrong invisibly: a value function
that adds up per-cell uncertainty along a route double-counts, prefers routes through one
dense blob, and produces recommendations that are confidently useless (SRD FR-32).

The law
-------

Let ``u_sat(t)`` be the saturated uncertainty at a cell — the published ensemble spread
there, which is a function of simulation time because the field itself evolves. Let a visit
at ``t0`` leave the cell at ``u0``. Then::

    u(t) = u_sat(t) - (u_sat(t0) - u0) * exp(-(t - t0) / tau(t))

with ``tau`` the decorrelation timescale evaluated at that cell at ``t`` (ADR-0002).

Four consequences, and each is a requirement rather than an emergent nicety:

- **A cell never informed is at the spread.** With no visit there is no deficit, so
  ``u = u_sat``. That is the cold-arrival phase of the scenario exactly: uncertainty driven
  by ensemble spread alone (SRD FR-07).
- **A cell just informed is worth nothing to inform again.** Immediately after a visit the
  deficit is the whole reduction, so ``u(t0) = u0``.
- **Quiet water is left alone and fast water is resampled.** The deficit decays at the
  local ``tau``, so a revisit is worth only what has grown back, and the revisit cadence
  keeps in step with the timescale without anybody scheduling it (SRD FR-08).
- **tau is evaluated at the instant asked for, not cached.** A moving feature's timescale
  advects with it (ADR-0002), so the same cell can be quiet at the horizon's start and fast
  by the time the platform arrives. Passing ``tau`` in per evaluation is what keeps that
  possible; a timescale captured once at plan time would silently freeze the feature.

Uncertainty is what a visit reduces; **excess** is what a visit is worth. A cell already
below the usable-confidence threshold is fully known for the purpose the harness has, so
resolving it further collects no prize, and the route gains nothing from the detour. That
is the whole of the empty-route case: where nothing is above the threshold, the honest
recommendation is no route at all rather than the nearest cell as a consolation.
"""

from __future__ import annotations

from math import exp, isfinite

__all__ = [
    "collapsed",
    "excess",
    "reduction",
    "regrown",
]


def regrown(
    *,
    saturated: float,
    previous: float,
    previous_saturated: float,
    elapsed_seconds: float,
    timescale_seconds: float,
) -> float:
    """Uncertainty now, given what a visit left behind and how long ago it was.

    ``previous_saturated`` is the saturation at the moment of that visit, not now: the
    deficit a visit created is measured against the field as it stood then, and it is the
    deficit that decays. Using today's saturation to measure yesterday's deficit would make
    a growing field look like a collapsing one.
    """
    if timescale_seconds <= 0 or not isfinite(timescale_seconds):
        raise ValueError(
            "a decorrelation timescale is finite and positive at every point of the domain "
            f"(ADR-0002); {timescale_seconds!r} is neither"
        )
    if elapsed_seconds < 0:
        raise ValueError("uncertainty regrows forward in simulation time, never backwards")
    deficit = max(0.0, previous_saturated - previous)
    if deficit == 0.0:
        return max(0.0, saturated)
    remaining = deficit * exp(-elapsed_seconds / timescale_seconds)
    return max(0.0, saturated - remaining)


def collapsed(uncertainty: float, weight: float) -> float:
    """What a visit leaves behind at a cell it informs with this weight.

    Multiplicative rather than subtractive, so a cell that is already nearly resolved is
    not driven negative by a strong visit and a cell that is wholly unknown is not resolved
    exactly by a weak one.
    """
    if not 0.0 <= weight <= 1.0:
        raise ValueError("a sensing weight is a fraction of the uncertainty a visit removes")
    return max(0.0, uncertainty) * (1.0 - weight)


def excess(uncertainty: float, threshold: float) -> float:
    """How far above the usable-confidence threshold a cell is. Never negative.

    This is the prize, and the difference between it and the uncertainty is the whole
    reason a planner configured with a threshold does not recommend motion for its own
    sake.
    """
    return max(0.0, uncertainty - threshold)


def reduction(*, before: float, weight: float, threshold: float) -> float:
    """What informing a cell at this uncertainty with this weight is worth.

    The prize collected, not the uncertainty removed: a cell taken from just above the
    threshold to just below it is worth the sliver between them, and a cell already below
    it is worth approximately nothing however much uncertainty is nominally removed.
    """
    after = collapsed(before, weight)
    return excess(before, threshold) - excess(after, threshold)
