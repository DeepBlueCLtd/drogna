/**
 * The chrome every downstream consumer view wears (FR-71, FR-73, ADR-0036).
 *
 * Three tabs in this shell are not part of drogna. They are notional systems consuming
 * its forecast to reach a decision, and the boundary is only defensible if it is visible
 * — so it is stated in three redundant ways, all of which survive a screenshot: the tab
 * is yellow (declared per view in configuration, drawn by the shell), the strip below
 * says what the tab is and does not scroll away, and every synthesised source inside
 * says on its own face that it was synthesised here.
 *
 * The frame is shared rather than copied so that a fourth consumer cannot be built
 * without it. The strip's words come from configuration: the sentence exists once.
 *
 * The freshness controls live here too, because the ceremony is the same in all three
 * tabs and a tab that implemented its own would be a tab that could quietly stop
 * implementing it.
 */
import type { ReactNode } from 'react';
import type { ConfigShell } from '../../generated/types.js';
import { displayInstant } from '../../shell/display.js';
import type { Freshness } from './basis.js';
import './consumers.css';

export interface ConsumerFrameProps {
  readonly config: ConfigShell;
  /** What decision this consumer supports, in one line, in its own words. */
  readonly summary: ReactNode;
  readonly freshness: Freshness;
  /** The run the ghosted answer was computed against, when one is on screen. */
  readonly ghostRunId?: string;
  readonly onDismissGhost?: () => void;
  readonly children: ReactNode;
  readonly testId: string;
}

export function ConsumerFrame({
  config,
  summary,
  freshness,
  ghostRunId,
  onDismissGhost,
  children,
  testId,
}: ConsumerFrameProps) {
  const { basis, pending, refusal } = freshness;
  return (
    <div className="panel consumer-panel" data-testid={testId} data-stale={pending !== undefined}>
      {/*
        Not dismissible, not scrollable, and outside the scrolling body on purpose: a
        screenshot taken from anywhere in this tab carries the caveat (FR-71).
      */}
      <p className="consumer-strip" role="note">
        {config.consumers.notice}
      </p>
      <div className="consumer-head">
        <p className="consumer-summary">{summary}</p>
        {/*
          Which of the two bases the answer stands on is stated rather than implied: a
          now-cast is what the store already holds and a forecast is a model run, and a
          reader who cannot tell them apart cannot judge the answer (basis.ts).
        */}
        <span className="consumer-provenance" data-testid={`${testId}-run`}>
          {basis
            ? `against ${basis.kind === 'nowcast' ? 'the now-cast' : 'forecast'} ${basis.identity}, published ${displayInstant(basis.since)}`
            : 'nothing served yet — nothing has been computed'}
        </span>
        {pending && (
          <button
            type="button"
            className="consumer-update"
            data-testid={`${testId}-update`}
            onClick={freshness.update}
          >
            New forecast available — update
          </button>
        )}
        {ghostRunId && onDismissGhost && (
          <button type="button" className="consumer-dismiss" onClick={onDismissGhost}>
            dismiss ghost of {ghostRunId}
          </button>
        )}
        {refusal && <span className="shell-refusal">{refusal}</span>}
      </div>
      <div className="consumer-body">{children}</div>
    </div>
  );
}

/**
 * A source's provenance, drawn on the source itself. Three values and three different
 * claims: served over the seam, computed by this view from something that was, or
 * synthesised here because drogna does not model it (ADR-0036).
 */
export function Provenance({ of }: { of: 'seam' | 'seam-derived' | 'synthesised' }) {
  const says = {
    seam: 'served over the seam',
    'seam-derived': 'derived here from what the seam served',
    synthesised: 'synthesised by this tab — drogna does not model it',
  }[of];
  return (
    <span className="consumer-source" data-provenance={of} title={says}>
      {of}
    </span>
  );
}
