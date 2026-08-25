import type { WantedOfferStatus, WantedPostStatus } from './wanted';

export function wantedCardCopy(source: { max_budget: number; needed_by: string; offer_count: number }, now = new Date()) {
  const deadline = new Date(source.needed_by);
  return {
    budget: `Up to $${source.max_budget.toLocaleString('en-US')}`,
    deadline: deadline.getTime() <= now.getTime() ? 'Expired' : `Needed by ${deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })}`,
    offers: source.offer_count === 0 ? 'No offers yet' : `${source.offer_count} offer${source.offer_count === 1 ? '' : 's'}`,
  };
}

const OFFER_LABELS: Record<WantedOfferStatus, string> = {
  pending: 'Pending', accepted: 'Accepted', declined: 'Declined', withdrawn: 'Withdrawn', expired: 'Expired',
};

export function wantedOfferStatusLabel(status: WantedOfferStatus) { return OFFER_LABELS[status]; }

type ActionInput = {
  owner: boolean;
  postStatus: WantedPostStatus;
  offerStatus?: WantedOfferStatus;
  offerRole?: 'buyer' | 'seller';
  threadId?: string | null;
};

export function wantedActionState(input: ActionInput) {
  if (input.offerStatus === 'accepted' && input.threadId) return { kind: 'open-chat' as const, label: 'Open chat', threadId: input.threadId };
  if (input.owner && input.offerStatus === 'pending' && input.offerRole === 'buyer') return { kind: 'accept-offer' as const, label: 'Accept & open chat' };
  if (!input.owner && input.offerStatus === 'pending' && input.offerRole === 'seller') return { kind: 'edit-offer' as const, label: 'Edit offer' };
  if (input.owner && input.postStatus === 'active') return { kind: 'manage-post' as const, label: 'Edit request' };
  if (input.postStatus === 'expired') return { kind: 'disabled' as const, label: 'Request expired' };
  if (input.postStatus !== 'active') return { kind: 'disabled' as const, label: 'Request closed' };
  return { kind: 'make-offer' as const, label: 'Make an offer' };
}

export function losAngelesEndOfDayUtc(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const noonUtc = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(noonUtc.getTime())) return null;
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' })
    .formatToParts(noonUtc).find((part) => part.type === 'timeZoneName')?.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!offset) return null;
  const minutes = (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) * (offset[1] === '+' ? 1 : -1);
  return new Date(Date.parse(`${date}T23:59:59.000Z`) - minutes * 60_000).toISOString();
}

export function wantedDateInput(timestamp: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
