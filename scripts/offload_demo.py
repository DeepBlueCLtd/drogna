"""Package a fixture run, transfer it to the deployed stub archive, verify, report. 014 T046.

One command's worth of demonstration: `scripts/offload_demo.sh` brings the destination up
and runs this. What it shows is the whole of C-17's cycle happening for real — a bundle
written, uploaded under a name nothing serves, revealed, acknowledged by a receipt the
destination computed itself, and the ledger transition recorded before each attempt.

**The destination is the deployed one.** Not a stub in this process: the container
`deploy/compose.yaml` declares as `archive`, reached over HTTP at the address
`config/<destination>/deployment.json` publishes it at. That is the point of running this at
all — `services/offload/tests/` already exercises the packager against in-process doubles,
and what none of them could tell you is whether the thing the deployment actually starts
answers the three routes the packager actually sends. It did not, until 014 T045: the
configuration named `archive` and nothing was there.

**The run is a fixture, and the task says so.** `services/offload/README.md` records that
nothing writes the recorded observation stream yet — the clock writes the run manifest and
the stream beside it has no producer — so a demonstration that waited for a real run would
demonstrate an empty directory. The fixture is written by
`services/offload/tests/offload_support.write_run`, which is the generator the tests use.
Reusing it is deliberate: a second fixture generator here would be a second thing to keep in
step with the packager's own reader, and `offload_support.configuration` reads
`config/local/offload.json` itself, so a value that drifts there fails here rather than
somewhere quieter.

**Everything else is temporary.** The staging area, the ledger and the released directory
are a scratch tree that goes away with the run. This writes nothing into the deployment's
volumes and evicts nothing from them: it is a demonstration, and a demonstration that
mutated the stack it was demonstrating would be a worse one.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
for candidate in (
    REPOSITORY_ROOT / "services" / "offload" / "tests",
    REPOSITORY_ROOT / "deploy" / "lib",
):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from destination import load_deployment  # noqa: E402
from offload_support import configuration, manual_clock, write_run  # noqa: E402

DESTINATION = "local"

#: The internal scheme. Termination happens at the edge and the edge is the proxy; this
#: reaches a loopback-published port on the host and is never TLS.
SCHEME = "http"


def published_endpoint(destination: str, service: str) -> str:
    """Where the host reaches a service, from the destination's own declaration.

    Composed rather than written down: `offload.json` names `archive` at its address on the
    compose network, which is the right address for a container and the wrong one from here.
    Both come from the same file, so neither is a literal (Constitution IV).
    """
    entry = load_deployment(destination, REPOSITORY_ROOT)["network"]["publish"][service]
    return f"{SCHEME}://{entry['bind']}:{entry['host_port']}"


def report(document: dict[str, Any], scratch: Path) -> int:
    """Run one cycle against the deployed destination and print what happened."""
    from harness_offload.ledger import Ledger
    from harness_offload.main import Packager, PackagerSettings
    from harness_offload.transfer import HttpDestination, TransferError

    section = document["offload"]["destination"]
    destination = HttpDestination(
        identifier=str(section["id"]),
        endpoint=str(section["endpoint"]),
        routes=section["routes"],
        timeout_seconds=float(section["timeout_seconds"]),
    )

    write_run(scratch / "run")
    print(f"  a fixture run is written at {scratch / 'run'}")
    print(f"  the destination is {section['id']!r} at {section['endpoint']}")

    packager = Packager(
        PackagerSettings.from_config(document),
        clock=manual_clock(),
        destination=destination,
    )
    try:
        outcome = packager.cycle(recover=True)
    except TransferError as failure:
        print(f"\nthe destination could not be reached: {failure}", file=sys.stderr)
        return 1

    for failure in outcome.failures:
        print(f"  ! {failure}", file=sys.stderr)

    ledger = Ledger(Path(document["offload"]["ledger"]["directory"]) / "bundles.jsonl")
    print("\n  the ledger, after one cycle:")
    for record in ledger.records():
        print(f"    {record.bundle_id}  {record.state}")
        receipt = getattr(record, "receipt", None)
        if isinstance(receipt, dict) and receipt.get("digest"):
            # The line this whole exercise is for. The digest below was computed by the
            # destination over the bytes that arrived, and compared by `verify` against a
            # digest recomputed from the file on disk — never against the one the transfer
            # declared. See docs/adr and services/offload/src/harness_offload/verify.py.
            print(f"      the destination computed {receipt['digest']}")
            print(f"      over {receipt['byte_count']} bytes, at sim time {receipt['sim_time']}")

    counts = ledger.counts()
    print(f"\n  states: {json.dumps(counts, sort_keys=True)}")
    if not ledger.records():
        # A cycle that packaged nothing is not a demonstration of anything, and exiting 0
        # here is how this script would come to be read as evidence that the path works.
        print(
            "\nnothing reached the ledger: the packager staged no bundle at all.",
            file=sys.stderr,
        )
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("destination", nargs="?", default=DESTINATION)
    parser.add_argument(
        "--keep",
        action="store_true",
        help="leave the scratch tree in place for inspection rather than removing it",
    )
    arguments = parser.parse_args(argv)

    scratch = Path(tempfile.mkdtemp(prefix="drogna-offload-demo-"))
    try:
        document = configuration(scratch)
        # The one value `offload_support.configuration` cannot supply: it rebases the
        # directories onto a scratch tree and leaves the destination as the tracked file has
        # it, which names the compose network. From the host that name does not resolve.
        document["offload"]["destination"]["endpoint"] = published_endpoint(
            arguments.destination, "archive"
        )
        return report(document, scratch)
    finally:
        if arguments.keep:
            print(f"\n  the scratch tree is at {scratch}")
        else:
            shutil.rmtree(scratch, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
