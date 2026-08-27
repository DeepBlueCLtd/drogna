---
title: C-12 Scheduler
---

# C-12 Scheduler

!!! success "Status: built"

    - **Code:** `services/scheduler/` — `policy.py` for the minimum interval,
      `outstanding.py` for the duplicate-request register, and `run_id.py` for the
      deterministic run identifier
    - **Delivered by:** `specs/009-control-loop`
    - **Covered by:** `services/scheduler/tests/`,
      `tests/integration/test_monitor_scheduler_handoff.py` and
      `tests/integration/test_control_loop_startup.py`
    - **Not present:** the run identifier is derived from the seed and an ordinal by
      hashing, so a published run's name cannot be read back as the sequence it was, and
      the run manifest records no run sequence for want of one. The coverage store's
      naming rule puts the sequence in the name and the scheduler has not adopted it

**Responsibility:** decide whether a model run is warranted.
**Owns the failure mode of:** thrashing.

## What it does

It receives divergence requests from the [monitor](c11-monitor.md) and decides
whether to start a model run. It enforces a minimum interval between runs and
rejects duplicate outstanding requests.

## Why it is a separate component

Because "the forecast is wrong" and "we should therefore recompute it now" are
different judgements, and merging them produces a system that recomputes
whenever it is wrong, which is exactly when computing is most expensive and
least likely to help.

Separating them also means the policy lives in one readable place. The minimum
interval, the deduplication rule, and any future rule about time of day or
resource availability are all scheduling policy, and scheduling policy is one of
the few genuinely bespoke pieces of logic in the system rather than plumbing.

## Thrashing

The failure mode it owns is a loop that spends all its time reacting: a run
starts, the forecast changes, the residual moves, another request arrives, and
the system never reaches a state where anyone can ask whether the forecast is
any good. The minimum interval is the crude form of the defence and the
duplicate-request rejection is the precise one.

**Requirements:** FR-27. **Feature:** 009.
