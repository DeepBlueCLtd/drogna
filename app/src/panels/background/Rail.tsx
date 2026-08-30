/**
 * The numbered course rail (FR-021): all eleven explainers, their course positions
 * **and their lengths**, so a viewer knows what they are starting before they start
 * it. Course order is fixed (FR-002); the rail shows position in it, and never
 * offers to rearrange it.
 *
 * Below a width threshold it collapses to a dropdown with previous and next. There
 * is deliberately no curated short path: dip-in already works and the lengths are
 * shown, so a second navigation surface would be built, tested and kept addressable
 * for a viewer who can simply choose.
 */
import type { ReactNode } from 'react';
import { stepCount, type Explainer } from './model.js';

/** Below this the rail is a dropdown. Wide enough for the longest title plus its length. */
export const RAIL_WIDTH_THRESHOLD = 560;

export interface RailProps {
  readonly course: readonly Explainer[];
  readonly current: string;
  readonly onSelect: (explainerId: string) => void;
  readonly width: number | undefined;
}

export function Rail({ course, current, onSelect, width }: RailProps): ReactNode {
  const index = course.findIndex((explainer) => explainer.id === current);
  const collapsed = width !== undefined && width < RAIL_WIDTH_THRESHOLD;

  if (collapsed) {
    return (
      <nav className="bg-rail bg-rail-collapsed" aria-label="the course" data-collapsed="true">
        <button
          type="button"
          onClick={() => onSelect(course[index - 1].id)}
          disabled={index <= 0}
          aria-label="previous explainer"
        >
          ↑
        </button>
        <select
          value={current}
          aria-label="the course"
          onChange={(event) => onSelect(event.target.value)}
        >
          {course.map((explainer, position) => (
            <option key={explainer.id} value={explainer.id}>
              {position + 1} · {explainer.title} · {stepCount(explainer)} steps
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onSelect(course[index + 1].id)}
          disabled={index < 0 || index >= course.length - 1}
          aria-label="next explainer"
        >
          ↓
        </button>
      </nav>
    );
  }

  return (
    <nav className="bg-rail" aria-label="the course" data-collapsed="false">
      <h2>The course</h2>
      <ol>
        {course.map((explainer, position) => (
          <li key={explainer.id}>
            <button
              type="button"
              className={explainer.id === current ? 'bg-rail-current' : undefined}
              aria-current={explainer.id === current ? 'step' : undefined}
              data-explainer={explainer.id}
              onClick={() => onSelect(explainer.id)}
            >
              <span className="bg-rail-number">{position + 1}</span>
              <span className="bg-rail-title">{explainer.title}</span>
              <span className="bg-rail-length">{stepCount(explainer)}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="bg-rail-foot">
        The right-hand number is the explainer&rsquo;s length in steps. Read them in order
        and the argument builds; read one on its own and it still stands.
      </p>
    </nav>
  );
}
