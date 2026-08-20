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
});
