import { describe, expect, it } from 'vitest';
import { isCurrentWantedRequest } from './wantedRequestState';

describe('Wanted request generations', () => {
  it('rejects a response as soon as visible filters advance', () => {
    expect(isCurrentWantedRequest({ generation: 2 }, { generation: 1 })).toBe(false);
  });

  it('rejects stale pagination even when its cursor matches again', () => {
    expect(isCurrentWantedRequest({ generation: 3, direction: 'sent', cursor: 'same' }, { generation: 2, direction: 'sent', cursor: 'same' })).toBe(false);
    expect(isCurrentWantedRequest({ generation: 3, direction: 'sent', cursor: 'same' }, { generation: 3, direction: 'received', cursor: 'same' })).toBe(false);
  });
});
