import { describe, expect, it } from 'vitest';
import { parseReportTarget } from './report-target';

describe('parseReportTarget', () => {
  it('accepts one conversation target', () => {
    expect(parseReportTarget({ thread_id: 'thread-1' })).toEqual({
      kind: 'thread',
      id: 'thread-1',
    });
  });

  it('rejects missing and multiple targets', () => {
    expect(parseReportTarget({})).toBeNull();
    expect(parseReportTarget({ listing_id: 'listing-1', thread_id: 'thread-1' })).toBeNull();
  });

  it('accepts a Wanted post or Wanted offer as the sole report target', () => {
    expect(parseReportTarget({ wanted_post_id: 'p1' })).toEqual({
      kind: 'wanted_post',
      id: 'p1',
    });
    expect(parseReportTarget({ wanted_offer_id: 'o1' })).toEqual({
      kind: 'wanted_offer',
      id: 'o1',
    });
    expect(parseReportTarget({ wanted_post_id: 'p1', thread_id: 't1' })).toBeNull();
  });
});
