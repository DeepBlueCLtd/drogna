import { describe, expect, it } from 'vitest';
import { topicMatchesFilter } from './topic-match.js';

describe('front-end filter matching (contract copy)', () => {
  it('agrees with the wire vocabulary on the cases the panels use', () => {
    expect(topicMatchesFilter('#', 'ctl/clock')).toBe(true);
    expect(topicMatchesFilter('ctl/heartbeat', 'ctl/heartbeat')).toBe(true);
    expect(topicMatchesFilter('ctl/+', 'ctl/clock')).toBe(true);
    expect(topicMatchesFilter('ctl/+', 'ctl/boundary/denial')).toBe(false);
    expect(topicMatchesFilter('obs/#', 'ctl/clock')).toBe(false);
  });
});
