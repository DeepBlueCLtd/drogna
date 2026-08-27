# The seeded violation fixture

**Everything under `built/` is a deliberate violation.** It is a control, and it is the
reason the two site gates are worth running at all: a gate reporting nothing is
indistinguishable from a gate that has stopped looking, and the only way to tell the two
apart is to keep something in front of it that it is supposed to object to. FR-006 says so
in as many words — the vocabulary gate must be exercised against a seeded violation on
every run and must fail if the fixture is not caught. A run in which this fixture comes
back clean is a gate failure, not a pass.

Point a gate at it and expect a non-zero exit:

```sh
python site/gates/check_vocabulary.py --site site/gates/fixtures/seeded_violation/built
python site/gates/check_deployment_hostnames.py \
    --site site/gates/fixtures/seeded_violation/built --manifest docs/manifest.yaml
```

## Why this README is not inside `built/`

`built/` is handed to a gate as though it were a published site, and every file in it is
read. A README saying "this fixture is deliberately in breach" *inside* the tree would
itself be scanned, and the fixture would then be partly a control and partly its own
documentation — which is worse than useless, because the reason a gate fired would be
ambiguous. `tests/leakage/fixtures/README.md` keeps its documentation one level above the
bundles for exactly this reason, and this follows it.

## Why it does not turn the repository's own gates red

`scripts/check_forbidden_vocabulary.py` walks the tree on every build, and a fixture full
of forbidden nouns is the obvious way to turn that build red. It does not, and the reason
was already written down before this fixture existed: `_gate_lib.GATE_EXCLUSIONS` excludes
`site` from that gate, with the note that documentation must be able to discuss the
prohibition in order to state it, and that "excluding `site` here does not exempt it from"
PR-01, "which forbids customer, project and bid material in the published output". This
fixture sits under `site/`, so it is covered by a decision already taken and recorded — no
second mechanism was invented for it.

Two further things hold independently, and are noted because relying on one exclusion alone
would be relying on something that could be edited without anybody thinking about this
directory:

- `built/index.html` is `.html`, which appears in none of `_gate_lib`'s suffix lists, so no
  repository gate would read it whatever the exclusions said.
- `scripts/check_no_literal_paths.py` does read `.js` and `.py`. `built/assets/theme.js`
  therefore carries no path, and `make_fixture.py` carries the two it cannot avoid behind
  `harness:allow-literal-path` markers with reasons.

One inaccuracy worth not writing: those markers do **not** appear in the exemption
inventory `./scripts/gates.sh` prints. `_gate_lib.GATE_EXCLUSIONS["inventory"]` excludes
`site` along with the other documentation trees, so a marker under `site/` exempts a line
from the literal-path gate — which does read `site/` — without ever reaching the list a
reviewer reads. That is a real gap and it belongs to `_gate_lib`, not to this directory;
it is recorded here rather than quietly relied on.

## What is seeded, and which rule each thing is a control for

### `built/index.html`

| Where | Seeded | Control for |
|---|---|---|
| page prose | `j.doe@example.invalid` | `personal-identifier`, prose zone |
| page prose | `/home/jdoe/drogna/notes.txt` | `host-path`, prose zone |
| page prose | `203.0.113.7` | `address-literal` |
| `mailto:` link | `j.doe@example.invalid` | `personal-identifier`, reference zone |
| `href` | `https://drogna.invalid/console` | `declared-hostname` |
| inline `<script>` | `detection_id`, `tracklet` | `tracked-entity`, emitted zone |

`drogna.invalid` is not typed into either gate. It is what `config/droplet/deployment.json`
declares under `public_url.host` and `tls.hostname`, and `check_deployment_hostnames.py`
reads it from there. Change the destination's hostname and this fixture stops being a
control for it — which is the correct behaviour and is asserted by
`site/gates/tests/test_deployment_hostnames.py`.

### `built/assets/`

| File | Seeded | Control for |
|---|---|---|
| `theme.js` | `detection_id`, `tracklets` | `tracked-entity` in emitted script |
| `theme.css` | nothing | an emitted stylesheet to walk past |
| `sidecar.json` | a contact, a detection, a tracklet | `tracked-entity` in a published asset |
| `seeded-shot-vocabulary.png` | "A detection was recorded", "tracklet 4 closed" | `tracked-entity` in image text |
| `seeded-shot-address-bar.png` | `https://drogna.invalid/console` | `address-bar` in image text |
| `seeded-shot-host-path.png` | `$ cat /home/jdoe/drogna/notes.txt` | `host-path` in image text |
| `seeded-shot-email.png` | `From: j.doe@example.invalid` | `personal-identifier` in image text |

The last four are the specification's edge case in four pieces: *a screenshot that shows a
browser address bar, a terminal path, a window title, an editor tab or an email address*.
Nothing had ever read a published image before these existed.

## The images

Written by `make_fixture.py`, committed beside them, and **committed themselves**. A
control that regenerates itself is not a control: a gate that had quietly stopped reading
images would still pass against an image the same run had just produced, and the whole
point of a seeded violation is that it was there before the gate looked.

```sh
python site/gates/fixtures/seeded_violation/make_fixture.py   # needs Pillow
```

There is no random draw in that script, so there is nothing to seed (Constitution II): the
canvas, the colours, the font and the strings are fixed, and two runs on the same Pillow
produce the same bytes. Pillow's *bundled* default font is used rather than a system font,
so the output does not depend on which fonts a machine happens to carry.

The text is rendered at 32 point. At 28 the engine read `/home/` as `/nome/`, and the
host-path control silently stopped being a control for anything — a gate reporting nothing
because the fixture had become illegible is the same failure as a gate that stopped
looking. The size was raised until the text was legible; the strings themselves were not
touched to suit the reader. `test_vocabulary.py` asserts every one of these images still
OCRs to text, so an image that becomes unreadable is a test failure and not a quiet pass.

## No engine, no verdict

The image half of `check_vocabulary.py` needs an OCR engine. When there is none it exits
**2** and names `tesseract`; it never exits 0. This container had no engine until one was
installed, and CI may or may not have one — which is precisely the trap `CLAUDE.md`
records: something that skips locally and runs remotely is untested until the remote says
otherwise. So it does not skip. It refuses.
