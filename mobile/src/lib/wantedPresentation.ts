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
  if (input.offerStatus === 'withdrawn' && input.offerRole === 'seller') return { kind: 'make-offer' as const, label: 'Send another offer' };
  if (input.offerStatus) return { kind: 'disabled' as const, label: `Offer ${input.offerStatus}` };
  return { kind: 'make-offer' as const, label: 'Make an offer' };
}

export type WantedOfferAction = 'accept' | 'decline' | 'edit' | 'withdraw' | 'chat' | 'complete' | 'rate' | 'report';
export function wantedOfferActions(input: { role: 'buyer' | 'seller'; offerStatus: WantedOfferStatus; postStatus: WantedPostStatus; neededBy: string; completedAt?: string | null; threadId?: string | null; canComplete?: boolean; canRate?: boolean }, now = new Date()): WantedOfferAction[] {
  const active = input.postStatus === 'active' && new Date(input.neededBy).getTime() > now.getTime();
  if (input.offerStatus === 'pending' && active) return input.role === 'buyer' ? ['accept', 'decline', 'report'] : ['edit', 'withdraw', 'report'];
  if (input.offerStatus === 'accepted') {
    const actions: WantedOfferAction[] = [];
    if (input.threadId) actions.push('chat');
    if (input.completedAt ? input.canRate !== false : input.canComplete !== false) actions.push(input.completedAt ? 'rate' : 'complete');
    actions.push('report');
    return actions;
  }
  return ['report'];
}

export function wantedOfferEntryState(input: { owner: boolean; postStatus: WantedPostStatus; requestedId?: string; existing?: { id: string; role: 'buyer' | 'seller'; status: WantedOfferStatus } }) {
  if (input.owner) return { kind: 'blocked' as const, message: 'You cannot offer on your own request.' };
  if (input.postStatus !== 'active') return { kind: 'blocked' as const, message: 'This request is closed.' };
  const offer = input.existing;
  if (!input.requestedId) {
    if (!offer) return { kind: 'new' as const };
    if (offer.role === 'seller' && (offer.status === 'pending' || offer.status === 'withdrawn')) {
      return { kind: 'redirect' as const, offerId: offer.id, label: offer.status === 'withdrawn' ? 'Resubmit withdrawn offer' : 'Edit existing offer' };
    }
    return { kind: 'blocked' as const, message: 'You already have an offer record for this request.' };
  }
  if (!offer || offer.id !== input.requestedId || offer.role !== 'seller') return { kind: 'blocked' as const, message: 'This offer is unavailable or you do not have access.' };
  if (offer.status === 'pending') return { kind: 'edit' as const };
  if (offer.status === 'withdrawn') return { kind: 'resubmit' as const };
  return { kind: 'blocked' as const, message: 'Only your pending or withdrawn offer can be changed.' };
}

export function wantedOfferMutationId(requestedId: string | undefined, generatedNewId: string): string {
  return requestedId ?? generatedNewId;
}

export function referencePhotoPath(url: string, ownerId: string): string | null {
  try {
    const marker = '/storage/v1/object/public/wanted-reference-photos/';
    const index = new URL(url).pathname.indexOf(marker);
    if (index < 0) return null;
    const path = decodeURIComponent(new URL(url).pathname.slice(index + marker.length));
    return path.startsWith(`${ownerId}/`) ? path : null;
  } catch { return null; }
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
