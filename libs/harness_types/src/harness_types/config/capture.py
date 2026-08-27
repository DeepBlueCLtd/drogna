# DO NOT EDIT.
# Generated from contracts/schemas/config.capture.schema.json by scripts/generate_types.sh.
# Edit the master and run that script; scripts/check_types_drift.sh fails the build on a hand edit.

from __future__ import annotations

from enum import StrEnum

from pydantic import AnyUrl, BaseModel, ConfigDict, Field


class Client(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    url: AnyUrl = Field(
        ...,
        description='Where the client is served. A capture that cannot reach it fails naming this value, so the message points at configuration rather than at a literal in a script.',
    )
    readiness_timeout_ms: int = Field(
        ...,
        description="How long a mechanism waits for the client's readiness signal before reporting that readiness never arrived. A bound on a wait, not a wait: no capture path contains a fixed sleep (FR-019, SC-011).",
        gt=0,
    )
    stable_frames: int = Field(
        ...,
        description='How many consecutive animation frames must render identical markup before the page is called settled. Counted in frames the application itself produced, which is why this is a readiness signal and not a delay dressed as one.',
        gt=0,
    )
    maximum_frames: int = Field(
        ...,
        description='The largest number of frames the settle check will watch before giving up. The bound is a frame count rather than a duration so that the check reads no clock of any kind.',
        gt=0,
    )


class Viewport(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    width: int = Field(..., description='Viewport width in CSS pixels.', gt=0)
    height: int = Field(..., description='Viewport height in CSS pixels.', gt=0)
    device_scale_factor: float = Field(
        ...,
        description='Device pixels per CSS pixel. A pair whose halves were captured at different scale factors is refused rather than diffed (FR-009).',
        gt=0.0,
    )


class Name(StrEnum):
    chromium = 'chromium'


class Browser(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    name: Name = Field(
        ...,
        description='The browser the captures run in. One, because a second would double the number of ways two curated images could differ without anything having changed.',
    )
    playwright_version: str = Field(
        ...,
        description='The Playwright release whose bundled browser build is expected. It fixes the browser build, and the capture reports the browser version it actually got so that the two can be compared.',
        pattern='^[0-9]+\\.[0-9]+\\.[0-9]+$',
    )
    container_image: str = Field(
        ...,
        description='The image a capture runs in when it runs in a container, recorded in the fingerprint so that a pair assembled from one local half and one containerised half is refused (FR-010). Empty where captures at this destination are not containerised.',
    )


class Areas(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    glance: str = Field(
        ...,
        description='Session-scoped area for glances. Lifetime: the session. No retention rule, no review gate, never committed (FR-004).',
    )
    pair: str = Field(
        ...,
        description='Branch-scoped area for before/after pairs and their differences. Lifetime: the branch (FR-012).',
    )
    curated_review: str = Field(
        ...,
        description='Where curated candidates and their provenance records wait for a person to look at them. The curated mechanism commits nothing itself (FR-013).',
    )
    published: str = Field(
        ...,
        description='The published-screenshot location feature 015 defines. A person moves a reviewed candidate here; no capture mechanism writes into it.',
    )


class Scenario(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    seed: int = Field(
        ...,
        description="The root seed this destination's scenario is started from, matching seed.root in the same destination's component configurations.",
    )


class Pair(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    retention_days: int = Field(
        ...,
        description='How long a pair survives as a CI artefact. Declared rather than left to a default, because the retention rule is one of the things the three mechanisms must not share.',
        gt=0,
    )
    difference_threshold: float = Field(
        ...,
        description='Per-pixel colour distance below which two pixels are called the same, as pixelmatch reads it.',
        ge=0.0,
        le=1.0,
    )
    maximum_differing_pixels: int = Field(
        ...,
        description='How many differing pixels a no-change pair may carry and still be called empty. Zero is the value a pinned client should meet, and it is the value that makes SC-003 mean something; a destination that has to raise it has a frame-varying display to explain first.',
        ge=0,
    )


class Curated(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    maximum_bytes: int = Field(
        ...,
        description='The size budget for one candidate. A curated run refuses a candidate above it, before anyone can commit several megabytes of picture to a repository that keeps them for ever.',
        gt=0,
    )
    pin_clock: bool = Field(
        ...,
        description='Whether the curator pins the clock for a curated shot. The curated mechanism decides this for itself, on its own grounds — a regenerable shot — and not because the pair does it.',
    )
    masked_selectors: list[str] = Field(
        ...,
        description='Selectors painted over before a curated image is written, for anything that legitimately varies or that could name a deployment host (FR-017). Masking is the second line; capturing the viewport only rather than the browser window is the first.',
    )


class DrognaVisualCaptureConfiguration(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    client: Client = Field(
        ...,
        description='Where the browser client is served at this destination, and how patient a capture is with it. No mechanism starts the client: a capture observes what is running.',
        title='The running client',
    )
    viewport: Viewport = Field(
        ...,
        description='One viewport and one device scale factor per destination. FR-015 asks the whole blog to share them so that the published pictures read as one publication, and FR-009 makes them part of what two halves of a pair must agree on before a difference between them means anything.',
        title='The window every capture is taken through',
    )
    browser: Browser = Field(
        ...,
        description='An unpinned browser makes two captures taken on different machines incomparable for reasons that look like the change under evidence. The pin is recorded here and carried in every pair fingerprint, so a drifted pin becomes a named refusal rather than an unexplained difference.',
        title='The pinned browser',
    )
    areas: Areas = Field(
        ...,
        description="Repository-relative locations, disjoint by construction and asserted disjoint by test (FR-001, FR-022). The first three are git-ignored and have three different lifetimes; the fourth is feature 015's published-screenshot location and is the only capture output tracked by git (FR-014).",
        title='Three output areas, and the published one',
    )
    scenario: Scenario = Field(
        ...,
        description='What a capture must record to be repeatable. The seed is declared here because it is what the run was started from and lives in the run manifest rather than on the page; the run identifier the client displays is observed alongside it, so a capture taken against a different run than the one declared is visible in the fingerprint rather than invisible in the pixels (Constitution II, FR-016).',
        title='Which run is being captured',
    )
    pair: Pair = Field(
        ...,
        description='Settings that belong to the pair alone. Only the pair is a comparison, and only a comparison needs the clock pinned (FR-53, FR-007).',
        title='The comparison mechanism',
    )
    curated: Curated = Field(
        ...,
        description='Settings that belong to the curated capture alone: the only durable artefact, the only one with a review gate, and the only one whose output reaches the public (PR-01, FR-013 to FR-017).',
        title='The published mechanism',
    )
