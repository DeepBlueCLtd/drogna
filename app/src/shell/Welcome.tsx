/**
 * The welcome page (feature 120, FR-104): the situation a visit begins in, chosen before
 * the shell is mounted.
 *
 * Until this landed every visit began in the same place — a cold run with the archive
 * and a now-cast and nothing else — and the parts of the harness that only mean anything
 * once there is data to work on could be reached only by leaving the page running.
 * Four situations are offered instead, and each of them is a claim: the card says what
 * the run will hold, and the pre-roll behind it is what makes the claim true.
 *
 * This is a face and nothing more. It knows the conditions because they are configuration
 * handed to it, it reports which one was chosen, and it draws whatever progress the
 * caller gives it. It does not run the pre-roll, does not build a backend, and does not
 * know that either exists — the composition root does all of that (Constitution VII, and
 * the same rule the Operator tab lives under).
 *
 * The disclaimer is here for the reason it is in the shell's header: the statement that
 * the data is synthetic may not be behind a click, and this page is now the first thing a
 * reader sees (FR-007).
 */
import { useState } from 'react';
import type { ConfigStartConditions, ConfigStartConditionsCondition } from '../generated/types.js';
import './shell.css';

/** What the caller knows about a pre-roll in flight, in the terms this page draws. */
export interface WelcomePreparation {
  readonly conditionId: string;
  /** The leg's own note — what is happening, not how far through it is. */
  readonly note: string;
  readonly leg: number;
  readonly legs: number;
  readonly ticksDone: number;
  readonly ticksTotal: number;
}

export interface WelcomeProps {
  readonly conditions: ConfigStartConditions;
  /** Which card is offered first: the default, or whatever the address named. */
  readonly initial: ConfigStartConditionsCondition;
  /**
   * Set when the address named a condition that does not exist. Said rather than
   * silently corrected: a link that has gone stale is a thing the reader wants to know
   * about, and a page that quietly showed them something else would hide it.
   */
  readonly unknownRequest?: string;
  readonly preparing?: WelcomePreparation;
  readonly onChoose: (condition: ConfigStartConditionsCondition) => void;
}

export function Welcome({ conditions, initial, unknownRequest, preparing, onChoose }: WelcomeProps) {
  const [selected, setSelected] = useState(initial.id);
  const busy = preparing !== undefined;

  return (
    <div className="shell welcome">
      <header className="shell-header">
        <span className="shell-title">drogna</span>
        <span className="shell-disclaimer">synthetic throughout — holds no third-party entities</span>
      </header>
      <div className="welcome-body">
        <h1 className="welcome-heading">Where does this visit begin?</h1>
        <p className="welcome-lede">
          Each situation runs the same machinery from a different point in the same
          passage. What a card promises is authored by the components that author it —
          the platform moves, the instruments sample, the loop turns — before the console
          opens, so the run you arrive in is one that genuinely happened.
        </p>
        {unknownRequest !== undefined && (
          <p className="shell-refusal welcome-refusal">
            the address asked to start in <code>{unknownRequest}</code>, which is not a
            situation this build offers
          </p>
        )}
        <ul className="welcome-cards">
          {conditions.conditions.map((condition) => {
            const chosen = condition.id === selected;
            const running = preparing?.conditionId === condition.id;
            return (
              <li key={condition.id}>
                <button
                  type="button"
                  className="welcome-card"
                  aria-pressed={chosen}
                  disabled={busy}
                  onClick={() => {
                    setSelected(condition.id);
                    onChoose(condition);
                  }}
                >
                  <span className="welcome-card-head">
                    <span className="welcome-card-label">{condition.label}</span>
                    {condition.id === conditions.default && (
                      <span className="welcome-card-default">default</span>
                    )}
                  </span>
                  <span className="welcome-card-situation">{condition.situation}</span>
                  <span className="welcome-card-holds-label">the run will hold</span>
                  <ul className="welcome-card-holds">
                    {condition.holds.map((held) => (
                      <li key={held}>{held}</li>
                    ))}
                  </ul>
                  {running && preparing && (
                    <span className="welcome-progress" role="status">
                      <span className="welcome-progress-note">
                        leg {preparing.leg} of {preparing.legs} — {preparing.note}
                      </span>
                      <span className="welcome-progress-track">
                        <span
                          className="welcome-progress-fill"
                          style={{
                            width: `${
                              preparing.ticksTotal === 0
                                ? 100
                                : Math.round((preparing.ticksDone / preparing.ticksTotal) * 100)
                            }%`,
                          }}
                        />
                      </span>
                      <span className="welcome-progress-figure">
                        {preparing.ticksDone} of {preparing.ticksTotal} ticks stepped
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="welcome-footnote">
          The choice travels in the address as <code>?start=&lt;id&gt;</code>, so a link
          can name both a situation and a tab. A link that names a tab and no situation
          opens the default one without asking.
        </p>
      </div>
    </div>
  );
}
