// @vitest-environment jsdom
/**
 * Feature 118: the welcome page as a reader meets it.
 *
 * The page is drawn from the configuration document and from nothing else, so these
 * assertions are written against the document rather than against a fixture: a situation
 * added, renamed or withdrawn in `run.json` shows up here without this file being
 * touched, which is the only way a card and its configuration can be held together.
 *
 * The disclaimer is checked because this page is now the first thing a visit sees, and
 * FR-007 says the statement that the data is synthetic is not something a face may
 * compact away.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import runConfigDocument from '../../config/run.json';
import type { ConfigRun } from '../generated/types.js';
import { Welcome } from './Welcome.js';

const config = runConfigDocument as ConfigRun;
const conditions = config.start_conditions;
const fallback = conditions.conditions.find((candidate) => candidate.id === conditions.default);
if (!fallback) throw new Error('the configured default names no condition');

afterEach(cleanup);

describe('the welcome page (feature 118)', () => {
  it('offers every configured situation, with what each run will hold', () => {
    render(<Welcome conditions={conditions} initial={fallback} onChoose={() => undefined} />);
    for (const condition of conditions.conditions) {
      const card = screen.getByRole('button', { name: new RegExp(condition.label, 'i') });
      expect(within(card).getByText(condition.situation)).toBeDefined();
      for (const held of condition.holds) {
        expect(within(card).getByText(held), `${condition.id} promises: ${held}`).toBeDefined();
      }
    }
  });

  it('says which one is the default, exactly once', () => {
    render(<Welcome conditions={conditions} initial={fallback} onChoose={() => undefined} />);
    const marks = screen.getAllByText('default');
    expect(marks).toHaveLength(1);
    const card = screen.getByRole('button', { name: new RegExp(fallback.label, 'i') });
    expect(within(card).getByText('default')).toBeDefined();
  });

  it('offers the condition it was handed as the one already selected', () => {
    const other = conditions.conditions.find((candidate) => candidate.id !== conditions.default);
    if (!other) throw new Error('there is only one condition to choose between');
    render(<Welcome conditions={conditions} initial={other} onChoose={() => undefined} />);
    expect(
      screen.getByRole('button', { name: new RegExp(other.label, 'i') }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: new RegExp(fallback.label, 'i') }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('hands back the condition that was pressed', () => {
    const chose = vi.fn();
    render(<Welcome conditions={conditions} initial={fallback} onChoose={chose} />);
    const target = conditions.conditions[conditions.conditions.length - 1];
    fireEvent.click(screen.getByRole('button', { name: new RegExp(target.label, 'i') }));
    expect(chose).toHaveBeenCalledTimes(1);
    expect(chose.mock.calls[0][0].id).toBe(target.id);
  });

  it('is reachable from the keyboard alone: every card is a real button', () => {
    // A div with an onClick looks identical in a screenshot and is unreachable by tab,
    // unreadable to a screen reader and inert under Enter. Each card is a <button>, and
    // that is the whole of the accessibility claim being made here.
    const chose = vi.fn();
    render(<Welcome conditions={conditions} initial={fallback} onChoose={chose} />);
    const cards = conditions.conditions.map((condition) =>
      screen.getByRole('button', { name: new RegExp(condition.label, 'i') }),
    );
    expect(cards.map((card) => card.tagName)).toEqual(conditions.conditions.map(() => 'BUTTON'));
    // Enter on a focused button is a click, which is exactly why it is one.
    cards[0].focus();
    expect(document.activeElement).toBe(cards[0]);
    fireEvent.click(cards[0]);
    expect(chose.mock.calls[0][0].id).toBe(conditions.conditions[0].id);
  });

  it('says so when the address asked for a situation this build does not offer', () => {
    render(
      <Welcome
        conditions={conditions}
        initial={fallback}
        unknownRequest="alongside"
        onChoose={() => undefined}
      />,
    );
    expect(screen.getByText(/is not a situation this build offers/)).toBeDefined();
    expect(screen.getByText('alongside')).toBeDefined();
  });

  it('draws the pre-roll it is told about, on the card it belongs to, and refuses a second press', () => {
    const chose = vi.fn();
    const target = conditions.conditions[1];
    render(
      <Welcome
        conditions={conditions}
        initial={fallback}
        preparing={{
          conditionId: target.id,
          note: 'the passage in',
          leg: 1,
          legs: target.legs.length,
          ticksDone: 1200,
          ticksTotal: 4800,
        }}
        onChoose={chose}
      />,
    );
    const card = screen.getByRole('button', { name: new RegExp(target.label, 'i') });
    // The whole reading, off the one live region, rather than a text match that would
    // find the note twice — once on its own span and once on the region containing it.
    const progress = within(card).getByRole('status');
    expect(progress.textContent).toContain(`leg 1 of ${target.legs.length}`);
    expect(progress.textContent).toContain('the passage in');
    expect(progress.textContent).toContain('1200 of 4800 ticks stepped');
    // Every card is disabled while one is preparing: a second choice mid-pre-roll would
    // build a second backend behind the first one.
    for (const condition of conditions.conditions) {
      expect(
        (screen.getByRole('button', { name: new RegExp(condition.label, 'i') }) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
    fireEvent.click(card);
    expect(chose).not.toHaveBeenCalled();
  });

  it('carries the synthetic-data statement, in full, before anything else is shown', () => {
    render(<Welcome conditions={conditions} initial={fallback} onChoose={() => undefined} />);
    expect(screen.getByText('synthetic throughout — holds no third-party entities')).toBeDefined();
  });
});
