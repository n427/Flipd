export type WantedOfferRole = 'buyer' | 'seller';

export function parseWantedOfferRole(value: string | null): WantedOfferRole | null {
  return value === 'buyer' || value === 'seller' ? value : null;
}

export function wantedOfferParticipantColumn(role: WantedOfferRole): 'buyer_id' | 'seller_id' {
  return role === 'buyer' ? 'buyer_id' : 'seller_id';
}
