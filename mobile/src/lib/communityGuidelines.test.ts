import { describe, expect, it } from 'vitest';
import { COMMUNITY_GUIDELINES } from './legal';

describe('mobile Community Guidelines', () => {
  it('covers the marketplace safety categories reviewers and users need', () => {
    const copy = COMMUNITY_GUIDELINES.sections
      .flatMap((section) => [section.heading, ...section.body])
      .join(' ')
      .toLowerCase();

    for (const topic of [
      'alcohol',
      'drugs',
      'weapons',
      'counterfeit',
      'food',
      'housing',
      'academic cheating',
      'harass',
      'report',
      'block',
      'enforcement',
    ]) {
      expect(copy, `missing ${topic}`).toContain(topic);
    }
  });
});
