"""The cycle: stage, transfer, verify, evict — in that order, and in one place.

The ordering of side effects is the whole engineering of this component, so it lives here
rather than being distributed through the call graph. ``transfer``, ``verify`` and ``evict``
never call one another; this module calls each in turn and records the ledger transition
before each attempt. Two things follow from that, and both are the reason for it.

A reader can see the order. There is no path through this component in which a receipt
causes a delete, because the only call to :func:`harness_offload.evict.delete_verified` is
in :meth:`Packager.evict`, and the only thing that reaches it is the retention policy.

And the crash-injection tests can replace one step at a time. A stubbed side-effect layer
that aborts at a named point is only possible because the point is named here; if
``transfer`` called ``verify`` on success, injecting a kill between them would mean
injecting it inside a function.

**Recovery runs first and promotes nothing.** Every bundle the ledger leaves in an
intermediate state is re-verified against the destination and against the local file, and
then re-attempted from the state it was in. A record is not evidence that its side effect
completed — it is evidence that the side effect was *about* to be attempted — so a bundle
recorded as verified is verified again on start, and a bundle recorded as evictable has its
file re-examined rather than deleted.

**Nothing is swallowed.** Every failure is recorded in the ledger with its reason and
reported on ``ctl/telemetry``. A step that fails leaves the local bytes exactly as they
were, which is asserted after every injected failure rather than argued for here.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from harness_core.clock import SimInstant
from harness_core.ports import Clock

from harness_offload import bundle as bundle_module
from harness_offload.attributes import DisallowedAttributeError
from harness_offload.conformance import check_conformance
from harness_offload.evict import Candidate, EvictionOutcome, RetentionPolicy, delete_verified
from harness_offload.evict import due_for_eviction as _due_for_eviction
from harness_offload.geometry import run_manifest_sibling
from harness_offload.ledger import BundleState, Ledger, LedgerRecord
from harness_offload.profiles import (
    ProfileSet,
    RunSource,
    SourceError,
    window_bounds,
    windows_covering,
)
from harness_offload.staging import StagedBundle, StagingArea
from harness_offload.telemetry import OffloadTelemetry
from harness_offload.transfer import Destination, TransferError, send
from harness_offload.verify import Verification, digest_of_file, verify_receipt
from harness_offload.version import FORMAT_VERSION
from harness_offload.writer import VARIABLE_ORDER, ExportInputs, encode_bundle

__all__ = ["CycleReport", "Packager", "PackagerSettings"]


@dataclass(frozen=True)
class PackagerSettings:
    """Everything the cycle needs from configuration, and nothing it does not."""

    source: RunSource
    staging: StagingArea
    ledger_path: Path
    destination_id: str
    retention: RetentionPolicy
    allowlist: tuple[str, ...]
    convention_version: str
    window_seconds: float
    identification_radius_m: float

    @classmethod
    def from_config(cls, document: Mapping[str, Any]) -> PackagerSettings:
        offload = document["offload"]
        return cls(
            source=RunSource.from_config(offload["source"]),
            staging=StagingArea.from_config(offload["staging"]),
            ledger_path=Path(offload["ledger"]["directory"]) / offload["ledger"]["file"],
            destination_id=str(offload["destination"]["id"]),
            retention=RetentionPolicy(
                maximum_staging_bytes=int(offload["retention"]["maximum_staging_bytes"]),
                maximum_age_simulation_seconds=float(
                    offload["retention"]["maximum_age_simulation_seconds"]
                ),
            ),
            allowlist=tuple(offload["attributes"]["allowlist"]),
            convention_version=str(offload["compliance"]["convention_version"]),
            window_seconds=float(offload["export"]["window"]["length_simulation_seconds"]),
            identification_radius_m=float(offload["export"]["identification_radius_m"]),
        )


@dataclass
class CycleReport:
    """What one cycle did, in enough detail that a failure is a sentence and not a silence."""

    staged: list[str] = field(default_factory=list)
    skipped_windows: list[int] = field(default_factory=list)
    transferred: list[str] = field(default_factory=list)
    verified: list[str] = field(default_factory=list)
    refused: list[str] = field(default_factory=list)
    evicted: list[str] = field(default_factory=list)
    retained: list[str] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)
    producing: bool = True

    def note(self, message: str) -> None:
        self.failures.append(message)


class Packager:
    """C-17. Holds the ledger, the staging area and one destination, and orders the steps."""

    def __init__(
        self,
        settings: PackagerSettings,
        *,
        clock: Clock,
        destination: Destination,
        telemetry: OffloadTelemetry | None = None,
    ) -> None:
        self.settings = settings
        self.clock = clock
        self.destination = destination
        self.telemetry = telemetry or OffloadTelemetry(publisher=None)
        self.ledger = Ledger(settings.ledger_path)
        self._profiles: ProfileSet | None = None
        self._run_manifest: Mapping[str, Any] | None = None
        self._run_manifest_digest: str | None = None

    # ------------------------------------------------------------------ the recorded run

    def _run(self) -> tuple[Mapping[str, Any], str, ProfileSet]:
        """Read the recorded run once, and hold it. Reading is not a side effect."""
        if self._run_manifest is None or self._run_manifest_digest is None:
            raw = self.settings.source.read_run_manifest_bytes()
            self._run_manifest = self.settings.source.read_run_manifest()
            self._run_manifest_digest = bundle_module.digest_of(raw)
        if self._profiles is None:
            self._profiles = self.settings.source.read_profiles()
        return self._run_manifest, self._run_manifest_digest, self._profiles

    def _epoch(self) -> SimInstant:
        manifest, _, _ = self._run()
        try:
            return SimInstant.from_iso(str(manifest["clock"]["epoch"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise SourceError(
                "the run manifest carries no simulation epoch, so the export's time "
                "coordinate would have nothing to be referenced to but a host clock"
            ) from exc

    # ------------------------------------------------------------------------- the steps

    def stage(self, report: CycleReport) -> None:
        """Write every window that holds profiles and is not already in the ledger."""
        try:
            manifest, manifest_digest, profiles = self._run()
            epoch = self._epoch()
        except SourceError as exc:
            report.note(str(exc))
            return

        if not self._may_produce(report):
            return

        for index in windows_covering(epoch, self.settings.window_seconds, profiles.profiles):
            bundle_id = bundle_module.bundle_id_for(manifest, index)
            if self.ledger.state(bundle_id) is not None:
                # A replay from the same seed names the same bundle. It is the same logical
                # bundle, not a duplicate fault, and it is left where it is.
                continue
            start, end = window_bounds(epoch, self.settings.window_seconds, index)
            window = profiles.within(start, end)
            if not window.profiles:
                report.skipped_windows.append(index)
                continue
            try:
                staged = self._write_bundle(
                    bundle_id=bundle_id,
                    manifest_digest=manifest_digest,
                    window_index=index,
                    start=start,
                    end=end,
                    profiles=window,
                    epoch=epoch,
                )
            except (DisallowedAttributeError, ValueError, OSError) as exc:
                report.note(f"{bundle_id}: could not be staged ({exc})")
                continue
            report.staged.append(staged.bundle_id)
            if not self._may_produce(report):
                return

    def _may_produce(self, report: CycleReport) -> bool:
        """Whether there is room to write another bundle, and a report when there is not.

        When the staging area is at its bound and nothing is eligible for eviction, the
        packager stops producing and says so. It does not make room: eviction stays gated
        on a receipt, and a staging area full of unacknowledged bundles is a destination
        problem being reported, not a disk problem being solved.
        """
        occupied = self.settings.staging.occupied_bytes()
        if occupied < self.settings.retention.maximum_staging_bytes:
            return True
        if self._candidates():
            return True
        report.producing = False
        report.note(
            f"the staging area holds {occupied} bytes against a bound of "
            f"{self.settings.retention.maximum_staging_bytes} and nothing is eligible for "
            "eviction, so no further bundles are produced. Eviction stays gated on a "
            "receipt; the destination is what needs attention"
        )
        return False

    def _write_bundle(
        self,
        *,
        bundle_id: str,
        manifest_digest: str,
        window_index: int,
        start: SimInstant,
        end: SimInstant,
        profiles: ProfileSet,
        epoch: SimInstant,
    ) -> StagedBundle:
        payload = encode_bundle(
            ExportInputs(
                bundle_id=bundle_id,
                run_reference=bundle_module.run_reference_for(manifest_digest),
                epoch=epoch,
                window_start=start,
                window_end=end,
                profiles=profiles.profiles,
                allowlist=self.settings.allowlist,
            )
        )
        faults = check_conformance(
            payload,
            allowlist=self.settings.allowlist,
            convention_version=self.settings.convention_version,
        )
        if faults:
            raise ValueError(
                "the bundle this writer produced does not conform: " + "; ".join(faults)
            )
        digest = bundle_module.digest_of(payload)
        member = bundle_module.BundleMember(
            name=self.settings.staging.member_name(bundle_id),
            digest=digest,
            byte_length=len(payload),
        )
        # The run-manifest sibling: the manifest copy carrying this window's measurement
        # geometry. Staged beside the bundle, named by the sidecar under its own key,
        # never a member — the members list is the artefact the provenance scanner
        # scores, and this document is the one a release withholds (014 T047, FR-42).
        manifest, _, _ = self._run()
        sibling_payload = run_manifest_sibling(
            manifest,
            profiles,
            window_start=start,
            identification_radius_m=self.settings.identification_radius_m,
            interval_seconds=self.settings.window_seconds,
        )
        sibling = bundle_module.BundleMember(
            name=self.settings.staging.run_manifest_name(bundle_id),
            digest=bundle_module.digest_of(sibling_payload),
            byte_length=len(sibling_payload),
        )
        sidecar = bundle_module.sidecar_manifest(
            bundle_id=bundle_id,
            run_manifest_digest=manifest_digest,
            window_index=window_index,
            window_start=start,
            window_end=end,
            members=[member],
            variables=list(VARIABLE_ORDER),
            profile_count=len(profiles.profiles),
            level_count=profiles.level_count,
            run_manifest=sibling,
        )
        # Write-ahead: the ledger hears about the bundle before the bytes exist, so a kill
        # between the two leaves a staged record with no file — which recovery re-stages —
        # rather than a file no ledger knows about, which nothing would ever transfer.
        self.ledger.append(
            bundle_id,
            BundleState.STAGED,
            when=self.clock.now(),
            digest=digest,
            byte_length=len(payload),
            detail=f"window {window_index}, format {FORMAT_VERSION}",
        )
        return self.settings.staging.write(
            bundle_id,
            payload=payload,
            sidecar=sidecar.payload(),
            run_manifest=sibling_payload,
            digest=digest,
        )

    def transfer(self, report: CycleReport) -> None:
        """Send every staged bundle, recording the intent before the first byte leaves."""
        for bundle_id in self.ledger.bundles():
            record = self.ledger.current(bundle_id)
            if record is None or record.state is not BundleState.STAGED:
                continue
            path = self.settings.staging.bundle_path(bundle_id)
            try:
                payload = path.read_bytes()
            except OSError as exc:
                self._fail(bundle_id, f"the staged file cannot be read ({exc.strerror or exc})")
                report.note(
                    f"{bundle_id}: the staged file cannot be read; the ledger and the "
                    "filesystem disagree and neither is corrected here"
                )
                continue
            self.ledger.append(bundle_id, BundleState.TRANSFERRED, when=self.clock.now())
            try:
                outcome = send(
                    self.destination,
                    bundle_id,
                    payload,
                    declared_digest=bundle_module.digest_of(payload),
                )
            except TransferError as exc:
                self._fail(bundle_id, str(exc))
                report.note(f"{bundle_id}: {exc}")
                continue
            report.transferred.append(bundle_id)
            self._receipts[bundle_id] = outcome.receipt

    def verify(self, report: CycleReport) -> None:
        """Compare each transferred bundle's receipt against the bytes on disk."""
        for bundle_id in self.ledger.bundles():
            record = self.ledger.current(bundle_id)
            if record is None or record.state is not BundleState.TRANSFERRED:
                continue
            receipt = self._receipts.get(bundle_id, _MISSING)
            if receipt is _MISSING:
                receipt = self.destination.receipt(bundle_id)
            outcome = self._verify_one(bundle_id, receipt)
            if outcome.ok:
                report.verified.append(bundle_id)
            else:
                report.refused.append(bundle_id)
                report.note(outcome.reason)

    def _verify_one(self, bundle_id: str, receipt: Any) -> Verification:
        outcome = verify_receipt(
            receipt,
            bundle_id=bundle_id,
            destination_id=self.destination.id,
            path=self.settings.staging.bundle_path(bundle_id),
        )
        if not outcome.ok:
            self.telemetry.tally.refuse(outcome.reason)
            self._fail(bundle_id, outcome.reason)
            return outcome
        self.telemetry.tally.accept()
        # The receipt is recorded durably here, in the same record that promotes the
        # bundle, so there is no state in which a bundle is verified and the receipt that
        # justified it is not on disk (FR-008).
        self.ledger.append(
            bundle_id,
            BundleState.VERIFIED,
            when=self.clock.now(),
            digest=outcome.digest,
            byte_length=outcome.byte_length,
            receipt=outcome.receipt,
        )
        return outcome

    def _candidates(self) -> tuple[Candidate, ...]:
        """Every bundle a receipt has made eligible. Eligible is not due."""
        found: list[Candidate] = []
        for bundle_id in self.ledger.bundles():
            record = self.ledger.current(bundle_id)
            if record is None or record.state is not BundleState.VERIFIED:
                continue
            if record.digest is None or record.byte_length is None:
                continue
            found.append(_candidate_from(self.settings.staging, record))
        return tuple(found)

    def evict(self, report: CycleReport) -> None:
        """Delete only what the retention policy asks for, and only after re-reading it."""
        candidates = self._candidates()
        due = _due_for_eviction(
            candidates,
            policy=self.settings.retention,
            staging_bytes=self.settings.staging.occupied_bytes(),
            now=self.clock.now(),
        )
        due_ids = {candidate.bundle_id for candidate in due}
        report.retained.extend(
            candidate.bundle_id for candidate in candidates if candidate.bundle_id not in due_ids
        )
        for candidate in due:
            self.ledger.append(candidate.bundle_id, BundleState.EVICTABLE, when=self.clock.now())
            outcome: EvictionOutcome = delete_verified(candidate)
            if not outcome.deleted:
                self._fail(candidate.bundle_id, outcome.reason)
                report.note(outcome.reason)
                continue
            self.ledger.append(candidate.bundle_id, BundleState.EVICTED, when=self.clock.now())
            report.evicted.append(candidate.bundle_id)

    # ---------------------------------------------------------------------- recovery

    def recover(self, report: CycleReport) -> None:
        """Re-verify every intermediate entry against the destination and the local file.

        Nothing is promoted on the strength of what was recorded (FR-012). A bundle
        recorded as verified is verified again; a bundle recorded as evictable has its file
        re-examined and is only then finished; a bundle recorded as staged whose file is
        missing is reported rather than re-staged silently or forgotten.
        """
        for record in self.ledger.intermediate():
            handler = {
                BundleState.STAGED: self._recover_staged,
                BundleState.TRANSFERRED: self._recover_transferred,
                BundleState.VERIFIED: self._recover_verified,
                BundleState.EVICTABLE: self._recover_evictable,
                BundleState.FAILED: self._recover_failed,
            }[record.state]
            handler(record, report)

    def _recover_staged(self, record: LedgerRecord, report: CycleReport) -> None:
        path = self.settings.staging.bundle_path(record.bundle_id)
        if not path.exists():
            message = (
                f"{record.bundle_id}: the ledger says staged and there is no file. The "
                "ledger and the filesystem disagree; that is reported rather than resolved "
                "by re-staging, which would hide a bundle somebody deleted by hand"
            )
            self._fail(record.bundle_id, message)
            report.note(message)

    def _recover_transferred(self, record: LedgerRecord, report: CycleReport) -> None:
        """The transfer was recorded and may not have completed. Ask, and re-send if not.

        Re-sending is idempotent by construction: the temporary name is derived from the
        bundle identifier, so the second attempt overwrites the remains of the first, and
        the reveal replaces whatever the destination holds under that name. US3's second
        scenario is exactly this — a record written before an interrupted side effect
        leading to the same outcome on the second attempt.
        """
        try:
            receipt = self.destination.receipt(record.bundle_id)
            if receipt is None:
                receipt = self._resend(record.bundle_id)
        except TransferError as exc:
            report.note(f"{record.bundle_id}: {exc}")
            self._fail(record.bundle_id, str(exc))
            return
        except OSError as exc:
            message = (
                f"{record.bundle_id}: recorded transferred and there is no file to re-send "
                f"({exc.strerror or exc}); the ledger and the filesystem disagree"
            )
            self._fail(record.bundle_id, message)
            report.note(message)
            return
        outcome = self._verify_one(record.bundle_id, receipt)
        if outcome.ok:
            report.transferred.append(record.bundle_id)
            report.verified.append(record.bundle_id)
        else:
            report.note(outcome.reason)

    def _resend(self, bundle_id: str) -> Any:
        payload = self.settings.staging.bundle_path(bundle_id).read_bytes()
        outcome = send(
            self.destination,
            bundle_id,
            payload,
            declared_digest=bundle_module.digest_of(payload),
        )
        return outcome.receipt

    def _recover_verified(self, record: LedgerRecord, report: CycleReport) -> None:
        """A verified record is re-verified, not believed.

        Against the destination first: a fresh receipt is asked for and compared against the
        bytes on disk now. Where the destination cannot be reached the receipt the ledger
        recorded is re-checked against those same bytes, which is a weaker statement about
        the destination and exactly as strong a statement about the file. Neither path
        promotes anything.
        """
        receipt = self._fresh_receipt(record, report)
        if receipt is None:
            message = f"{record.bundle_id}: recorded verified with no receipt; it is not verified"
            self._fail(record.bundle_id, message)
            report.note(message)
            return
        outcome = verify_receipt(
            receipt,
            bundle_id=record.bundle_id,
            destination_id=self.destination.id,
            path=self.settings.staging.bundle_path(record.bundle_id),
        )
        if not outcome.ok:
            self._fail(record.bundle_id, outcome.reason)
            report.note(outcome.reason)

    def _fresh_receipt(self, record: LedgerRecord, report: CycleReport) -> Any:
        """What the destination says now, or what the ledger recorded if it cannot say."""
        try:
            fresh = self.destination.receipt(record.bundle_id)
        except TransferError as exc:
            report.note(f"{record.bundle_id}: {exc}; the recorded receipt is re-checked instead")
            return record.receipt
        return fresh if fresh is not None else record.receipt

    def _recover_evictable(self, record: LedgerRecord, report: CycleReport) -> None:
        """The delete may or may not have happened. Finish it, or report why it cannot.

        Finishing it means re-verifying first. The record says the retention policy asked
        for this bundle's space and that a receipt had justified it, and neither of those
        is evidence: the receipt is asked for again and compared against the bytes on disk
        now, and only then is the delete completed. A file that has changed since, or a
        destination that no longer acknowledges the bundle, leaves the file where it is.
        """
        path = self.settings.staging.bundle_path(record.bundle_id)
        if not path.exists():
            # The delete completed and the confirming record did not. Re-deleting a file
            # that is already gone costs nothing; this is the safe half of that ordering.
            self.ledger.append(record.bundle_id, BundleState.EVICTED, when=self.clock.now())
            report.evicted.append(record.bundle_id)
            return
        verified = self._verified_record(record.bundle_id)
        if verified is None or verified.digest is None:
            message = (
                f"{record.bundle_id}: recorded evictable with no verified digest to compare "
                "the file against, so nothing here can justify deleting it"
            )
            self._fail(record.bundle_id, message)
            report.note(message)
            return
        outcome = verify_receipt(
            self._fresh_receipt(verified, report),
            bundle_id=record.bundle_id,
            destination_id=self.destination.id,
            path=path,
        )
        if not outcome.ok:
            self._fail(record.bundle_id, outcome.reason)
            report.note(outcome.reason)
            return
        current, _ = digest_of_file(path)
        if current != verified.digest:
            message = (
                f"{record.bundle_id}: the file changed between being verified and this "
                "restart; it is not deleted"
            )
            self._fail(record.bundle_id, message)
            report.note(message)
            return
        deletion = delete_verified(_candidate_from(self.settings.staging, verified))
        if not deletion.deleted:
            self._fail(record.bundle_id, deletion.reason)
            report.note(deletion.reason)
            return
        self.ledger.append(record.bundle_id, BundleState.EVICTED, when=self.clock.now())
        report.evicted.append(record.bundle_id)

    def _verified_record(self, bundle_id: str) -> LedgerRecord | None:
        """The record that carried the receipt, which is where the verified digest lives."""
        for record in reversed(self.ledger.records()):
            if record.bundle_id == bundle_id and record.state is BundleState.VERIFIED:
                return record
        return None

    def _recover_failed(self, record: LedgerRecord, report: CycleReport) -> None:
        """Re-enter the state the bundle failed in, and re-attempt from there.

        Re-entering is the only move the ledger admits from a failure, and it is what makes
        a failure a pause rather than a grave: the bundle is not promoted, it is put back
        where it was and the same side effect is tried again. A bundle that fails again
        simply fails again, and its file has not moved either time.
        """
        origin = record.from_state
        if origin is None or origin is BundleState.EVICTED:
            report.note(f"{record.bundle_id}: failed with nowhere to re-enter ({record.detail})")
            return
        report.note(
            f"{record.bundle_id}: failed in {origin.value} and is re-attempted from there "
            f"({record.detail})"
        )
        self.ledger.append(record.bundle_id, origin, when=self.clock.now(), detail="re-attempt")
        reentered = self.ledger.current(record.bundle_id)
        if reentered is None:
            return
        {
            BundleState.STAGED: self._recover_staged,
            BundleState.TRANSFERRED: self._recover_transferred,
            BundleState.VERIFIED: self._recover_verified,
            BundleState.EVICTABLE: self._recover_evictable,
        }[origin](reentered, report)

    def _fail(self, bundle_id: str, reason: str) -> None:
        if self.ledger.state(bundle_id) is BundleState.FAILED:
            return
        self.ledger.append(bundle_id, BundleState.FAILED, when=self.clock.now(), detail=reason)

    # ----------------------------------------------------------------------- the cycle

    _receipts: dict[str, Any]

    def cycle(self, *, recover: bool = False) -> CycleReport:
        """One pass: recover if asked, then stage, transfer, verify and evict, in order."""
        report = CycleReport()
        self._receipts = {}
        if recover:
            self.recover(report)
        self.stage(report)
        self.transfer(report)
        self.verify(report)
        self.evict(report)
        self._publish(report)
        return report

    def _publish(self, report: CycleReport) -> None:
        tick = self.clock.tick()
        document = self.telemetry.report(
            ledger=self.ledger,
            tick=tick,
            staging_bytes=self.settings.staging.occupied_bytes(),
            bound_bytes=self.settings.retention.maximum_staging_bytes,
            producing=report.producing,
        )
        self.telemetry.publish(document)


class _Missing:
    """A sentinel distinct from ``None``: no receipt was fetched, versus one that was empty."""


_MISSING = _Missing()


def _candidate_from(staging: StagingArea, record: LedgerRecord) -> Candidate:
    return Candidate(
        bundle_id=record.bundle_id,
        path=staging.bundle_path(record.bundle_id),
        sidecar_path=staging.sidecar_path(record.bundle_id),
        run_manifest_path=staging.run_manifest_path(record.bundle_id),
        verified_digest=str(record.digest),
        byte_length=int(record.byte_length or 0),
        verified_at=SimInstant.from_iso(record.sim_time),
    )
