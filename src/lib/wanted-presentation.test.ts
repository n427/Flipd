import { describe, expect, it } from 'vitest';
import {
  wantedCardCopy,
  wantedOfferStatusLabel,
  wantedRequiredFieldHints,
  wantedDateInput,
  minimumWantedDate,
} from './wanted-presentation';

describe('Wanted presentation', () => {
  it('shows deadline and budget without exposing private offer data', () => {
    expect(wantedCardCopy({
      max_budget: 80,
      needed_by: '2026-09-01T12:00:00Z',
      offer_count: 3,
    }, new Date('2026-08-25T12:00:00Z'))).toEqual({
      budget: 'Up to $80', deadline: 'Needed by Sep 1', offers: '3 offers',
    });
  });

  it('uses correct zero and one offer grammar and marks elapsed deadlines expired', () => {
    expect(wantedCardCopy({ max_budget: 1_200, needed_by: '2026-09-01T12:00:00Z', offer_count: 0 }, new Date('2026-08-25T12:00:00Z')).offers).toBe('No offers yet');
    expect(wantedCardCopy({ max_budget: 10, needed_by: '2026-09-01T12:00:00Z', offer_count: 1 }, new Date('2026-08-25T12:00:00Z')).offers).toBe('1 offer');
    expect(wantedCardCopy({ max_budget: 1_200, needed_by: '2026-08-20T12:00:00Z', offer_count: 2 }, new Date('2026-08-25T12:00:00Z'))).toEqual({
      budget: 'Up to $1,200', deadline: 'Expired', offers: '2 offers',
    });
  });

  it('uses friendly offer labels', () => {
    expect(wantedOfferStatusLabel('pending')).toBe('Pending');
    expect(wantedOfferStatusLabel('accepted')).toBe('Accepted');
    expect(wantedOfferStatusLabel('declined')).toBe('Declined');
    expect(wantedOfferStatusLabel('withdrawn')).toBe('Withdrawn');
    expect(wantedOfferStatusLabel('expired')).toBe('Expired');
  });

  it('returns literal required-field hints for post and offer forms', () => {
    expect(wantedRequiredFieldHints('post')).toEqual([
      'a title', 'a category', 'a maximum budget', 'a meetup area', 'a description', 'a needed-by date',
    ]);
    expect(wantedRequiredFieldHints('offer')).toEqual([
      'at least one photo', 'an offered price', 'a condition or description', 'a message',
    ]);
  });

  it('round-trips a Los Angeles end-of-day deadline to its calendar date', () => {
    expect(wantedDateInput('2026-09-02T06:59:59.000Z')).toBe('2026-09-01');
  });

  it('derives tomorrow from the Los Angeles calendar at the UTC date boundary', () => {
    expect(minimumWantedDate(new Date('2026-08-26T06:30:00.000Z'))).toBe('2026-08-26');
  });
});
