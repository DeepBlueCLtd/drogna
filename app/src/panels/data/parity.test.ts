/**
 * The Holdings parity check (feature 115, T022, SC-03) — **written before the timeline
 * it holds**, on the interview's condition: the licence to replace the inventory table
 * was conditional on this passing, and if it could not be satisfied the table stayed and
 * the reason went into `tasks.md`. A verification written after the display is one this
 * repository has already watched get squeezed.
 *
 * **The bound is `coverage-holding.schema.json`, not the table's five columns.** The
 * columns were one author's choice; the master is the authority, it is amended rather
 * than casually rewritten, and a bound read from disk survives a holding gaining a field
 * (CLAUDE.md, lesson 2). So the check enumerates what the master declares and requires
 * every property to be either announced or exempted with a reason. A field added to the
 * master is in neither list, and the check names it.
 *
 * Planted and watched: `retention_ticks` was added to the master, `pnpm generate` run,
 * and this check failed naming the property and the timeline. Reverted, and said so in
 * the commit message.
 *
 * The rendered half of the check — that the announcements reach the document and that
 * every holding is focusable in publication order — is in `holdings.test.tsx`, which has
 * a live backend to draw holdings from. This file is the part that can be held to the
 * master alone, and it is the part that was written first.
 */
import { describe, expect, it } from 'vitest';
import { schemaDocuments } from '../../generated/schema-documents.js';
import type { CoverageHolding } from '../../generated/types.js';
import { announceHolding, announcementLabel, NOT_ANNOUNCED } from './announce.js';
import { ERA_CAPTION, ERAS } from './HoldingsTimeline.js';

const master = schemaDocuments['coverage-holding'] as {
  properties: Record<string, unknown>;
  required: string[];
};

/** A holding shaped as the master requires, for the announcement to be read off. */
const holding = {
  schema_version: 1,
  holding_id: 'nowcast-0004',
  era: 'nowcast',
  run_id: 'loiter-abc123',
  published_at: { sim_time: '2026-01-01T06:00:00.000000Z', tick: 21600 },
  field: {
    format: 'drogna-f32-v1',
    sha256: `sha256:${'9f3c1a0b74e2'.padEnd(64, '0')}`,
    byte_length: 129024,
  },
  manifest: {
    grid: {
      longitude: { minimum: -2, maximum: -1, count: 24, spacing: 0.04, units: 'degrees_east', direction: 'east' },
      latitude: { minimum: 50, maximum: 51, count: 24, spacing: 0.04, units: 'degrees_north', direction: 'north' },
      depth: { minimum: 0, maximum: 350, count: 8, spacing: 50, units: 'm', direction: 'down' },
      time: {
        origin_sim_time: '2026-01-01T00:00:00.000000Z',
        start_offset_seconds: 0,
        step_seconds: 3600,
        count: 7,
        units: 'seconds since origin',
      },
    },
  },
} as unknown as CoverageHolding;

describe('the timeline announces what the master declares (T022, SC-03)', () => {
  it('announces or exempts every property the master declares, and nothing else', () => {
    const declared = Object.keys(master.properties).sort();
    const announced = announceHolding(holding).map((entry) => entry.property);
    const covered = [...new Set([...announced, ...Object.keys(NOT_ANNOUNCED)])].sort();
    // Named rather than counted. A count would say "five of six" and leave a reader to
    // work out which one, which is the failure mode this whole habit exists against.
    const unannounced = declared.filter((property) => !covered.includes(property));
    expect(
      unannounced,
      `coverage-holding.schema.json declares ${unannounced.join(', ')}, which the Holdings timeline neither announces nor exempts with a reason`,
    ).toEqual([]);
    const invented = covered.filter((property) => !declared.includes(property));
    expect(
      invented,
      `the Holdings timeline announces ${invented.join(', ')}, which coverage-holding.schema.json does not declare`,
    ).toEqual([]);
  });

  it('every exemption carries a reason, because an exemption without one is an omission', () => {
    for (const [property, reason] of Object.entries(NOT_ANNOUNCED)) {
      expect(reason.length, `the exemption for '${property}' carries no reason`).toBeGreaterThan(20);
    }
  });

  it('every announcement carries a value: an empty announcement announces nothing', () => {
    for (const entry of announceHolding(holding)) {
      expect(entry.text.length, `'${entry.property}' announced nothing`).toBeGreaterThan(0);
      expect(entry.label.length).toBeGreaterThan(0);
    }
  });

  it('carries the five facts the table carried, in the table’s own terms', () => {
    // Parity with what is being replaced, stated as the five things a reader could read
    // off the inventory table before this feature: era, identifier, publication instant,
    // grid shape, field digest.
    const label = announcementLabel(holding);
    expect(label).toContain('nowcast');
    expect(label).toContain('nowcast-0004');
    expect(label).toContain('2026-01-01T06:00:00Z');
    expect(label).toContain('24×24×8×7');
    // The digest as the twelve-character fingerprint the table showed — parity needs no
    // argument because it is the same string — and never sixty-four characters read out.
    expect(label).toContain('9f3c1a0b74e2');
    expect(label).not.toContain(holding.field.sha256.slice(7));
  });

  it('announces the interval the holding covers, which is what the table could not', () => {
    const label = announcementLabel(holding);
    expect(label).toContain('2026-01-01T00:00:00Z to 2026-01-01T06:00:00Z');
    expect(label).toContain('6 hours');
  });

  it('claims no interval where the time axis cannot be read, rather than inventing one', () => {
    const broken = JSON.parse(JSON.stringify(holding)) as CoverageHolding;
    (broken.manifest.grid.time as { step_seconds: number }).step_seconds = 0;
    const covers = announceHolding(broken).find((entry) => entry.property === 'manifest');
    expect(covers?.text).toContain('could not be read');
    expect(covers?.text).toContain('24×24×8×7');
  });
});

describe('every era the master declares has a lane to be drawn on (feature 120)', () => {
  /**
   * The fault this was written for, found by feature 120 and real before it: the lane
   * list was three literals, feature 116 added the `analysis` era, and the line did not
   * follow — so an analysis holding was drawn on no lane at all and nothing said so.
   *
   * The parity check above did not catch it, and could not: it is bounded by the
   * master's *properties*, and a store with no analysis in it draws the same picture
   * either way. This is the era half of the same idea, and it is held to the same
   * authority — the master, on disk, not a list typed alongside the display.
   */
  const declared = (master.properties.era as { enum: string[] }).enum;

  it('draws a lane for each, in the order the master declares them', () => {
    expect([...ERAS]).toEqual(declared);
  });

  it('names every lane it draws, so no era arrives captioned by its own id alone', () => {
    for (const era of declared) {
      expect(ERA_CAPTION[era], `no caption for the '${era}' era`).toBeTruthy();
    }
  });
});
