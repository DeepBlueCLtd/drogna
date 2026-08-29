/**
 * The walkthrough covers the harness, and cannot quietly stop covering it (feature
 * 110). A tour that silently skipped a component would read as a complete tour, which
 * is worse than no tour at all — so the coverage is checked against the declared
 * component list rather than against a count.
 *
 * Both assertions were watched failing: a component dropped from the tour's copy, and
 * copy left behind for a component that no longer exists.
 */
import { describe, expect, it } from 'vitest';
import runConfigDocument from '../../../config/run.json';
import type { ConfigRun } from '../../generated/types.js';
import { componentTour, missingSteps } from './tour.js';

const config = runConfigDocument as unknown as ConfigRun;

describe('the walkthrough (feature 110)', () => {
  it('covers every declared component, and explains nothing that is not one', () => {
    expect(missingSteps(config.shell)).toEqual([]);
  });

  it('names the gap rather than counting it', () => {
    // A component with no step: the finding names which one, so the fix is obvious.
    const undeclared = {
      ...config.shell,
      components: [
        ...config.shell.components,
        { id: 'adaptive-sampling', label: 'Adaptive sampling', beat: 112, band: 'downstream', rank: 9 },
      ],
    } as ConfigRun['shell'];
    expect(missingSteps(undeclared)).toEqual([
      "the walkthrough has no step for 'adaptive-sampling'",
    ]);

    // And copy for something that is not a component is the other direction of the
    // same fault — the tour explaining a thing the harness does not have.
    const shrunk = {
      ...config.shell,
      components: config.shell.components.filter((component) => component.id !== 'platform'),
    } as ConfigRun['shell'];
    expect(missingSteps(shrunk)).toEqual([
      "the walkthrough explains 'platform', which is not a declared component",
    ]);
  });

  it('walks the components in the order the picture draws them', () => {
    const tour = componentTour(config.shell);
    const componentSteps = tour.steps.filter((step) => step.component);
    expect(componentSteps.map((step) => step.component)).toEqual(
      config.shell.components.map((component) => component.id),
    );
    // An opening and a closing step, either side of the components.
    expect(tour.steps[0].component).toBeUndefined();
    expect(tour.steps.at(-1)?.component).toBeUndefined();
    expect(tour.view).toBe('operator');
  });

  it('teaches, and never asserts live state', () => {
    const tour = componentTour(config.shell);
    for (const step of tour.steps) {
      const prose = `${step.what} ${step.panel}`;
      // Constitution VII is not engaged by teaching (feature 111's precedent), and
      // stays that way only while the copy never claims a PARTICULAR component's live
      // state. The pattern is deliberately narrow: "a node is lit only because a
      // heartbeat arrived" is the rule being taught and must stay sayable, while "it
      // is running" is the display asserting something nothing published. The first
      // draft of this check forbade both and flagged the honest sentence, which is how
      // the difference got stated rather than assumed.
      expect(prose).not.toMatch(
        /\bit is (running|lit|alive|stopped|beating)\b|\bcurrently\b|\bright now\b|\bhas published \d|\bis at present\b/i,
      );
      expect(step.what.length).toBeGreaterThan(60);
      expect(step.panel.length).toBeGreaterThan(40);
    }
  });
});
