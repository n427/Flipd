import { describe, expect, it } from 'vitest';
import { conversationThumbnail } from './requestPresentation';

describe('conversationThumbnail', () => {
  it('uses the listing photo before the counterpart avatar', () => {
    expect(conversationThumbnail('https://example.test/listing.jpg', 'https://example.test/avatar.jpg')).toBe(
      'https://example.test/listing.jpg',
    );
  });

  it('falls back to the counterpart avatar when the listing has no photo', () => {
    expect(conversationThumbnail(null, 'https://example.test/avatar.jpg')).toBe('https://example.test/avatar.jpg');
  });

  it('returns null when neither image exists', () => {
    expect(conversationThumbnail(null, null)).toBeNull();
  });
});
