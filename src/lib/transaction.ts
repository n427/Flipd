import { admin } from './supabase/admin';
import type { TransactionSource } from './wanted-transition';

type SaleTransactionRow = {
  buyer_id: string;
  seller_id: string;
  listing_title: string | null;
  offer: number | null;
  status: string;
  listing?: { title: string; price: number | null } | null;
};

type WantedTransactionRow = {
  buyer_id: string;
  seller_id: string;
  price: number;
  status: string;
  completed_at: string | null;
  wanted_post: { title: string } | null;
};

export type TransactionAdapter = {
  loadSale(id: string, participantId?: string): Promise<SaleTransactionRow | null>;
  loadWanted(id: string, participantId?: string): Promise<WantedTransactionRow | null>;
};

export type NormalizedTransaction = {
  source: TransactionSource;
  buyerId: string;
  sellerId: string;
  title: string;
  price: number | null;
  status: 'approved' | 'completed';
};

export function parseTransactionSourceIds(
  value: { request_id?: unknown; wanted_offer_id?: unknown },
): TransactionSource | null {
  const saleValue = value.request_id;
  const wantedValue = value.wanted_offer_id;
  if (saleValue != null && typeof saleValue !== 'string') return null;
  if (wantedValue != null && typeof wantedValue !== 'string') return null;
  const saleId = typeof saleValue === 'string' ? saleValue.trim() : '';
  const wantedId = typeof wantedValue === 'string' ? wantedValue.trim() : '';
  if (Boolean(saleId) === Boolean(wantedId)) return null;
  return saleId ? { kind: 'sale', id: saleId } : { kind: 'wanted', id: wantedId };
}

const databaseTransactionAdapter: TransactionAdapter = {
  async loadSale(id, participantId) {
    let query = admin
      .from('reveal_requests')
      .select('buyer_id, seller_id, listing_title, offer, status, listing:listings(title, price)')
      .eq('id', id);
    if (participantId) {
      query = query.or(`buyer_id.eq.${participantId},seller_id.eq.${participantId}`);
    }
    const { data } = await query.maybeSingle();
    return data as unknown as SaleTransactionRow | null;
  },
  async loadWanted(id, participantId) {
    let query = admin
      .from('wanted_offers')
      .select('buyer_id, seller_id, price, status, completed_at, wanted_post:wanted_posts(title)')
      .eq('id', id);
    if (participantId) {
      query = query.or(`buyer_id.eq.${participantId},seller_id.eq.${participantId}`);
    }
    const { data } = await query.maybeSingle();
    return data as unknown as WantedTransactionRow | null;
  },
};

async function loadTransactionWithScope(
  source: TransactionSource,
  adapter: TransactionAdapter,
  participantId?: string,
): Promise<NormalizedTransaction | null> {
  if (source.kind === 'sale') {
    const row = await adapter.loadSale(source.id, participantId);
    if (!row || (row.status !== 'approved' && row.status !== 'completed')) return null;
    const transaction: NormalizedTransaction = {
      source,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      title: row.listing?.title ?? row.listing_title ?? '',
      price: row.offer ?? row.listing?.price ?? null,
      status: row.status,
    };
    return participantId && !counterpartId(transaction, participantId) ? null : transaction;
  }

  const row = await adapter.loadWanted(source.id, participantId);
  if (!row || row.status !== 'accepted' || !row.wanted_post) return null;
  const transaction: NormalizedTransaction = {
    source,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    title: row.wanted_post.title,
    price: row.price,
    status: row.completed_at ? 'completed' : 'approved',
  };
  return participantId && !counterpartId(transaction, participantId) ? null : transaction;
}

export async function loadTransaction(
  source: TransactionSource,
  adapter: TransactionAdapter = databaseTransactionAdapter,
): Promise<NormalizedTransaction | null> {
  return loadTransactionWithScope(source, adapter);
}

export async function loadTransactionForUser(
  source: TransactionSource,
  userId: string,
  adapter: TransactionAdapter = databaseTransactionAdapter,
): Promise<NormalizedTransaction | null> {
  return loadTransactionWithScope(source, adapter, userId);
}

export function counterpartId(
  transaction: NormalizedTransaction,
  participantId: string,
): string | null {
  if (participantId === transaction.buyerId) return transaction.sellerId;
  if (participantId === transaction.sellerId) return transaction.buyerId;
  return null;
}
