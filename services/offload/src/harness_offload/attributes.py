"""The attribute allow-list, applied at write time rather than as a later pass.

SRD FR-42 names provenance metadata in exported files as a leakage path, and the four
attributes it leaks through are the four CF suggests a well-behaved producer should write:
``history``, ``source``, ``comment`` and ``institution``. Each is a free-text field, and a
free-text field beside a file gets filled with whatever was to hand — the command line, the
input paths, the host, the operator, the instrument. A file with a rich ``history`` is a
file that says where it was made, and by the time anyone reads it the file has already been
handed on.

So the check is an allow-list and not a deny-list. A deny-list of four names would be
correct until the fifth attribute is invented, and it would be silently correct in the
meantime, which is worse: it would look like a policy. The allow-list names what an export
may say and refuses everything else, so a new attribute is a deliberate addition to
configuration and to the primer rather than an accident.

And it is applied at write time. An attribute written and then stripped has existed on
disk, has been flushed, and — on the day the stripping pass is skipped, reordered or
short-circuited by an exception — is published. :func:`checked` refuses the attribute map
before the encoder sees it, so there is no window in which a disallowed attribute is a
value in this process at all.

The values are scanned as well as the names. An allow-listed attribute can still carry a
path, a host or a user name — ``title`` is a string like any other — so every value is
examined for the shapes those take, by the same reasoning feature 013's scanner applies to
what it releases. This is the producer half of that contract, and it runs here so a bundle
never has to be scanned to be safe, only to be shown to be.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

__all__ = [
    "NEVER_EMITTED",
    "DisallowedAttributeError",
    "checked",
    "offending_value",
]

NEVER_EMITTED: tuple[tuple[str, str], ...] = (
    (
        "history",
        "CF's own suggestion is a line per processing step naming the command that ran. "
        "That is a command line, a program path and usually an input path, which is three "
        "of the things FR-42 names in one attribute. It is also a host clock in a file "
        "written by a component forbidden to read one.",
    ),
    (
        "source",
        "The method of production: in practice the name of the model, the machine or the "
        "instrument that produced the data. The instrument is a sensor identifier by "
        "another name.",
    ),
    (
        "comment",
        "Free text with no defined content, which is the shape of every accidental "
        "disclosure. There is nothing an export needs to say here that it cannot say in a "
        "field with a meaning.",
    ),
    (
        "institution",
        "Where the data was produced — an organisation, and by implication a deployment "
        "and the people in it. Constitution V forbids a customer or project name anywhere "
        "in this repository, and this attribute is the place one would arrive.",
    ),
)
"""The four attributes deliberately not emitted, and why, in the words the primer uses.

Held here rather than only in the documentation so that the reason travels with the code,
and so that a test can assert the primer and the export agree about the list.
"""

_FORBIDDEN_VALUE_SHAPES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("a URL", re.compile(r"[a-z][a-z0-9+.\-]*://\S")),
    ("an absolute path", re.compile(r"(?:^|\s)(?:/[^/\s]+){2,}/?(?:$|\s)")),
    ("a home-relative path", re.compile(r"(?:^|\s)~/\S+")),
    ("a host and port", re.compile(r"(?:^|\s)[a-z0-9][a-z0-9.\-]*:\d{2,5}(?:$|\s|/)", re.I)),
    ("an IP address", re.compile(r"(?:^|\s)\d{1,3}(?:\.\d{1,3}){3}(?:$|\s)")),
    ("a user name", re.compile(r"(?:^|\s)(?:user|username|uid|operator)\s*[:=]", re.I)),
    (
        "a sensor, thing or datastream identifier",
        re.compile(r"(?:sensor|thing|datastream)[_-]?id", re.I),
    ),
)


class DisallowedAttributeError(Exception):
    """An attribute this export may not carry, refused before the encoder sees it."""


def offending_value(value: Any) -> str | None:
    """What a value looks like that it must not, or ``None`` when it looks like nothing."""
    if not isinstance(value, str):
        return None
    for label, pattern in _FORBIDDEN_VALUE_SHAPES:
        if pattern.search(value):
            return label
    return None


def checked(
    attributes: Mapping[str, Any], *, allowlist: Iterable[str], where: str
) -> dict[str, Any]:
    """Return ``attributes`` unchanged, or refuse the whole map naming the first fault.

    The whole map, not the offending entry: a caller handed a filtered map would carry on
    and write a file missing an attribute it believed it had written, which is a quieter
    version of the same problem.
    """
    permitted = frozenset(allowlist)
    for name, value in attributes.items():
        if name not in permitted:
            reason = dict(NEVER_EMITTED).get(name)
            detail = f" It is deliberately never emitted: {reason}" if reason else ""
            raise DisallowedAttributeError(
                f"{where}: {name!r} is not on the configured attribute allow-list, so this "
                f"export may not carry it.{detail}"
            )
        shape = offending_value(value)
        if shape is not None:
            raise DisallowedAttributeError(
                f"{where}: the value of {name!r} contains what looks like {shape}, which "
                "FR-42 withholds from an exported file however the attribute is named"
            )
    return dict(attributes)
