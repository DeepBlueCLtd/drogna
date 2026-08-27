"""What this component calls itself, and the version its output records."""

from __future__ import annotations

__all__ = ["ANALYTIC_FORM_VERSION", "RUNNER_NAME", "RUNNER_VERSION"]

RUNNER_NAME = "model_runner"
RUNNER_VERSION = "0.1.0"
ANALYTIC_FORM_VERSION = 1
"""Bumped when the analytic forms change, because two runs of one seed must agree."""
