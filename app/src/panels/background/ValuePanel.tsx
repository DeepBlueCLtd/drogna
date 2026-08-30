/**
 * The closing beat every explainer shares (FR-008, FR-020): headed Consequences,
 * in the same position, with the same three axes in the same order.
 *
 * The order and the headings come from VALUE_AXES, not from the explainer, so
 * "same position, same order" is a property of this component rather than of ten
 * authoring decisions that could each drift. An axis carrying little weight is
 * omitted **with its reason rendered** — an empty box is never padded and never
 * blank. It reports consequences, so an axis is free to record a cost.
 */
import type { ReactNode } from 'react';
import { VALUE_AXES, type ValueContent } from './model.js';

export function ValuePanel({ value }: { value: ValueContent }): ReactNode {
  return (
    <div className="bg-value" data-testid="value-panel">
      <h3>Consequences</h3>
      <div className="bg-axes">
        {VALUE_AXES.map((axis) => {
          const content = value[axis];
          return (
            <section
              key={axis}
              className={content.kind === 'omitted' ? 'bg-axis bg-axis-omitted' : 'bg-axis'}
              data-axis={axis}
              data-axis-state={content.kind}
            >
              <h4>{axis}</h4>
              {content.kind === 'filled' ? (
                <p>
                  {content.body}
                  {content.qualitative ? (
                    // FR-009: the mark is part of the claim, not a footnote to it.
                    <span className="bg-unmeasured"> Argued, not measured.</span>
                  ) : null}
                </p>
              ) : (
                <p className="bg-omitted-reason" data-omitted-reason={content.reason}>
                  <em>Little to say here.</em> {content.reason}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
