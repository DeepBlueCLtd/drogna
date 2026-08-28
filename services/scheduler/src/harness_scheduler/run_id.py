"""Run identifiers: a function of the seed and the run sequence, never of entropy or a clock.

Constitution II makes this small module load-bearing. The run identifier appears in four
control messages, in the coverage store's layout and in the collection identifiers the query
layer serves, so if it came from entropy or from a host clock then no replay could produce
the same names as the run it replays — and a replay whose outputs are identical except for
their names is not a replay anybody can diff.

**The rule is the coverage store's, and was not.** ``stores/coverage/layout.md`` fixes it:
a run's directory is ``<prefix>-<sequence padded to six digits>-<twelve hex digits of
sha256("<rule>|<version>|<root_seed>|<sequence>")>``, and the sequence is *in the name* so
that a directory listing sorts in run order and a published run can be read back as the run
of the scenario it was. This module used to hash an ordinal through a derived random stream
instead. Both were deterministic and both replayed, so nothing failed; what was lost was the
sequence, and the run manifest recorded a null ``run_sequence`` for want of anything to read.

The rule's name, its version and the prefix arrive from configuration rather than from
source, so this component computes the same string from the same five values as
``derive_run_id`` in ``query/plugins/coverage_catalogue.py`` without importing it across a
boundary. That the two agree is a property of the values, not of a shared module — which is
what the layout document asks for, and why changing the rule changes every identifier
visibly rather than quietly.
"""

from __future__ import annotations

import hashlib

__all__ = ["run_identifier"]

_SEQUENCE_DIGITS = 6
_DIGEST_CHARACTERS = 12


def run_identifier(
    *,
    root_seed: int,
    sequence: int,
    rule: str,
    version: int,
    prefix: str,
) -> str:
    """The identifier of the ``sequence``-th run of this scenario, counting from zero."""
    if sequence < 0:
        raise ValueError("run sequences count from zero")
    material = f"{rule}|{version}|{root_seed}|{sequence}".encode()
    digest = hashlib.sha256(material).hexdigest()[:_DIGEST_CHARACTERS]
    return f"{prefix}-{sequence:0{_SEQUENCE_DIGITS}d}-{digest}"
