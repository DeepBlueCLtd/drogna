"""C-14, the publisher: a run becomes visible all at once, and says so once.

Partial visibility is the failure this component owns (SRD §4), and it is the kind of
failure that does not announce itself: a reader that catches a half-written field gets a
plausible answer, not an error, and the fault surfaces later as something intermittent in a
component that did nothing wrong. So the property FR-30 asks for is structural rather than
careful. A completed run is written into staging by the model runner; the publisher moves it
into the catalogued location and swaps a single pointer in one operation on one volume.
There is no window in which the current run is half of one thing and half of another.

The other half is FR-31: the publisher announces on ``ctl/run-published``, and nothing in
the harness polls the query layer to ask whether anything has changed. If the announcement
is lost, consumers stay on the previous field and the loop is visibly stalled — which is the
honest outcome, and better than a poll that hides it.
"""

from harness_publisher.version import PUBLISHER_NAME, PUBLISHER_VERSION

__all__ = ["PUBLISHER_NAME", "PUBLISHER_VERSION"]
