#!/usr/bin/env python3
"""Render the seeded violation fixture's images. A deliberate control; see README.md.

The text half of the fixture is committed source and belongs in a diff as text. The image
half cannot be hand-written, so it is written here — and committed, because a control that
regenerates itself is not a control: a gate that had quietly stopped reading images would
still pass against an image the run had just produced.

Reproducible by construction rather than by seed. There is no random draw anywhere in this
module, so there is nothing to seed (Constitution II): the canvas size, the colours, the
font and the strings are all fixed, and two runs on the same Pillow produce the same bytes.

Regenerate with Pillow installed::

    python site/gates/fixtures/seeded_violation/make_fixture.py

Pillow's bundled default font is used on purpose. A system font would make the output
depend on which fonts the machine happens to have, and the first thing a reader would ask
of a differing byte is which of the two machines was right.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ModuleNotFoundError:  # pragma: no cover - the generator is a one-off
    print("Pillow is not installed; `pip install pillow` and run again.", file=sys.stderr)
    raise SystemExit(2) from None

ASSETS = Path(__file__).resolve().parent / "built" / "assets"

PAPER = (250, 250, 250)
CHROME = (222, 224, 228)
INK = (17, 17, 17)

# What is seeded, and which rule each line is the control for. Every string here is a
# deliberate violation: that is the whole purpose of this directory.
SHOTS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    (
        "seeded-shot-vocabulary.png",
        "tracked-entity",
        ("Sensor log", "A detection was recorded at the marker.", "tracklet 4 closed"),
    ),
    (
        "seeded-shot-address-bar.png",
        "address-bar",
        # harness:allow-literal-path the address bar this fixture exists to render
        ("https://drogna.invalid/console", "Deployment console"),
    ),
    (
        "seeded-shot-host-path.png",
        "host-path",
        # harness:allow-literal-path the host path this fixture exists to render
        ("$ cat /home/jdoe/drogna/notes.txt", "reading the operator note"),
    ),
    (
        "seeded-shot-email.png",
        "personal-identifier",
        ("From: j.doe@example.invalid", "Subject: the note"),
    ),
)


def render(lines: tuple[str, ...]) -> Image.Image:
    """One small screenshot-shaped image: a chrome strip and a few lines of text."""
    # 32 point, not 28. At 28 the engine read `/home/` as `/nome/`, and a control the
    # engine cannot read tests nothing about the rule it is a control for. The size is
    # raised until the text is legible; the strings themselves are not touched.
    font = ImageFont.load_default(size=32)
    width, leading, top = 900, 48, 78
    image = Image.new("RGB", (width, top + leading * len(lines) + 24), PAPER)
    draw = ImageDraw.Draw(image)
    draw.rectangle(((0, 0), (width, 46)), fill=CHROME)
    for index, line in enumerate(lines):
        draw.text((20, top - 46 + leading * index), line, fill=INK, font=font)
    return image


def main() -> int:
    ASSETS.mkdir(parents=True, exist_ok=True)
    for name, rule, lines in SHOTS:
        render(lines).save(ASSETS / name, optimize=True)
        print(f"{name}: control for {rule}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
