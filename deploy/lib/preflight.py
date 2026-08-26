"""Answer, before any container starts, whether the host can give this destination what it
asks for.

Docker's own message for an occupied port names the port and nothing else. That is enough
to know something is wrong and not enough to know what to change, so this check runs first
and reports the service and the configuration key alongside the port (spec.md, edge cases).
"""

from __future__ import annotations

import argparse
import socket
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from destination import ConfigurationError, load_deployment, repository_root

PUBLISH_KEY = "network.publish"


def _is_free(bind: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind((bind, port))
        except OSError:
            return False
    return True


def occupied_ports(
    destination: str, services: list[str] | None = None, root: Path | None = None
) -> list[str]:
    """Every published port this destination needs that the host will not give it."""
    deployment = load_deployment(destination, root or repository_root())
    publish = deployment["network"]["publish"]
    wanted = sorted(publish) if services is None else sorted(set(services) & set(publish))
    findings: list[str] = []
    for service in wanted:
        entry = publish[service]
        if not _is_free(entry["bind"], entry["host_port"]):
            findings.append(
                f"port {entry['host_port']} on {entry['bind']} is already in use, and service "
                f"'{service}' needs it. Free it, or change "
                f"{PUBLISH_KEY}.{service}.host_port in config/{destination}/deployment.json"
            )
    return findings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("destination")
    parser.add_argument(
        "services",
        nargs="*",
        help="services about to be started; default every service that publishes a port",
    )
    arguments = parser.parse_args(argv)
    try:
        findings = occupied_ports(arguments.destination, arguments.services or None)
    except (ConfigurationError, KeyError) as exc:
        print(f"pre-flight check failed: {exc}", file=sys.stderr)
        return 2
    if findings:
        print("the host cannot give this destination the ports it asks for:", file=sys.stderr)
        for finding in findings:
            print(f"  {finding}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
