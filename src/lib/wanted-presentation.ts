import type { WantedOfferStatus } from './wanted-contract';

type CardSource = { max_budget: number; needed_by: string; offer_count: number };

export function wantedCardCopy(source: CardSource, now = new Date()) {
  const deadline = new Date(source.needed_by);
  return {
    budget: `Up to $${source.max_budget.toLocaleString('en-US')}`,
    deadline: deadline.getTime() <= now.getTime()
      ? 'Expired'
      : `Needed by ${deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}`,
    offers: source.offer_count === 0 ? 'No offers yet' : `${source.offer_count} offer${source.offer_count === 1 ? '' : 's'}`,
  };
}

const OFFER_LABELS: Record<WantedOfferStatus, string> = {
  pending: 'Pending', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn', expired: 'Expired',
};

export function wantedOfferStatusLabel(status: WantedOfferStatus): string {
  return OFFER_LABELS[status];
}

export function wantedRequiredFieldHints(form: 'post' | 'offer'): string[] {
  return form === 'post'
    ? ['a title', 'a category', 'a maximum budget', 'a meetup area', 'a description', 'a needed-by date']
    : ['at least one photo', 'an offered price', 'a condition or description', 'a message'];
}

export function losAngelesEndOfDayUtc(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const noonUtc = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(noonUtc.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset',
  }).formatToParts(noonUtc);
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!offset) return null;
  const minutes = (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) * (offset[1] === '+' ? 1 : -1);
  return new Date(Date.parse(`${date}T23:59:59.000Z`) - minutes * 60_000).toISOString();
}

export function wantedDateInput(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}
