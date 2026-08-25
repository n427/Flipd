import { describe, it, expect } from 'vitest';
import { parentOf } from './parentOf';

describe('parentOf', () => {
  it('sends a listing back to the feed', () => {
    expect(parentOf('/listing/abc123')).toBe('/(tabs)/feed');
  });

  it('sends a conversation back to requests', () => {
    expect(parentOf('/messages/thread-1')).toBe('/(tabs)/requests');
  });

  it('sends a public profile back to the feed', () => {
    expect(parentOf('/u/user-9')).toBe('/(tabs)/feed');
  });

  it('sends profile sub-screens back to profile', () => {
    expect(parentOf('/saved')).toBe('/(tabs)/profile');
    expect(parentOf('/reviews')).toBe('/(tabs)/profile');
    expect(parentOf('/my-listings')).toBe('/(tabs)/profile');
    expect(parentOf('/edit-profile')).toBe('/(tabs)/profile');
  });

  it('sends legal pages back to profile', () => {
    expect(parentOf('/terms')).toBe('/(tabs)/profile');
    expect(parentOf('/privacy')).toBe('/(tabs)/profile');
    expect(parentOf('/support')).toBe('/(tabs)/profile');
  });

  it('ignores a query string', () => {
    expect(parentOf('/listing/abc123?ref=push')).toBe('/(tabs)/feed');
  });

  it('sends Wanted details and forms back to the Wanted tab', () => {
    expect(parentOf('/wanted/post')).toBe('/(tabs)/wanted');
    expect(parentOf('/wanted/post-1?ref=push')).toBe('/(tabs)/wanted');
  });

  it('falls back to the feed for an unrecognised route', () => {
    expect(parentOf('/nonsense')).toBe('/(tabs)/feed');
  });
});
