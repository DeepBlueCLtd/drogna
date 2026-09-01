/**
 * One presentation for everything a reader can do to a component (feature 121).
 *
 * Before this the drawer's actions were four different shapes in four different files,
 * arrived at one feature at a time, and all of them were *below* the account: the
 * prompts under the instrument, the stop and start under the wire list, at the bottom
 * of a card that on a phone is several screens long. The thing a reader came to press
 * was the last thing they reached.
 *
 * So the rule is one line: **the buttons come first, together, at a size a thumb can
 * hit, and the prose that explains them is one labelled gesture away.** A button's
 * description has not been dropped — it is required, and it is where a reader who wants
 * it will look — but a paragraph under every button is what made the card long enough
 * to bury the buttons under it.
 *
 * The disclosure is collapsed at every width, not only narrow. That is a decision about
 * this content rather than about the viewport: the descriptions say what a control does
 * *before* you have used it, and a reader who has used it once wants the row and not the
 * paragraphs. Feature 112's `Disclosure` renders an open section above the threshold, so
 * this asks for the narrow shape unconditionally and says here that it means it.
 *
 * What a control *said* stays with the row, always, because that is the answer to the
 * press and answers are never disclosed.
 */
import type { ReactNode } from 'react';

export interface Action {
  readonly id: string;
  readonly label: string;
  /** What it does, and what a refusal from it would mean. Never optional. */
  readonly description: string;
  /** What the component or the seam said back, if anything has been asked yet. */
  readonly said?: { readonly text: string; readonly refused: boolean };
  /** Attributes the button carries for the tests and the capture proofs. */
  readonly attributes?: Readonly<Record<string, string>>;
  run(): void | Promise<void>;
}

export function Actions({
  heading,
  actions,
  children,
  testId,
}: {
  /** Names what this group of actions is for; never "actions", never "more". */
  heading: string;
  readonly actions: readonly Action[];
  /** Anything that belongs with the group but is not a button — a footnote, a form. */
  children?: ReactNode;
  testId: string;
}) {
  if (actions.length === 0 && !children) return null;
  return (
    <div className="flow-actions" data-testid={testId}>
      <h4>{heading}</h4>
      <div className="flow-action-row">
        {actions.map((action) => (
          <button
            key={action.id}
            className="flow-action"
            onClick={() => void action.run()}
            title={action.description}
            {...(action.attributes ?? {})}
          >
            {action.label}
          </button>
        ))}
      </div>
      {actions.some((action) => action.said) ? (
        <div className="flow-action-said">
          {actions
            .filter((action) => action.said)
            .map((action) => (
              <p
                key={action.id}
                className="flow-demand-said"
                data-action-said={action.id}
                data-action-refused={action.said?.refused}
              >
                <b>{action.label}:</b> {action.said?.refused ? 'refused — ' : ''}
                {action.said?.text}
              </p>
            ))}
        </div>
      ) : null}
      {children}
      {actions.length > 0 ? (
        <details className="disclosure flow-action-notes" data-label={`what ${heading} does`}>
          <summary>what these do</summary>
          <div className="disclosure-body">
            <dl>
              {actions.map((action) => (
                <div key={action.id} data-action-note={action.id}>
                  <dt>{action.label}</dt>
                  <dd>{action.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </details>
      ) : null}
    </div>
  );
}
